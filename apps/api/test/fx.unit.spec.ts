import { Prisma } from '@prisma/client';
import { ExchangeRatesService } from '../src/modules/exchange-rates/exchange-rates.service';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';

describe('ExchangeRatesService Unit Tests', () => {
  let service: ExchangeRatesService;
  let mockPrisma: {
    exchangeRate: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
    organization: {
      findMany: jest.Mock;
    };
  };
  let mockAudit: {
    record: jest.Mock;
  };

  beforeEach(() => {
    mockPrisma = {
      exchangeRate: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      organization: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    mockAudit = {
      record: jest.fn(),
    };
    service = new ExchangeRatesService(
      mockPrisma as unknown as PrismaService,
      mockAudit as unknown as AuditService,
    );
  });

  it('should return identity rate 1.0 for same currency conversion', async () => {
    const res = await service.getRate('org-123', 'USD', 'USD');
    expect(res.rate.toString()).toBe('1');
    expect(res.provider).toBe('SYSTEM');
  });

  it('should return emergency baseline for CLP when no DB record exists (marked stale)', async () => {
    mockPrisma.exchangeRate.findUnique.mockResolvedValue(null);
    const res = await service.getRate('org-123', 'CLP', 'USD');
    expect(Number(res.rate.toString())).toBeGreaterThan(0);
    expect(res.source).toBe('EMERGENCY_BASELINE');
    expect(res.isStale).toBe(true);
  });

  it('should reflect 2026-08-20 MXN rate when using emergency baseline (16.96 MXN/USD)', async () => {
    mockPrisma.exchangeRate.findUnique.mockResolvedValue(null);
    // 1250 MXN * (1/16.96) ≈ 73.68 — NOT 67.25 (old wrong rate)
    const { usdAmount } = await service.convertToUsd('org-123', '1250', 'MXN');
    const value = Number(usdAmount.toFixed(2));
    // With 0.05897543 rate: 1250 * 0.05897543 = 73.72
    expect(value).toBeGreaterThan(70);
    expect(value).toBeLessThan(80);
    // Must NOT be the old wrong value of 67.25
    expect(value).not.toBe(67.25);
  });

  it('should convert USDT 1:1 to USD', async () => {
    const { usdAmount } = await service.convertToUsd('org-123', '50.00', 'USDT');
    expect(usdAmount.toFixed(2)).toBe('50.00');
  });

  it('should prioritize DB override when active and recent', async () => {
    mockPrisma.exchangeRate.findUnique.mockResolvedValue({
      rate: new Prisma.Decimal('0.05900000'),
      provider: 'MANUAL',
      source: 'MANUAL',
      active: true,
      capturedAt: new Date(),
    });
    const res = await service.getRate('org-123', 'MXN', 'USD');
    expect(res.rate.toString()).toBe('0.059');
    expect(res.provider).toBe('MANUAL');
    expect(res.isStale).toBe(false);
  });

  it('should return live rate from fetchLiveFiatRates and include MXN', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: 'success',
        base_code: 'USD',
        rates: { MXN: 16.9906, CLP: 922.31, BRL: 5.1936 },
      }),
    } as Response);
    const rates = await service.fetchLiveFiatRates();
    expect(rates).not.toBeNull();
    expect(rates!['MXN']).toBeCloseTo(16.99, 1);
  });

  it('should return null from fetchLiveFiatRates on network error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('timeout'));
    const rates = await service.fetchLiveFiatRates();
    expect(rates).toBeNull();
  });

  it('refreshRates seeds live rates when provider available and returns correct count', async () => {
    jest.spyOn(service, 'fetchLiveFiatRates').mockResolvedValue({
      MXN: 16.9906,
      CLP: 922.31,
      BRL: 5.1936,
      PEN: 3.354,
      COP: 3059,
      EUR: 0.856,
    });
    const result = await service.refreshRates('org-123');
    expect(result.source).toBe('LIVE_REFRESH');
    expect(result.updatedCount).toBeGreaterThan(0);
    expect(mockPrisma.exchangeRate.upsert).toHaveBeenCalled();
  });

  it('refreshRates falls back to EMERGENCY_BASELINE when provider unavailable', async () => {
    jest.spyOn(service, 'fetchLiveFiatRates').mockResolvedValue(null);
    const result = await service.refreshRates('org-456');
    expect(result.source).toBe('EMERGENCY_BASELINE_REFRESH');
    expect(mockPrisma.exchangeRate.upsert).toHaveBeenCalled();
  });
});
