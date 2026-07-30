import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  WhatsAppReadOnlyAnalyticsService,
  WhatsAppReadOnlyMetrics,
} from '../communication/services/whatsapp-readonly-analytics.service';
import { RevenueQueryDto } from './dto/revenue-query.dto';
import { buildHistoricalTrendForecast } from './forecast';
import {
  RevenueCohortRow,
  RevenueConversionRow,
  RevenueDashboard,
  RevenueFilters,
  RevenueForecast,
  RevenueForecastPoint,
  RevenueFunnelResult,
  RevenueFunnelStage,
  RevenueKpis,
  RevenueMoneyMetric,
  RevenueTrendPoint,
} from './revenue-intelligence.types';

interface MoneyRow {
  currency: string;
  amount: unknown;
  count: unknown;
}

interface ConversionRow {
  key: string;
  label: string;
  opportunities: unknown;
  conversions: unknown;
}

interface NumberRow {
  value: unknown;
}

interface TrendRow {
  metric_date: unknown;
  currency: string;
  revenue: unknown;
  sales: unknown;
  customers: unknown;
}

interface CohortRow {
  cohort_month: unknown;
  period: unknown;
  acquired: unknown;
  retained: unknown;
  revenue: unknown;
  currency: string;
}

interface MonthlyRevenueRow {
  metric_month: unknown;
  currency: string;
  revenue: unknown;
}

interface MaterializedViewRow {
  matviewname: string;
  ispopulated: boolean;
}

interface DateRange {
  from: Date;
  to: Date;
}

const DEFAULT_FUNNEL = [
  ['MESSAGE', 'Mensaje'],
  ['DEMO', 'Demo'],
  ['POTENTIAL_BUYER', 'Posible comprador'],
  ['SALE', 'Venta'],
  ['ACTIVATION', 'Activación'],
  ['RENEWAL', 'Renovación'],
] as const;

const FUNNEL_LABELS: Readonly<Record<string, string>> = Object.fromEntries(DEFAULT_FUNNEL);

function numeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value !== null && typeof value === 'object') {
    const stringValue = String(value);
    const parsed = Number(stringValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function decimal(value: unknown): string {
  return numeric(value).toFixed(2);
}

function dateKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function monthKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  return String(value).slice(0, 7);
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
}

@Injectable()
export class RevenueIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappReadOnlyAnalytics: WhatsAppReadOnlyAnalyticsService,
  ) {}

  async getDashboard(query: RevenueQueryDto, user: AuthenticatedUser): Promise<RevenueDashboard> {
    const filters = this.filters(query, user);
    const [kpis, trends, funnel, forecast, communication] = await Promise.all([
      this.getKpisForFilters(filters),
      this.trendsForFilters(filters),
      this.funnelForFilters(filters, query),
      this.forecastForFilters(filters, query.horizon),
      this.whatsappReadOnlyAnalytics.get(user.organizationId, filters.from, filters.to),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.publicFilters(filters),
      kpis,
      trends,
      funnel,
      forecast,
      communication,
    };
  }

  async getKpis(query: RevenueQueryDto, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const filters = this.filters(query, user);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.publicFilters(filters),
      data: await this.getKpisForFilters(filters),
    };
  }

  async getFunnel(
    query: RevenueQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const filters = this.filters(query, user);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.publicFilters(filters),
      data: await this.funnelForFilters(filters, query),
    };
  }

  async getCohorts(
    query: RevenueQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const filters = this.filters(query, user);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.publicFilters(filters),
      data: await this.cohortsForFilters(filters),
    };
  }

  async getTrends(
    query: RevenueQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const filters = this.filters(query, user);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.publicFilters(filters),
      data: await this.trendsForFilters(filters),
    };
  }

  async getForecast(
    query: RevenueQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const filters = this.filters(query, user);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.publicFilters(filters),
      data: await this.forecastForFilters(filters, query.horizon),
    };
  }

  async getCommunicationMetrics(
    query: RevenueQueryDto,
    user: AuthenticatedUser,
  ): Promise<WhatsAppReadOnlyMetrics> {
    const filters = this.filters(query, user);
    return this.whatsappReadOnlyAnalytics.get(user.organizationId, filters.from, filters.to);
  }

  async getMaterializedViewStatus(user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const rows = await this.prisma.$queryRaw<MaterializedViewRow[]>(Prisma.sql`
      SELECT matviewname, ispopulated
      FROM pg_matviews
      WHERE schemaname = current_schema()
        AND matviewname IN ('revenue_sales_daily', 'revenue_subscriptions_monthly', 'revenue_funnel_daily')
      ORDER BY matviewname
    `);
    return {
      organizationId: user.organizationId,
      views: rows.map((row) => ({ name: row.matviewname, populated: row.ispopulated })),
      refreshCommand: 'npm run db:refresh-revenue-views',
    };
  }

  private filters(query: RevenueQueryDto, user: AuthenticatedUser): RevenueFilters {
    const now = new Date();
    const to = query.to ? this.parseDate(query.to, false) : now;
    const from = query.from
      ? this.parseDate(query.from, true)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (from > to) throw new BadRequestException('El rango de fechas no es válido.');
    const country = query.country?.trim().toUpperCase();
    const currency = query.currency?.trim().toUpperCase();
    return {
      organizationId: user.organizationId,
      from,
      to,
      ...(country ? { country } : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.providerId ? { providerId: query.providerId } : {}),
      ...(currency ? { currency } : {}),
    };
  }

  private parseDate(value: string, start: boolean): Date {
    const parsed = new Date(
      value.length === 10 ? `${value}T${start ? '00:00:00.000' : '23:59:59.999'}Z` : value,
    );
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('La fecha no es válida.');
    return parsed;
  }

  private publicFilters(filters: RevenueFilters): Omit<RevenueFilters, 'organizationId'> {
    return {
      from: filters.from,
      to: filters.to,
      ...(filters.country ? { country: filters.country } : {}),
      ...(filters.sellerId ? { sellerId: filters.sellerId } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.providerId ? { providerId: filters.providerId } : {}),
      ...(filters.currency ? { currency: filters.currency } : {}),
    };
  }

  private ref(alias: string, column: string): Prisma.Sql {
    return Prisma.raw(`"${alias}"."${column}"`);
  }

  private where(parts: Prisma.Sql[]): Prisma.Sql {
    return Prisma.sql`WHERE ${Prisma.join(parts, ' AND ')}`;
  }

  private saleConditions(
    filters: RevenueFilters,
    range: DateRange = filters,
    alias = 's',
  ): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`${this.ref(alias, 'organizationId')} = ${filters.organizationId}::uuid`,
      Prisma.sql`${this.ref(alias, 'deletedAt')} IS NULL`,
      Prisma.sql`${this.ref(alias, 'status')} IN ('CONFIRMED', 'FULFILLED')`,
      Prisma.sql`COALESCE(${this.ref(alias, 'soldAt')}, ${this.ref(alias, 'createdAt')}) BETWEEN ${range.from} AND ${range.to}`,
    ];
    if (filters.country) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Contact" cf WHERE cf."organizationId" = ${this.ref(alias, 'organizationId')} AND cf."id" = ${this.ref(alias, 'contactId')} AND cf."country" = ${filters.country})`,
      );
    }
    if (filters.sellerId)
      conditions.push(Prisma.sql`${this.ref(alias, 'userId')} = ${filters.sellerId}::uuid`);
    if (filters.currency)
      conditions.push(Prisma.sql`${this.ref(alias, 'currency')} = ${filters.currency}`);
    if (filters.productId) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "SaleItem" sif WHERE sif."organizationId" = ${this.ref(alias, 'organizationId')} AND sif."saleId" = ${this.ref(alias, 'id')} AND sif."productId" = ${filters.productId}::uuid AND sif."deletedAt" IS NULL)`,
      );
    }
    if (filters.providerId) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Fulfillment" ff WHERE ff."organizationId" = ${this.ref(alias, 'organizationId')} AND ff."saleId" = ${this.ref(alias, 'id')} AND ff."providerId" = ${filters.providerId}::uuid AND ff."deletedAt" IS NULL)`,
      );
    }
    return conditions;
  }

  private subscriptionConditions(filters: RevenueFilters, alias = 's'): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`${this.ref(alias, 'organizationId')} = ${filters.organizationId}::uuid`,
      Prisma.sql`${this.ref(alias, 'deletedAt')} IS NULL`,
    ];
    if (filters.country) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Contact" cf WHERE cf."organizationId" = ${this.ref(alias, 'organizationId')} AND cf."id" = ${this.ref(alias, 'contactId')} AND cf."country" = ${filters.country})`,
      );
    }
    if (filters.sellerId)
      conditions.push(Prisma.sql`${this.ref(alias, 'userId')} = ${filters.sellerId}::uuid`);
    if (filters.productId)
      conditions.push(Prisma.sql`${this.ref(alias, 'productId')} = ${filters.productId}::uuid`);
    if (filters.currency)
      conditions.push(Prisma.sql`${this.ref(alias, 'currency')} = ${filters.currency}`);
    if (filters.providerId) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Fulfillment" sf WHERE sf."organizationId" = ${this.ref(alias, 'organizationId')} AND sf."subscriptionId" = ${this.ref(alias, 'id')} AND sf."providerId" = ${filters.providerId}::uuid AND sf."deletedAt" IS NULL)`,
      );
    }
    return conditions;
  }

  private async getKpisForFilters(filters: RevenueFilters): Promise<RevenueKpis> {
    const dayStart = new Date(
      Date.UTC(filters.to.getUTCFullYear(), filters.to.getUTCMonth(), filters.to.getUTCDate()),
    );
    const monthStart = new Date(Date.UTC(filters.to.getUTCFullYear(), filters.to.getUTCMonth(), 1));
    const [
      salesToday,
      salesMonth,
      mrr,
      newCustomers,
      activeCustomers,
      lostCustomers,
      timings,
      renewals,
      churn,
      trialConversion,
      averageTicket,
      byStage,
      bySeller,
      byCountry,
    ] = await Promise.all([
      this.moneyForSales(filters, { from: dayStart, to: filters.to }),
      this.moneyForSales(filters, { from: monthStart, to: filters.to }),
      this.mrr(filters),
      this.newCustomers(filters),
      this.activeCustomers(filters),
      this.lostCustomers(filters),
      this.timings(filters),
      this.successfulRenewals(filters),
      this.churnRate(filters),
      this.trialToSaleRate(filters),
      this.moneyForSales(filters),
      this.conversionByStage(filters),
      this.conversionBySeller(filters),
      this.conversionByCountry(filters),
    ]);
    const ltvBasic = averageTicket.map((metric) => ({
      ...metric,
      amount: (Number(metric.amount) / Math.max(churn, 0.01)).toFixed(2),
    }));
    return {
      salesToday,
      salesMonth,
      mrr,
      arr: mrr.map((metric) => ({ ...metric, amount: (Number(metric.amount) * 12).toFixed(2) })),
      newCustomers,
      activeCustomers,
      lostCustomers,
      averageTimeToSaleDays: timings.timeToSale,
      averageActivationDays: timings.activation,
      averageCloseDays: timings.close,
      successfulRenewals: renewals,
      churnRate: churn,
      trialToSaleRate: trialConversion,
      averageTicket,
      ltvBasic,
      conversionByStage: byStage,
      conversionBySeller: bySeller,
      conversionByCountry: byCountry,
    };
  }

  private async moneyForSales(
    filters: RevenueFilters,
    range: DateRange = filters,
  ): Promise<RevenueMoneyMetric[]> {
    const rows = await this.prisma.$queryRaw<MoneyRow[]>(Prisma.sql`
      SELECT s."currency" AS currency, COALESCE(SUM(s."total"), 0) AS amount, COUNT(*)::integer AS count
      FROM "Sale" s
      ${this.where(this.saleConditions(filters, range))}
      GROUP BY s."currency"
      ORDER BY s."currency"
    `);
    return rows.map((row) => ({
      currency: row.currency,
      amount: decimal(row.amount),
      count: numeric(row.count),
    }));
  }

  private async mrr(filters: RevenueFilters): Promise<RevenueMoneyMetric[]> {
    const rows = await this.prisma.$queryRaw<MoneyRow[]>(Prisma.sql`
      SELECT s."currency" AS currency,
        COALESCE(SUM(CASE s."billingCycle"
          WHEN 'WEEKLY' THEN s."amount" * 52 / 12
          WHEN 'MONTHLY' THEN s."amount"
          WHEN 'QUARTERLY' THEN s."amount" / 3
          WHEN 'SEMI_ANNUAL' THEN s."amount" / 6
          WHEN 'ANNUAL' THEN s."amount" / 12
          WHEN 'CUSTOM' THEN s."amount" * 30 / NULLIF(s."customIntervalDays", 0)
          ELSE 0 END), 0) AS amount,
        COUNT(*)::integer AS count
      FROM "Subscription" s
      ${this.where([...this.subscriptionConditions(filters), Prisma.sql`s."status" = 'ACTIVE'`])}
      GROUP BY s."currency"
      ORDER BY s."currency"
    `);
    return rows.map((row) => ({
      currency: row.currency,
      amount: decimal(row.amount),
      count: numeric(row.count),
    }));
  }

  private async newCustomers(filters: RevenueFilters): Promise<number> {
    const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
      SELECT COUNT(*)::integer AS value
      FROM (
        SELECT s."contactId"
        FROM "Sale" s
        ${this.where(this.saleConditions(filters))}
        GROUP BY s."contactId"
        HAVING MIN(COALESCE(s."soldAt", s."createdAt")) BETWEEN ${filters.from} AND ${filters.to}
      ) first_customers
    `);
    return numeric(rows[0]?.value);
  }

  private async activeCustomers(filters: RevenueFilters): Promise<number> {
    const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT s."contactId")::integer AS value
      FROM "Sale" s
      ${this.where(this.saleConditions(filters))}
    `);
    return numeric(rows[0]?.value);
  }

  private async lostCustomers(filters: RevenueFilters): Promise<number> {
    const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
      SELECT COUNT(*)::integer AS value
      FROM "Contact" c
      WHERE c."organizationId" = ${filters.organizationId}::uuid
        AND c."deletedAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM "Sale" previous_sale
          WHERE previous_sale."organizationId" = c."organizationId"
            AND previous_sale."contactId" = c."id"
            AND previous_sale."deletedAt" IS NULL
            AND previous_sale.status IN ('CONFIRMED', 'FULFILLED')
            AND COALESCE(previous_sale."soldAt", previous_sale."createdAt") < ${filters.from}
        )
        AND NOT EXISTS (
          SELECT 1 FROM "Sale" recent_sale
          WHERE recent_sale."organizationId" = c."organizationId"
            AND recent_sale."contactId" = c."id"
            AND recent_sale."deletedAt" IS NULL
            AND recent_sale.status IN ('CONFIRMED', 'FULFILLED')
            AND COALESCE(recent_sale."soldAt", recent_sale."createdAt") BETWEEN ${filters.from} AND ${filters.to}
        )
    `);
    return numeric(rows[0]?.value);
  }

  private async timings(
    filters: RevenueFilters,
  ): Promise<{ timeToSale: number; activation: number; close: number }> {
    const rows = await this.prisma.$queryRaw<
      { time_to_sale: unknown; close_days: unknown; activation_days: unknown }[]
    >(Prisma.sql`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(s."soldAt", s."createdAt") - o."createdAt")) / 86400), 0) AS time_to_sale,
        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(s."soldAt", s."createdAt") - o."createdAt")) / 86400), 0) AS close_days,
        0 AS activation_days
      FROM "Sale" s
      LEFT JOIN "Opportunity" o ON o."organizationId" = s."organizationId" AND o."id" = s."opportunityId"
      ${this.where(this.saleConditions(filters))}
    `);
    const activationRows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (a."activatedAt" - COALESCE(s."soldAt", s."createdAt"))) / 86400), 0) AS value
      FROM "Activation" a
      JOIN "Fulfillment" f ON f."organizationId" = a."organizationId" AND f."id" = a."fulfillmentId"
      JOIN "Sale" s ON s."organizationId" = f."organizationId" AND s."id" = f."saleId"
      WHERE a."organizationId" = ${filters.organizationId}::uuid
        AND a."deletedAt" IS NULL AND a."activatedAt" IS NOT NULL
        AND COALESCE(s."soldAt", s."createdAt") BETWEEN ${filters.from} AND ${filters.to}
    `);
    return {
      timeToSale: Number(numeric(rows[0]?.time_to_sale).toFixed(2)),
      close: Number(numeric(rows[0]?.close_days).toFixed(2)),
      activation: Number(numeric(activationRows[0]?.value).toFixed(2)),
    };
  }

  private async successfulRenewals(filters: RevenueFilters): Promise<number> {
    const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
      SELECT COUNT(*)::integer AS value FROM "Renewal" r
      WHERE r."organizationId" = ${filters.organizationId}::uuid
        AND r."deletedAt" IS NULL AND r.status = 'PAID'
        AND r."paidAt" BETWEEN ${filters.from} AND ${filters.to}
    `);
    return numeric(rows[0]?.value);
  }

  private async churnRate(filters: RevenueFilters): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ churned: unknown; base: unknown }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE s.status IN ('EXPIRED', 'CANCELLED') AND COALESCE(s."expiredAt", s."cancelledAt", s."updatedAt") BETWEEN ${filters.from} AND ${filters.to}) AS churned,
        COUNT(*) FILTER (WHERE s."startsAt" < ${filters.from} AND (s."cancelledAt" IS NULL OR s."cancelledAt" >= ${filters.from})) AS base
      FROM "Subscription" s
      ${this.where(this.subscriptionConditions(filters))}
    `);
    return Number(percentage(numeric(rows[0]?.churned), numeric(rows[0]?.base)).toFixed(2));
  }

  private async trialToSaleRate(filters: RevenueFilters): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ converted: unknown; total: unknown }[]>(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE t.status = 'CONVERTED') AS converted,
        COUNT(*) FILTER (WHERE t.status <> 'CANCELLED') AS total
      FROM "Trial" t
      WHERE t."organizationId" = ${filters.organizationId}::uuid
        AND t."deletedAt" IS NULL AND t."createdAt" BETWEEN ${filters.from} AND ${filters.to}
        ${filters.country ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Contact" tc WHERE tc."organizationId" = t."organizationId" AND tc."id" = t."contactId" AND tc."country" = ${filters.country})` : Prisma.empty}
        ${filters.productId ? Prisma.sql`AND t."productId" = ${filters.productId}::uuid` : Prisma.empty}
    `);
    return Number(percentage(numeric(rows[0]?.converted), numeric(rows[0]?.total)).toFixed(2));
  }

  private async conversionByStage(filters: RevenueFilters): Promise<RevenueConversionRow[]> {
    return this.conversionRows(filters, 'stage');
  }

  private async conversionBySeller(filters: RevenueFilters): Promise<RevenueConversionRow[]> {
    return this.conversionRows(filters, 'seller');
  }

  private async conversionByCountry(filters: RevenueFilters): Promise<RevenueConversionRow[]> {
    return this.conversionRows(filters, 'country');
  }

  private async conversionRows(
    filters: RevenueFilters,
    dimension: 'stage' | 'seller' | 'country',
  ): Promise<RevenueConversionRow[]> {
    const dimensionSelect =
      dimension === 'stage'
        ? Prisma.sql`COALESCE(ps."systemKey", ps."name") AS key, ps."name" AS label`
        : dimension === 'seller'
          ? Prisma.sql`COALESCE(o."userId"::text, 'unassigned') AS key, COALESCE(u."firstName" || ' ' || u."lastName", 'Sin responsable') AS label`
          : Prisma.sql`COALESCE(c."country", 'UNKNOWN') AS key, COALESCE(c."country", 'Sin país') AS label`;
    const groupBy =
      dimension === 'stage'
        ? Prisma.sql`ps."systemKey", ps."name"`
        : dimension === 'seller'
          ? Prisma.sql`o."userId", u."firstName", u."lastName"`
          : Prisma.sql`c."country"`;
    const extra =
      dimension === 'stage' && filters.productId
        ? Prisma.sql`AND (${filters.productId}::uuid IS NULL OR o."productId" = ${filters.productId}::uuid)`
        : filters.productId
          ? Prisma.sql`AND o."productId" = ${filters.productId}::uuid`
          : Prisma.empty;
    const rows = await this.prisma.$queryRaw<ConversionRow[]>(Prisma.sql`
      SELECT ${dimensionSelect}, COUNT(DISTINCT o."id")::integer AS opportunities,
        COUNT(DISTINCT s."id")::integer AS conversions
      FROM "Opportunity" o
      JOIN "PipelineStage" ps ON ps."organizationId" = o."organizationId" AND ps."id" = o."pipelineStageId"
      JOIN "Contact" c ON c."organizationId" = o."organizationId" AND c."id" = o."contactId"
      LEFT JOIN "User" u ON u."organizationId" = o."organizationId" AND u."id" = o."userId"
      LEFT JOIN "Sale" s ON s."organizationId" = o."organizationId" AND s."opportunityId" = o."id"
        AND s."deletedAt" IS NULL AND s.status IN ('CONFIRMED', 'FULFILLED')
        AND COALESCE(s."soldAt", s."createdAt") BETWEEN ${filters.from} AND ${filters.to}
      WHERE o."organizationId" = ${filters.organizationId}::uuid AND o."deletedAt" IS NULL
        AND o."createdAt" BETWEEN ${filters.from} AND ${filters.to}
        ${filters.country ? Prisma.sql`AND c."country" = ${filters.country}` : Prisma.empty}
        ${filters.sellerId ? Prisma.sql`AND o."userId" = ${filters.sellerId}::uuid` : Prisma.empty}
        ${extra}
      GROUP BY ${groupBy}
      ORDER BY opportunities DESC, label
    `);
    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      opportunities: numeric(row.opportunities),
      conversions: numeric(row.conversions),
      conversionRate: percentage(numeric(row.conversions), numeric(row.opportunities)),
    }));
  }

  private async trendsForFilters(filters: RevenueFilters): Promise<RevenueTrendPoint[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`organization_id = ${filters.organizationId}::uuid`,
      Prisma.sql`metric_date BETWEEN ${filters.from}::date AND ${filters.to}::date`,
    ];
    if (filters.country) conditions.push(Prisma.sql`country = ${filters.country}`);
    if (filters.sellerId) conditions.push(Prisma.sql`seller_id = ${filters.sellerId}`);
    if (filters.productId) conditions.push(Prisma.sql`product_id = ${filters.productId}`);
    if (filters.providerId) conditions.push(Prisma.sql`provider_id = ${filters.providerId}`);
    if (filters.currency) conditions.push(Prisma.sql`currency = ${filters.currency}`);
    const materialized = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT metric_date, currency, SUM(net_revenue) AS revenue, SUM(sales_count)::integer AS sales, SUM(customer_count)::integer AS customers
      FROM "revenue_sales_daily"
      ${this.where(conditions)}
      GROUP BY metric_date, currency
      ORDER BY metric_date, currency
    `);
    if (materialized.length > 0) return this.mapTrends(materialized);
    const live = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT DATE_TRUNC('day', COALESCE(s."soldAt", s."createdAt") AT TIME ZONE 'UTC')::date AS metric_date,
        s."currency" AS currency, SUM(s."total") AS revenue, COUNT(*)::integer AS sales,
        COUNT(DISTINCT s."contactId")::integer AS customers
      FROM "Sale" s
      ${this.where(this.saleConditions(filters))}
      GROUP BY metric_date, s."currency"
      ORDER BY metric_date, s."currency"
    `);
    return this.mapTrends(live);
  }

  private mapTrends(rows: TrendRow[]): RevenueTrendPoint[] {
    return rows.map((row) => ({
      date: dateKey(row.metric_date),
      currency: row.currency,
      revenue: decimal(row.revenue),
      sales: numeric(row.sales),
      customers: numeric(row.customers),
    }));
  }

  private async cohortsForFilters(filters: RevenueFilters): Promise<RevenueCohortRow[]> {
    const rows = await this.prisma.$queryRaw<CohortRow[]>(Prisma.sql`
      WITH qualifying_sales AS (
        SELECT s."contactId", s."currency", COALESCE(s."soldAt", s."createdAt") AS sale_date, s."total"
        FROM "Sale" s
        ${this.where(this.saleConditions(filters))}
      ), first_sales AS (
        SELECT "contactId", MIN(DATE_TRUNC('month', sale_date AT TIME ZONE 'UTC')) AS cohort_month
        FROM qualifying_sales
        GROUP BY "contactId"
      )
      SELECT DATE_TRUNC('month', fs.cohort_month)::date AS cohort_month,
        ((EXTRACT(YEAR FROM DATE_TRUNC('month', qs.sale_date AT TIME ZONE 'UTC')) - EXTRACT(YEAR FROM fs.cohort_month)) * 12
          + EXTRACT(MONTH FROM DATE_TRUNC('month', qs.sale_date AT TIME ZONE 'UTC')) - EXTRACT(MONTH FROM fs.cohort_month))::integer AS period,
        COUNT(DISTINCT fs."contactId")::integer AS acquired,
        COUNT(DISTINCT qs."contactId")::integer AS retained,
        SUM(qs.total) AS revenue,
        qs.currency AS currency
      FROM first_sales fs
      JOIN qualifying_sales qs ON qs."contactId" = fs."contactId"
      GROUP BY fs.cohort_month, period, qs.currency
      ORDER BY cohort_month, period, currency
    `);
    return rows.map((row) => {
      const acquired = numeric(row.acquired);
      const retained = numeric(row.retained);
      return {
        cohortMonth: monthKey(row.cohort_month),
        period: numeric(row.period),
        acquired,
        retained,
        retentionRate: percentage(retained, acquired),
        revenue: decimal(row.revenue),
        currency: row.currency,
      } as RevenueCohortRow;
    });
  }

  private async forecastForFilters(
    filters: RevenueFilters,
    horizon: number,
  ): Promise<RevenueForecast[]> {
    const historyRange: RevenueFilters = {
      ...filters,
      from: new Date(filters.to.getTime() - 6 * 31 * 24 * 60 * 60 * 1000),
    };
    const rows = await this.prisma.$queryRaw<MonthlyRevenueRow[]>(Prisma.sql`
      SELECT DATE_TRUNC('month', COALESCE(s."soldAt", s."createdAt") AT TIME ZONE 'UTC')::date AS metric_month,
        s."currency" AS currency, SUM(s."total") AS revenue
      FROM "Sale" s
      ${this.where(this.saleConditions(historyRange))}
      GROUP BY metric_month, s."currency"
      ORDER BY metric_month, s."currency"
    `);
    const byCurrency = new Map<string, RevenueForecastPoint[]>();
    rows.forEach((row) => {
      const list = byCurrency.get(row.currency) ?? [];
      list.push({ month: monthKey(row.metric_month), amount: decimal(row.revenue) });
      byCurrency.set(row.currency, list);
    });
    return Array.from(byCurrency.entries()).map(([currency, history]) => ({
      currency,
      method: 'HISTORICAL_MOVING_TREND' as const,
      history,
      forecast: buildHistoricalTrendForecast(history, horizon),
      horizonMonths: horizon,
    }));
  }

  private async funnelForFilters(
    filters: RevenueFilters,
    query: RevenueQueryDto,
  ): Promise<RevenueFunnelResult> {
    const stages = this.parseStages(query.stages);
    const current = await this.funnelPeriod(filters, stages);
    const result: RevenueFunnelResult = {
      name: 'Commercial Core',
      stages: this.withFunnelRates(current),
    };
    if (query.compare) {
      const duration = filters.to.getTime() - filters.from.getTime();
      const previousFilters = {
        ...filters,
        from: new Date(filters.from.getTime() - duration),
        to: new Date(filters.from.getTime() - 1),
      };
      result.comparison = this.withFunnelRates(await this.funnelPeriod(previousFilters, stages));
    }
    return result;
  }

  private parseStages(value?: string): Array<readonly [string, string]> {
    if (!value) return DEFAULT_FUNNEL.slice();
    const requested = value
      .split(',')
      .map((stage) => stage.trim().toUpperCase())
      .filter(Boolean);
    if (
      requested.length < 2 ||
      requested.length > 10 ||
      requested.some((stage) => !FUNNEL_LABELS[stage])
    ) {
      throw new BadRequestException('Las etapas del embudo no son válidas.');
    }
    return requested.map((stage) => [stage, FUNNEL_LABELS[stage] ?? stage] as const);
  }

  private async funnelPeriod(
    filters: RevenueFilters,
    stages: Array<readonly [string, string]>,
  ): Promise<RevenueFunnelStage[]> {
    const values = await Promise.all(
      stages.map(async ([key, label]) => ({
        key,
        label,
        count: await this.funnelStageCount(key, filters),
        conversionRate: 0,
      })),
    );
    return values;
  }

  private withFunnelRates(stages: RevenueFunnelStage[]): RevenueFunnelStage[] {
    return stages.map((stage, index) => ({
      ...stage,
      conversionRate: index === 0 ? 100 : percentage(stage.count, stages[index - 1]?.count ?? 0),
    }));
  }

  private async funnelStageCount(key: string, filters: RevenueFilters): Promise<number> {
    if (key === 'MESSAGE') {
      const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT c."id")::integer AS value FROM "Contact" c
        WHERE c."organizationId" = ${filters.organizationId}::uuid AND c."deletedAt" IS NULL
          AND c."createdAt" BETWEEN ${filters.from} AND ${filters.to}
          ${filters.country ? Prisma.sql`AND c."country" = ${filters.country}` : Prisma.empty}
      `);
      return numeric(rows[0]?.value);
    }
    if (key === 'DEMO') {
      const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT t."contactId")::integer AS value FROM "Trial" t
        JOIN "Contact" c ON c."organizationId" = t."organizationId" AND c."id" = t."contactId"
        WHERE t."organizationId" = ${filters.organizationId}::uuid AND t."deletedAt" IS NULL
          AND t.status IN ('ACTIVE', 'CONVERTED') AND t."createdAt" BETWEEN ${filters.from} AND ${filters.to}
          ${filters.country ? Prisma.sql`AND c."country" = ${filters.country}` : Prisma.empty}
          ${filters.productId ? Prisma.sql`AND t."productId" = ${filters.productId}::uuid` : Prisma.empty}
      `);
      return numeric(rows[0]?.value);
    }
    if (key === 'POTENTIAL_BUYER') {
      const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT o."id")::integer AS value FROM "Opportunity" o
        JOIN "Contact" c ON c."organizationId" = o."organizationId" AND c."id" = o."contactId"
        JOIN "PipelineStage" ps ON ps."organizationId" = o."organizationId" AND ps."id" = o."pipelineStageId"
        WHERE o."organizationId" = ${filters.organizationId}::uuid AND o."deletedAt" IS NULL
          AND COALESCE(ps."systemKey", '') = 'POTENTIAL_BUYER' AND o."createdAt" BETWEEN ${filters.from} AND ${filters.to}
          ${filters.country ? Prisma.sql`AND c."country" = ${filters.country}` : Prisma.empty}
          ${filters.sellerId ? Prisma.sql`AND o."userId" = ${filters.sellerId}::uuid` : Prisma.empty}
          ${filters.productId ? Prisma.sql`AND o."productId" = ${filters.productId}::uuid` : Prisma.empty}
      `);
      return numeric(rows[0]?.value);
    }
    if (key === 'SALE') {
      const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT s."id")::integer AS value FROM "Sale" s
        ${this.where(this.saleConditions(filters))}
      `);
      return numeric(rows[0]?.value);
    }
    if (key === 'ACTIVATION') {
      const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT a."id")::integer AS value FROM "Activation" a
        JOIN "Fulfillment" f ON f."organizationId" = a."organizationId" AND f."id" = a."fulfillmentId"
        JOIN "Sale" s ON s."organizationId" = f."organizationId" AND s."id" = f."saleId"
        WHERE a."organizationId" = ${filters.organizationId}::uuid AND a."deletedAt" IS NULL
          AND a.status IN ('ACTIVE', 'EXPIRED', 'SUSPENDED')
          AND COALESCE(s."soldAt", s."createdAt") BETWEEN ${filters.from} AND ${filters.to}
          ${filters.providerId ? Prisma.sql`AND a."providerId" = ${filters.providerId}::uuid` : Prisma.empty}
      `);
      return numeric(rows[0]?.value);
    }
    if (key === 'RENEWAL') {
      const rows = await this.prisma.$queryRaw<NumberRow[]>(Prisma.sql`
        SELECT COUNT(DISTINCT r."id")::integer AS value FROM "Renewal" r
        WHERE r."organizationId" = ${filters.organizationId}::uuid AND r."deletedAt" IS NULL
          AND r.status = 'PAID' AND r."paidAt" BETWEEN ${filters.from} AND ${filters.to}
      `);
      return numeric(rows[0]?.value);
    }
    return 0;
  }
}
