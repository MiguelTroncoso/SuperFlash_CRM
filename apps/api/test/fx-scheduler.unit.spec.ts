import { Prisma } from '@prisma/client';
import { FxSchedulerService } from '../src/modules/exchange-rates/fx-scheduler.service';
import { ExchangeRatesService } from '../src/modules/exchange-rates/exchange-rates.service';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';

describe('FxSchedulerService Unit Tests', () => {
  let scheduler: FxSchedulerService;
  let mockPrisma: {
    organization: {
      findMany: jest.Mock;
    };
    fxSchedulerLock: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    exchangeRate: {
      findFirst: jest.Mock;
      count: jest.Mock;
    };
  };
  let mockFx: {
    refreshRates: jest.Mock;
    convertToUsd: jest.Mock;
  };

  beforeEach(() => {
    mockPrisma = {
      organization: {
        findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]),
      },
      fxSchedulerLock: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      exchangeRate: {
        findFirst: jest.fn().mockResolvedValue({
          capturedAt: new Date('2026-08-23T22:00:00Z'),
          provider: 'OPEN_ER_API',
        }),
        count: jest.fn().mockResolvedValue(15),
      },
    };
    mockFx = {
      refreshRates: jest.fn().mockResolvedValue({
        updatedCount: 14,
        source: 'LIVE_REFRESH',
        timestamp: new Date().toISOString(),
      }),
      convertToUsd: jest.fn(),
    };

    scheduler = new FxSchedulerService(
      mockPrisma as unknown as PrismaService,
      mockFx as unknown as ExchangeRatesService,
    );
  });

  it('weeklyRefresh should skip execution when NODE_ENV === test', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      await scheduler.weeklyRefresh();
      expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
      expect(mockFx.refreshRates).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('weeklyRefresh should acquire lock, refresh all orgs, and release lock', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await scheduler.weeklyRefresh();
      expect(mockPrisma.fxSchedulerLock.upsert).toHaveBeenCalled();
      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        select: { id: true },
      });
      expect(mockFx.refreshRates).toHaveBeenCalledTimes(2);
      expect(mockFx.refreshRates).toHaveBeenCalledWith('org-1');
      expect(mockFx.refreshRates).toHaveBeenCalledWith('org-2');
      expect(mockPrisma.fxSchedulerLock.deleteMany).toHaveBeenCalledWith({
        where: { key: 'fx_weekly_refresh' },
      });
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('acquireLock should return false if lock already held and not expired', async () => {
    const futureDate = new Date(Date.now() + 5 * 60 * 1000); // 5 min in future
    mockPrisma.fxSchedulerLock.findUnique.mockResolvedValue({
      key: 'fx_weekly_refresh',
      acquiredAt: new Date(),
      expiresAt: futureDate,
      instanceId: 'other-instance',
    });

    const acquired = await scheduler.acquireLock();
    expect(acquired).toBe(false);
    expect(mockPrisma.fxSchedulerLock.upsert).not.toHaveBeenCalled();
  });

  it('weeklyRefresh should skip if lock is already held', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const futureDate = new Date(Date.now() + 5 * 60 * 1000);
      mockPrisma.fxSchedulerLock.findUnique.mockResolvedValue({
        key: 'fx_weekly_refresh',
        acquiredAt: new Date(),
        expiresAt: futureDate,
        instanceId: 'other-instance',
      });

      await scheduler.weeklyRefresh();
      expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
      expect(mockFx.refreshRates).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('weeklyRefresh should continue processing other orgs if one org fails', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      mockFx.refreshRates
        .mockRejectedValueOnce(new Error('Network error org 1'))
        .mockResolvedValueOnce({ updatedCount: 14, source: 'LIVE_REFRESH' });

      await scheduler.weeklyRefresh();

      expect(mockFx.refreshRates).toHaveBeenCalledTimes(2);
      expect(mockPrisma.fxSchedulerLock.deleteMany).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('getStatus should return correct schedule metadata and next run date', async () => {
    const status = await scheduler.getStatus();
    expect(status.schedule).toBe('0 3 * * 1');
    expect(status.frequency).toBe('weekly');
    expect(status.timezone).toBe('UTC');
    expect(status.currenciesConfigured).toBe(15);
    expect(status.lastProvider).toBe('OPEN_ER_API');
    expect(new Date(status.nextRunAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('historical snapshot integrity: convertToUsd with rateOverride uses snapshot rate', async () => {
    const mockAudit = { record: jest.fn() };
    const fxService = new ExchangeRatesService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
    );

    // Historical sale: 1250 MXN at captured historical rate 0.05896717 -> 73.71 USD
    const historicalSnapshotRate = '0.05896717';
    const result = await fxService.convertToUsd('org-1', '1250', 'MXN', historicalSnapshotRate);

    expect(result.usdAmount.toFixed(2)).toBe('73.71');
    expect(result.rate.toString()).toBe('0.05896717');
    expect(result.provider).toBe('OVERRIDE');
  });

  it('never sets rate to 0 or negative during emergency fallback refresh', async () => {
    const upsertedRates: Prisma.Decimal[] = [];
    const localMockPrisma = {
      exchangeRate: {
        upsert: jest.fn().mockImplementation(({ update }: { update: { rate: Prisma.Decimal } }) => {
          upsertedRates.push(update.rate);
          return Promise.resolve({});
        }),
      },
    };
    const mockAudit = { record: jest.fn() };
    const fxService = new ExchangeRatesService(
      localMockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
    );

    jest.spyOn(fxService, 'fetchLiveFiatRates').mockResolvedValue(null);

    const result = await fxService.refreshRates('org-test');
    expect(result.source).toBe('EMERGENCY_BASELINE_REFRESH');

    // Verify all rates are strictly positive
    expect(upsertedRates.length).toBeGreaterThan(0);
    for (const rate of upsertedRates) {
      expect(rate.toNumber()).toBeGreaterThan(0);
    }
  });
});
