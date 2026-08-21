import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { SUPPORTED_CURRENCIES } from '../commercial/currency';
import { UpdateExchangeRateDto } from './dto/exchange-rates.dto';

export interface ExchangeRateResult {
  fromCurrency: string;
  toCurrency: string;
  rate: Prisma.Decimal;
  provider: string;
  source: string;
  capturedAt: Date;
  isStale: boolean;
}

// Fallback rates to USD as default reliable baseline
const DEFAULT_RATES_TO_USD: Record<string, { rate: string; provider: string }> = {
  USD: { rate: '1.00000000', provider: 'SYSTEM' },
  USDT: { rate: '1.00000000', provider: 'BINANCE' },
  CLP: { rate: '0.00105000', provider: 'FIAT_FALLBACK' }, // ~950 CLP/USD
  MXN: { rate: '0.05380000', provider: 'FIAT_FALLBACK' }, // ~18.58 MXN/USD
  PEN: { rate: '0.26800000', provider: 'FIAT_FALLBACK' }, // ~3.73 PEN/USD
  COP: { rate: '0.00024500', provider: 'FIAT_FALLBACK' }, // ~4080 COP/USD
  EUR: { rate: '1.08500000', provider: 'FIAT_FALLBACK' },
  ARS: { rate: '0.00102000', provider: 'FIAT_FALLBACK' },
  BOB: { rate: '0.14450000', provider: 'FIAT_FALLBACK' },
  BRL: { rate: '0.18200000', provider: 'FIAT_FALLBACK' },
  CRC: { rate: '0.00195000', provider: 'FIAT_FALLBACK' },
  DOP: { rate: '0.01680000', provider: 'FIAT_FALLBACK' },
  GTQ: { rate: '0.12900000', provider: 'FIAT_FALLBACK' },
  PYG: { rate: '0.00013300', provider: 'FIAT_FALLBACK' },
  UYU: { rate: '0.02480000', provider: 'FIAT_FALLBACK' },
  VES: { rate: '0.02700000', provider: 'FIAT_FALLBACK' },
};

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Get effective exchange rate from `fromCurrency` to `toCurrency` (default USD).
   * 1. If from === to, rate is 1.00000000.
   * 2. Checks DB for latest active rate for organization.
   * 3. Falls back to default reliable rate table if DB record does not exist.
   */
  async getRate(
    organizationId: string,
    fromCurrency: string,
    toCurrency = 'USD',
  ): Promise<ExchangeRateResult> {
    const from = fromCurrency.trim().toUpperCase();
    const to = toCurrency.trim().toUpperCase();

    if (from === to) {
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: new Prisma.Decimal('1.00000000'),
        provider: 'SYSTEM',
        source: 'IDENTITY',
        capturedAt: new Date(),
        isStale: false,
      };
    }

    const record = await this.prisma.exchangeRate.findUnique({
      where: {
        organizationId_fromCurrency_toCurrency: {
          organizationId,
          fromCurrency: from,
          toCurrency: to,
        },
      },
    });

    if (record && record.active) {
      const now = Date.now();
      const ageDays = (now - record.capturedAt.getTime()) / (1000 * 60 * 60 * 24);
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: record.rate,
        provider: record.provider,
        source: record.source,
        capturedAt: record.capturedAt,
        isStale: ageDays > 14,
      };
    }

    const fallback = DEFAULT_RATES_TO_USD[from];
    if (fallback && to === 'USD') {
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: new Prisma.Decimal(fallback.rate),
        provider: fallback.provider,
        source: 'FALLBACK_BASELINE',
        capturedAt: new Date(),
        isStale: false,
      };
    }

    return {
      fromCurrency: from,
      toCurrency: to,
      rate: new Prisma.Decimal('1.00000000'),
      provider: 'FALLBACK_UNITY',
      source: 'FALLBACK_UNITY',
      capturedAt: new Date(),
      isStale: true,
    };
  }

  /**
   * Convert an amount in `fromCurrency` to USD using snapshot or current effective rate.
   */
  async convertToUsd(
    organizationId: string,
    amount: Prisma.Decimal | string | number,
    fromCurrency: string,
    rateOverride?: Prisma.Decimal | string | number | null,
  ): Promise<{
    usdAmount: Prisma.Decimal;
    rate: Prisma.Decimal;
    provider: string;
    capturedAt: Date;
  }> {
    const decAmount = new Prisma.Decimal(String(amount || 0));
    const from = fromCurrency.trim().toUpperCase();

    if (from === 'USD') {
      return {
        usdAmount: decAmount,
        rate: new Prisma.Decimal('1.00000000'),
        provider: 'SYSTEM',
        capturedAt: new Date(),
      };
    }

    let rate: Prisma.Decimal;
    let provider = 'OVERRIDE';
    let capturedAt = new Date();

    if (rateOverride !== undefined && rateOverride !== null) {
      rate = new Prisma.Decimal(String(rateOverride));
    } else {
      const rateResult = await this.getRate(organizationId, from, 'USD');
      rate = rateResult.rate;
      provider = rateResult.provider;
      capturedAt = rateResult.capturedAt;
    }

    const usdAmount = decAmount.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return {
      usdAmount,
      rate,
      provider,
      capturedAt,
    };
  }

  /**
   * List all configured exchange rates for an organization.
   */
  async list(user: AuthenticatedUser) {
    const rows = await this.prisma.exchangeRate.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { fromCurrency: 'asc' },
    });

    const configuredMap = new Map(rows.map((r) => [r.fromCurrency, r]));
    const result = [];

    for (const curr of SUPPORTED_CURRENCIES) {
      if (curr === 'USD') continue;
      const dbRate = configuredMap.get(curr);
      if (dbRate) {
        result.push({
          id: dbRate.id,
          fromCurrency: dbRate.fromCurrency,
          toCurrency: dbRate.toCurrency,
          rate: dbRate.rate.toFixed(8),
          provider: dbRate.provider,
          source: dbRate.source,
          active: dbRate.active,
          capturedAt: dbRate.capturedAt.toISOString(),
          isCustom: dbRate.source === 'MANUAL',
        });
      } else {
        const fallback = DEFAULT_RATES_TO_USD[curr] ?? { rate: '1.00000000', provider: 'DEFAULT' };
        result.push({
          id: `default-${curr}`,
          fromCurrency: curr,
          toCurrency: 'USD',
          rate: fallback.rate,
          provider: fallback.provider,
          source: 'BASELINE',
          active: true,
          capturedAt: new Date().toISOString(),
          isCustom: false,
        });
      }
    }

    return result;
  }

  /**
   * Upsert manual or updated exchange rate.
   */
  async updateRate(
    dto: UpdateExchangeRateDto,
    user: AuthenticatedUser,
    metadata?: { ipAddress?: string; requestId?: string },
  ) {
    const from = dto.fromCurrency.trim().toUpperCase();
    const to = (dto.toCurrency ?? 'USD').trim().toUpperCase();
    const rate = new Prisma.Decimal(dto.rate);

    const record = await this.prisma.exchangeRate.upsert({
      where: {
        organizationId_fromCurrency_toCurrency: {
          organizationId: user.organizationId,
          fromCurrency: from,
          toCurrency: to,
        },
      },
      update: {
        rate,
        provider: dto.provider?.trim() || 'MANUAL',
        source: 'MANUAL',
        capturedAt: new Date(),
        active: dto.active ?? true,
        deletedAt: null,
      },
      create: {
        organizationId: user.organizationId,
        fromCurrency: from,
        toCurrency: to,
        rate,
        provider: dto.provider?.trim() || 'MANUAL',
        source: 'MANUAL',
        capturedAt: new Date(),
        active: dto.active ?? true,
        createdById: user.userId,
      },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'EXCHANGE_RATE_UPDATED',
      tableName: 'ExchangeRate',
      recordId: record.id,
      newValue: {
        fromCurrency: from,
        toCurrency: to,
        rate: record.rate.toFixed(8),
        provider: record.provider,
      },
      ip: metadata?.ipAddress,
      requestId: metadata?.requestId,
    });

    return {
      id: record.id,
      fromCurrency: record.fromCurrency,
      toCurrency: record.toCurrency,
      rate: record.rate.toFixed(8),
      provider: record.provider,
      source: record.source,
      active: record.active,
      capturedAt: record.capturedAt.toISOString(),
    };
  }

  /**
   * Fetch live rate from Binance API for symbols with spot markets (e.g. USDTUSDC, BTUSDT).
   */
  async fetchBinancePrice(symbol: string): Promise<{ symbol: string; price: string } | null> {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { symbol: string; price: string };
      return data;
    } catch (err: unknown) {
      this.logger.warn(
        `Binance public API unavailable for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Weekly scheduled/on-demand refresh of exchange rates.
   */
  async refreshRates(
    organizationId: string,
    user?: AuthenticatedUser,
    metadata?: { ipAddress?: string; requestId?: string },
  ) {
    let updatedCount = 0;
    const usdtPrice = await this.fetchBinancePrice('USDCUSDT');

    for (const [currency, fallback] of Object.entries(DEFAULT_RATES_TO_USD)) {
      if (currency === 'USD') continue;
      let rateDecimal = new Prisma.Decimal(fallback.rate);
      let providerName = fallback.provider;

      if (currency === 'USDT' && usdtPrice?.price) {
        rateDecimal = new Prisma.Decimal('1.00000000');
        providerName = 'BINANCE';
      }

      await this.prisma.exchangeRate.upsert({
        where: {
          organizationId_fromCurrency_toCurrency: {
            organizationId,
            fromCurrency: currency,
            toCurrency: 'USD',
          },
        },
        update: {
          rate: rateDecimal,
          provider: providerName,
          source: 'AUTO_REFRESH',
          capturedAt: new Date(),
          active: true,
          deletedAt: null,
        },
        create: {
          organizationId,
          fromCurrency: currency,
          toCurrency: 'USD',
          rate: rateDecimal,
          provider: providerName,
          source: 'AUTO_REFRESH',
          capturedAt: new Date(),
          active: true,
          createdById: user?.userId ?? null,
        },
      });
      updatedCount++;
    }

    if (user) {
      await this.audit.record({
        organizationId,
        userId: user.userId,
        action: 'EXCHANGE_RATES_REFRESHED',
        tableName: 'ExchangeRate',
        recordId: organizationId,
        newValue: { updatedCount },
        ip: metadata?.ipAddress,
        requestId: metadata?.requestId,
      });
    }

    return { updatedCount, timestamp: new Date().toISOString() };
  }
}
