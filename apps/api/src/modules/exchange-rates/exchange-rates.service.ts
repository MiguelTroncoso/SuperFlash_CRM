import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
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

/**
 * Emergency baseline rates — used ONLY when the live provider (open.er-api.com)
 * is unavailable AND the DB has no record. Updated to 2026-08-20 reference rates.
 * These are last-resort values and will be clearly tagged as EMERGENCY_BASELINE.
 */
const EMERGENCY_BASELINE_RATES_TO_USD: Record<string, { rate: string; provider: string }> = {
  USD: { rate: '1.00000000', provider: 'SYSTEM' },
  USDT: { rate: '1.00000000', provider: 'SYSTEM' },
  CLP: { rate: '0.00108431', provider: 'EMERGENCY_BASELINE' }, // 922 CLP/USD
  MXN: { rate: '0.05897543', provider: 'EMERGENCY_BASELINE' }, // 16.96 MXN/USD
  PEN: { rate: '0.29814562', provider: 'EMERGENCY_BASELINE' }, // 3.354 PEN/USD
  COP: { rate: '0.00032690', provider: 'EMERGENCY_BASELINE' }, // 3059 COP/USD
  EUR: { rate: '1.16812000', provider: 'EMERGENCY_BASELINE' }, // 0.856 EUR/USD inverted
  ARS: { rate: '0.00066796', provider: 'EMERGENCY_BASELINE' }, // 1497 ARS/USD
  BOB: { rate: '0.08676200', provider: 'EMERGENCY_BASELINE' }, // 11.527 BOB/USD
  BRL: { rate: '0.19261800', provider: 'EMERGENCY_BASELINE' }, // 5.19 BRL/USD
  CRC: { rate: '0.00221950', provider: 'EMERGENCY_BASELINE' }, // 450.59 CRC/USD
  DOP: { rate: '0.01703900', provider: 'EMERGENCY_BASELINE' }, // 58.68 DOP/USD
  GTQ: { rate: '0.13108200', provider: 'EMERGENCY_BASELINE' }, // 7.63 GTQ/USD
  PYG: { rate: '0.00016668', provider: 'EMERGENCY_BASELINE' }, // 5999 PYG/USD
  UYU: { rate: '0.02497200', provider: 'EMERGENCY_BASELINE' }, // 40.05 UYU/USD
  VES: { rate: '0.00128215', provider: 'EMERGENCY_BASELINE' }, // 780 VES/USD
};

/** open.er-api.com — free, no auth required, covers all LatAm currencies */
const ER_API_URL = 'https://open.er-api.com/v6/latest/USD';

/** Currencies covered by open.er-api.com */
const ER_API_SUPPORTED = new Set([
  'CLP',
  'MXN',
  'PEN',
  'COP',
  'EUR',
  'ARS',
  'BOB',
  'BRL',
  'CRC',
  'DOP',
  'GTQ',
  'PYG',
  'UYU',
  'VES',
]);

interface ErApiResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
}

@Injectable()
export class ExchangeRatesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * On application start: fetch live rates and seed all organizations that have no rates yet.
   * Runs non-blocking so it never delays startup.
   */
  async onApplicationBootstrap() {
    setImmediate(() => {
      this.bootstrapLiveRates().catch((err: unknown) => {
        this.logger.error(
          `FX bootstrap error: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    });
  }

  private async bootstrapLiveRates() {
    const liveRates = await this.fetchLiveFiatRates();
    if (!liveRates) {
      this.logger.warn('FX bootstrap: live provider unavailable, will use emergency baseline.');
      return;
    }

    // Find all distinct organizationIds that exist but have no ExchangeRate rows yet
    const orgsWithRates = await this.prisma.exchangeRate.findMany({
      distinct: ['organizationId'],
      select: { organizationId: true },
    });
    const seededSet = new Set(orgsWithRates.map((r) => r.organizationId));

    const allOrgs = await this.prisma.organization.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const org of allOrgs) {
      if (!seededSet.has(org.id)) {
        await this.seedOrgRates(org.id, liveRates, 'BOOT_SEED');
        this.logger.log(`FX bootstrap: seeded rates for org ${org.id}`);
      }
    }
  }

  /**
   * Fetch rates from open.er-api.com (base USD). Returns null on network failure.
   */
  async fetchLiveFiatRates(): Promise<Record<string, number> | null> {
    try {
      const response = await fetch(ER_API_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        this.logger.warn(`open.er-api.com returned HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as ErApiResponse;
      if (data.result !== 'success' || !data.rates) {
        this.logger.warn('open.er-api.com returned unexpected payload');
        return null;
      }
      return data.rates;
    } catch (err: unknown) {
      this.logger.warn(
        `open.er-api.com unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Convert a fiat rate (units-per-USD from open.er-api.com) to a rate-per-unit-to-USD decimal.
   * Example: MXN=16.96 → 1/16.96 = 0.05897543
   */
  private toUsdRate(unitsPerUsd: number): Prisma.Decimal {
    return new Prisma.Decimal((1 / unitsPerUsd).toFixed(8));
  }

  /**
   * Seed or update all rates for a given organization from a live rates map.
   */
  private async seedOrgRates(
    organizationId: string,
    liveRates: Record<string, number>,
    source: string,
    createdById?: string | null,
  ) {
    for (const [currency, baseline] of Object.entries(EMERGENCY_BASELINE_RATES_TO_USD)) {
      if (currency === 'USD') continue;

      let rateDecimal: Prisma.Decimal;
      let providerName: string;

      if (currency === 'USDT') {
        // USDT pegged to USD — Binance confirms ~1.000
        rateDecimal = new Prisma.Decimal('1.00000000');
        providerName = 'SYSTEM';
      } else if (ER_API_SUPPORTED.has(currency) && liveRates[currency] != null) {
        rateDecimal = this.toUsdRate(liveRates[currency]);
        providerName = 'OPEN_ER_API';
      } else {
        rateDecimal = new Prisma.Decimal(baseline.rate);
        providerName = baseline.provider;
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
          source,
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
          source,
          capturedAt: new Date(),
          active: true,
          createdById: createdById ?? null,
        },
      });
    }
  }

  /**
   * Get effective exchange rate from `fromCurrency` to `toCurrency` (default USD).
   * Priority:
   * 1. If from === to → identity 1.0
   * 2. Active DB record for this organization
   * 3. Emergency baseline (last resort, always marked isStale=true)
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
        isStale: ageDays > 7,
      };
    }

    // Last resort: emergency baseline — clearly marked as stale
    const baseline = EMERGENCY_BASELINE_RATES_TO_USD[from];
    if (baseline && to === 'USD') {
      this.logger.warn(
        `FX: Using emergency baseline for ${from}→USD (no DB record for org ${organizationId})`,
      );
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: new Prisma.Decimal(baseline.rate),
        provider: baseline.provider,
        source: 'EMERGENCY_BASELINE',
        capturedAt: new Date(),
        isStale: true,
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

    if (from === 'USD' || from === 'USDT') {
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
        const ageDays = (Date.now() - dbRate.capturedAt.getTime()) / (1000 * 60 * 60 * 24);
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
          isStale: ageDays > 7,
        });
      } else {
        const baseline = EMERGENCY_BASELINE_RATES_TO_USD[curr] ?? {
          rate: '1.00000000',
          provider: 'UNKNOWN',
        };
        result.push({
          id: `baseline-${curr}`,
          fromCurrency: curr,
          toCurrency: 'USD',
          rate: baseline.rate,
          provider: baseline.provider,
          source: 'EMERGENCY_BASELINE',
          active: true,
          capturedAt: new Date().toISOString(),
          isCustom: false,
          isStale: true,
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
   * On-demand refresh of exchange rates from live providers.
   * Fetches from open.er-api.com (fiat) + Binance (USDT).
   * Falls back to emergency baseline per-currency on provider failure.
   */
  async refreshRates(
    organizationId: string,
    user?: AuthenticatedUser,
    metadata?: { ipAddress?: string; requestId?: string },
  ) {
    const liveRates = await this.fetchLiveFiatRates();
    const source = liveRates ? 'LIVE_REFRESH' : 'EMERGENCY_BASELINE_REFRESH';

    if (!liveRates) {
      this.logger.warn(
        `FX refresh for org ${organizationId}: open.er-api.com unavailable, writing emergency baseline.`,
      );
    }

    await this.seedOrgRates(organizationId, liveRates ?? {}, source, user?.userId);

    const updatedCount = Object.keys(EMERGENCY_BASELINE_RATES_TO_USD).length - 1; // exclude USD

    if (user) {
      await this.audit.record({
        organizationId,
        userId: user.userId,
        action: 'EXCHANGE_RATES_REFRESHED',
        tableName: 'ExchangeRate',
        recordId: organizationId,
        newValue: { updatedCount, source, liveRatesAvailable: liveRates !== null },
        ip: metadata?.ipAddress,
        requestId: metadata?.requestId,
      });
    }

    return { updatedCount, source, timestamp: new Date().toISOString() };
  }
}
