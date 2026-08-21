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
  };
  let mockAudit: {
    record: jest.Mock;
  };

  beforeEach(() => {
    mockPrisma = {
      exchangeRate: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
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

  it('should return default fallback rate for CLP when no DB record exists', async () => {
    mockPrisma.exchangeRate.findUnique.mockResolvedValue(null);
    const res = await service.getRate('org-123', 'CLP', 'USD');
    expect(Number(res.rate.toString())).toBeGreaterThan(0);
    expect(res.provider).toBe('FIAT_FALLBACK');
  });

  it('should convert amount to USD accurately using conversion rate', async () => {
    mockPrisma.exchangeRate.findUnique.mockResolvedValue(null);
    // CLP default is 0.00105000 (~950 CLP/USD) -> 10000 * 0.00105 = 10.50
    const { usdAmount } = await service.convertToUsd('org-123', '10000', 'CLP');
    expect(usdAmount.toFixed(2)).toBe('10.50');
  });

  it('should convert USDT 1:1 to USD', async () => {
    const { usdAmount } = await service.convertToUsd('org-123', '50.00', 'USDT');
    expect(usdAmount.toFixed(2)).toBe('50.00');
  });

  it('should prioritize DB override when active and recent', async () => {
    mockPrisma.exchangeRate.findUnique.mockResolvedValue({
      rate: new Prisma.Decimal('0.00110000'),
      provider: 'MANUAL',
      source: 'MANUAL',
      active: true,
      capturedAt: new Date(),
    });
    const res = await service.getRate('org-123', 'CLP', 'USD');
    expect(res.rate.toString()).toBe('0.0011');
    expect(res.provider).toBe('MANUAL');
  });
});
