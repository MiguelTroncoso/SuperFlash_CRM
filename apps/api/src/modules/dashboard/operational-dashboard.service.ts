import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DailyMetricSource,
  MarketingStatus,
  PaymentStatus,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { DateTime } from 'luxon';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { isSupportedCurrency } from '../commercial/currency';
import { DailyMetricImportPreview, parseDailyMetricsCsv } from './daily-metrics.parser';
import {
  ImportDailyMetricsDto,
  ListDailyMetricsQueryDto,
  OperationalDashboardQueryDto,
  UpdateDailyMetricDto,
  UpsertDailyMetricDto,
} from './dto/operational-dashboard.dto';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

interface RequestMetadata {
  ipAddress?: string;
  requestId?: string;
}

interface DateRange {
  from: Date;
  to: Date;
}

export interface MoneySummary {
  currency: string;
  amount: string;
}

export interface ManualSummary {
  conversations: number;
  demos: number;
  informativeSales: number;
  adSpend: MoneySummary[];
  grossRevenue: MoneySummary[];
}

export interface RealSummary {
  salesCount: number;
  billingGross: MoneySummary[];
  confirmedPayments: MoneySummary[];
  netIncome: MoneySummary[];
  expenses: MoneySummary[];
  profit: MoneySummary[];
  averageTicket: MoneySummary[];
  // USD consolidated figures
  usdGrossBilling: string;
  usdGrossPayments: string;
  usdFees: string;
  usdNetIncome: string;
  usdExpenses: string;
  usdProfit: string;
}

function decimal(value: unknown): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(String(value ?? 0));
}

function amount(value: unknown): string {
  return decimal(value).toFixed(2);
}

function normalizedText(value: string | undefined): string | undefined {
  const result = value?.trim().replace(/\s+/g, ' ');
  return result || undefined;
}

function metricDate(value: string): Date {
  const date = DateTime.fromISO(value.slice(0, 10), { zone: 'UTC' });
  if (!date.isValid || date.toFormat('yyyy-MM-dd') !== value.slice(0, 10)) {
    throw new BadRequestException({
      code: 'DAILY_METRIC_DATE_INVALID',
      message: 'La fecha de la métrica no es válida.',
    });
  }
  return date.startOf('day').toJSDate();
}

function range(query: OperationalDashboardQueryDto, timezone: string): DateRange {
  const zone = timezone || 'America/Santiago';
  const now = DateTime.now().setZone(zone);
  const start = query.from
    ? DateTime.fromISO(query.from, { zone }).startOf('day')
    : now.startOf('month');
  const end = query.to
    ? DateTime.fromISO(query.to, { zone }).plus({ days: 1 }).startOf('day')
    : now.plus({ days: 1 }).startOf('day');
  if (!start.isValid || !end.isValid || end <= start) {
    throw new BadRequestException({
      code: 'OPERATIONAL_DATE_RANGE_INVALID',
      message: 'El rango de fechas no es válido.',
    });
  }
  return { from: start.toUTC().toJSDate(), to: end.toUTC().toJSDate() };
}

function money(value: string | undefined, fallback = '0'): Prisma.Decimal {
  const result = new Prisma.Decimal(value ?? fallback);
  if (!result.isFinite() || result.isNegative()) {
    throw new BadRequestException({
      code: 'DAILY_METRIC_AMOUNT_INVALID',
      message: 'Los importes deben ser números finitos y no negativos.',
    });
  }
  return result;
}

function publicMoney(rows: Array<{ currency: string; value: unknown }>): MoneySummary[] {
  return rows
    .map((row) => ({ currency: row.currency, amount: amount(row.value) }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function addMoney(target: Map<string, Prisma.Decimal>, currency: string, value: unknown): void {
  target.set(currency, (target.get(currency) ?? new Prisma.Decimal(0)).plus(decimal(value)));
}

@Injectable()
export class OperationalDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fx: ExchangeRatesService,
  ) {}

  async previewImport(dto: ImportDailyMetricsDto): Promise<DailyMetricImportPreview> {
    return parseDailyMetricsCsv(dto.csv);
  }

  async upsertDailyMetric(
    dto: UpsertDailyMetricDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
    source = DailyMetricSource.MANUAL,
  ) {
    const normalized = this.normalizeDto(dto);
    try {
      return await this.prisma.$transaction(async (transaction) =>
        this.upsertNormalized(transaction, normalized, user, metadata, source),
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.dailyMetric.findUnique({
          where: {
            organizationId_metricDate_campaignKey_country: {
              organizationId: user.organizationId,
              metricDate: normalized.metricDate,
              campaignKey: normalized.campaignKey,
              country: normalized.country,
            },
          },
        });
        if (winner) return this.publicDailyMetric(winner);
      }
      throw error;
    }
  }

  async importDailyMetrics(
    dto: ImportDailyMetricsDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ): Promise<{ imported: number; errors: DailyMetricImportPreview['errors'] }> {
    const preview = parseDailyMetricsCsv(dto.csv);
    if (preview.errors.length) {
      throw new BadRequestException({
        code: 'DAILY_METRIC_IMPORT_INVALID',
        message: 'El archivo contiene filas inválidas.',
        errors: preview.errors,
      });
    }
    await this.prisma.$transaction(async (transaction) => {
      for (const row of preview.rows) {
        await this.upsertNormalized(
          transaction,
          this.normalizeImportRow(row),
          user,
          metadata,
          DailyMetricSource.IMPORT,
        );
      }
    });
    return { imported: preview.rows.length, errors: [] };
  }

  async listDailyMetrics(query: ListDailyMetricsQueryDto, user: AuthenticatedUser) {
    const dates = range(query, 'UTC');
    const where: Prisma.DailyMetricWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      metricDate: { gte: dates.from, lt: dates.to },
      ...(query.country ? { country: query.country } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.dailyMetric.findMany({
        where,
        include: { campaign: { select: { id: true, name: true } } },
        orderBy: [{ metricDate: 'desc' }, { country: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.dailyMetric.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.publicDailyMetric(row)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async updateDailyMetric(
    id: string,
    dto: UpdateDailyMetricDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.dailyMetric.findFirst({
        where: { id, organizationId: user.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          code: 'DAILY_METRIC_NOT_FOUND',
          message: 'La métrica diaria no existe.',
        });
      }
      const updated = await transaction.dailyMetric.update({
        where: { id },
        data: {
          ...(dto.conversations !== undefined ? { conversations: dto.conversations } : {}),
          ...(dto.demos !== undefined ? { demos: dto.demos } : {}),
          ...(dto.salesCount !== undefined ? { salesCount: dto.salesCount } : {}),
          ...(dto.adSpend !== undefined ? { adSpend: money(dto.adSpend) } : {}),
          ...(dto.grossRevenue !== undefined ? { grossRevenue: money(dto.grossRevenue) } : {}),
          ...(dto.notes !== undefined ? { notes: normalizedText(dto.notes) ?? null } : {}),
          updatedByUserId: user.userId,
        },
        include: { campaign: { select: { id: true, name: true } } },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'DAILY_METRIC_UPDATED',
        tableName: 'DailyMetric',
        recordId: id,
        previousValue: this.auditValue(existing),
        newValue: this.auditValue(updated),
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
      return this.publicDailyMetric(updated);
    });
  }

  async deleteDailyMetric(id: string, user: AuthenticatedUser, metadata: RequestMetadata) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.dailyMetric.findFirst({
        where: { id, organizationId: user.organizationId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException({
          code: 'DAILY_METRIC_NOT_FOUND',
          message: 'La métrica diaria no existe.',
        });
      }
      await transaction.dailyMetric.update({
        where: { id },
        data: { deletedAt: new Date(), updatedByUserId: user.userId },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'DAILY_METRIC_DELETED',
        tableName: 'DailyMetric',
        recordId: id,
        previousValue: this.auditValue(existing),
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
      return { id };
    });
  }

  async dashboard(query: OperationalDashboardQueryDto, user: AuthenticatedUser) {
    const timezone = 'America/Santiago';
    const dates = range(query, timezone);
    const today = DateTime.now().setZone(timezone);
    const todayDate = today.startOf('day').toUTC().toJSDate();
    const tomorrowDate = today.plus({ days: 1 }).startOf('day').toUTC().toJSDate();
    const manualWhere: Prisma.DailyMetricWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      metricDate: { gte: dates.from, lt: dates.to },
      ...(query.country ? { country: query.country } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
    };
    const todayManualWhere: Prisma.DailyMetricWhereInput = {
      ...manualWhere,
      metricDate: { gte: todayDate, lt: tomorrowDate },
    };
    const saleWhere: Prisma.SaleWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      status: { in: [SaleStatus.CONFIRMED, SaleStatus.FULFILLED] },
      createdAt: { gte: dates.from, lt: dates.to },
      ...(query.country ? { contact: { is: { country: query.country } } } : {}),
      ...(query.productId
        ? { items: { some: { productId: query.productId, deletedAt: null } } }
        : {}),
    };
    const paymentWhere: Prisma.PaymentWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      status: PaymentStatus.CONFIRMED,
      paymentDate: { gte: dates.from, lt: dates.to },
      ...(query.country ? { sale: { is: { contact: { is: { country: query.country } } } } } : {}),
      ...(query.productId
        ? { sale: { is: { items: { some: { productId: query.productId, deletedAt: null } } } } }
        : {}),
    };
    const todaySaleWhere: Prisma.SaleWhereInput = {
      ...saleWhere,
      createdAt: { gte: todayDate, lt: tomorrowDate },
    };
    const todayPaymentWhere: Prisma.PaymentWhereInput = {
      ...paymentWhere,
      paymentDate: { gte: todayDate, lt: tomorrowDate },
    };
    const expenseWhere: Prisma.ExpenseWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      expenseDate: { gte: dates.from, lt: dates.to },
    };
    const todayExpenseWhere: Prisma.ExpenseWhereInput = {
      ...expenseWhere,
      expenseDate: { gte: todayDate, lt: tomorrowDate },
    };

    const [
      manual,
      todayManual,
      manualMoney,
      todayManualMoney,
      countries,
      sales,
      todaySales,
      payments,
      todayPayments,
      expenses,
      todayExpenses,
      pendingCollections,
      followups,
      renewals,
      renewalsToday,
      criticalStockRows,
    ] = await Promise.all([
      this.prisma.dailyMetric.aggregate({
        where: manualWhere,
        _sum: {
          conversations: true,
          demos: true,
          salesCount: true,
          adSpend: true,
          grossRevenue: true,
        },
      }),
      this.prisma.dailyMetric.aggregate({
        where: todayManualWhere,
        _sum: {
          conversations: true,
          demos: true,
          salesCount: true,
          adSpend: true,
          grossRevenue: true,
        },
      }),
      this.prisma.dailyMetric.groupBy({
        where: manualWhere,
        by: ['currency'],
        _sum: { adSpend: true, grossRevenue: true },
      }),
      this.prisma.dailyMetric.groupBy({
        where: todayManualWhere,
        by: ['currency'],
        _sum: { adSpend: true, grossRevenue: true },
      }),
      this.prisma.dailyMetric.groupBy({
        where: manualWhere,
        by: ['country'],
        _sum: {
          conversations: true,
          demos: true,
          salesCount: true,
          adSpend: true,
          grossRevenue: true,
        },
        orderBy: { country: 'asc' },
      }),
      this.prisma.sale.groupBy({
        where: saleWhere,
        by: ['currency'],
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.sale.groupBy({
        where: todaySaleWhere,
        by: ['currency'],
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.payment.groupBy({
        where: paymentWhere,
        by: ['currency'],
        _sum: { grossAmount: true, feeAmount: true, netAmount: true, refundedAmount: true },
      }),
      this.prisma.payment.groupBy({
        where: todayPaymentWhere,
        by: ['currency'],
        _sum: { grossAmount: true, feeAmount: true, netAmount: true, refundedAmount: true },
      }),
      this.prisma.expense.groupBy({
        where: expenseWhere,
        by: ['currency'],
        _sum: { amount: true },
      }),
      this.prisma.expense.groupBy({
        where: todayExpenseWhere,
        by: ['currency'],
        _sum: { amount: true },
      }),
      this.pendingCollections(user.organizationId, dates, query.productId, query.country),
      this.prisma.followUp.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          archivedAt: null,
          status: { in: ['PENDING', 'RESCHEDULED'] },
          dueAt: { gte: todayDate, lt: tomorrowDate },
        },
      }),
      this.prisma.renewal.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: { in: ['PENDING', 'DUE', 'OVERDUE'] },
          dueAt: { gte: todayDate, lt: today.plus({ days: 8 }).toUTC().toJSDate() },
        },
      }),
      this.prisma.renewal.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: { in: ['PENDING', 'DUE', 'OVERDUE'] },
          dueAt: { gte: todayDate, lt: tomorrowDate },
        },
      }),
      this.prisma.product.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          active: true,
          status: 'ACTIVE',
          stockTrackingEnabled: true,
        },
        select: { stockQuantity: true, stockReserved: true, stockMinimum: true },
      }),
    ]);

    const real: RealSummary = await this.realSummaryAsync(
      user.organizationId,
      sales,
      payments,
      expenses,
    );
    const todayReal: RealSummary = await this.realSummaryAsync(
      user.organizationId,
      todaySales,
      todayPayments,
      todayExpenses,
    );

    const manualSummary: ManualSummary = {
      conversations: manual._sum.conversations ?? 0,
      demos: manual._sum.demos ?? 0,
      informativeSales: manual._sum.salesCount ?? 0,
      adSpend: publicMoney(
        manualMoney.map((row) => ({ currency: row.currency, value: row._sum.adSpend ?? 0 })),
      ),
      grossRevenue: publicMoney(
        manualMoney.map((row) => ({ currency: row.currency, value: row._sum.grossRevenue ?? 0 })),
      ),
    };
    const todaySummary = {
      conversations: todayManual._sum.conversations ?? 0,
      demos: todayManual._sum.demos ?? 0,
      informativeSales: todayManual._sum.salesCount ?? 0,
      adSpend: publicMoney(
        todayManualMoney.map((row) => ({ currency: row.currency, value: row._sum.adSpend ?? 0 })),
      ),
      grossRevenue: publicMoney(
        todayManualMoney.map((row) => ({
          currency: row.currency,
          value: row._sum.grossRevenue ?? 0,
        })),
      ),
    };

    const conversations = manualSummary.conversations;
    const demos = manualSummary.demos;
    const saleCount = real.salesCount;

    // Convert adSpend to USD
    let totalAdSpendUsd = new Prisma.Decimal(0);
    for (const row of manualMoney) {
      const { usdAmount } = await this.fx.convertToUsd(
        user.organizationId,
        row._sum.adSpend ?? 0,
        row.currency,
      );
      totalAdSpendUsd = totalAdSpendUsd.plus(usdAmount);
    }

    return {
      period: { from: dates.from.toISOString(), to: dates.to.toISOString() },
      today: {
        ...todaySummary,
        sales: todayReal.salesCount,
        grossBilling: todayReal.billingGross,
        confirmedPayments: todayReal.confirmedPayments,
        netIncome: todayReal.netIncome,
        expenses: todayReal.expenses,
        profit: todayReal.profit,
        // Consolidated USD figures
        usdGrossBilling: todayReal.usdGrossBilling,
        usdGrossPayments: todayReal.usdGrossPayments,
        usdFees: todayReal.usdFees,
        usdNetIncome: todayReal.usdNetIncome,
        usdExpenses: todayReal.usdExpenses,
        usdProfit: todayReal.usdProfit,
        renewals: renewalsToday,
        followups,
      },
      month: {
        conversations,
        demos,
        sales: saleCount,
        conversionConversationToDemo: conversations
          ? Number(((demos / conversations) * 100).toFixed(2))
          : 0,
        conversionDemoToSale: demos ? Number(((saleCount / demos) * 100).toFixed(2)) : 0,
        conversionConversationToSale: conversations
          ? Number(((saleCount / conversations) * 100).toFixed(2))
          : 0,
        grossBilling: real.billingGross,
        netIncome: real.netIncome,
        expenses: real.expenses,
        profit: real.profit,
        averageTicket: real.averageTicket,
        // Consolidated USD figures
        usdGrossBilling: real.usdGrossBilling,
        usdGrossPayments: real.usdGrossPayments,
        usdFees: real.usdFees,
        usdNetIncome: real.usdNetIncome,
        usdExpenses: real.usdExpenses,
        usdProfit: real.usdProfit,
        adSpend: totalAdSpendUsd.toFixed(2),
        costPerConversation: conversations ? totalAdSpendUsd.div(conversations).toFixed(2) : '0.00',
        costPerDemo: demos ? totalAdSpendUsd.div(demos).toFixed(2) : '0.00',
        cpa: saleCount ? totalAdSpendUsd.div(saleCount).toFixed(2) : '0.00',
        roas: totalAdSpendUsd.greaterThan(0)
          ? new Prisma.Decimal(real.usdGrossBilling).div(totalAdSpendUsd).toFixed(2)
          : '0.00',
      },
      manualActivity: manualSummary,
      financialReal: real,
      byCountry: countries.map((row) => ({
        country: row.country,
        conversations: row._sum.conversations ?? 0,
        demos: row._sum.demos ?? 0,
        informativeSales: row._sum.salesCount ?? 0,
        adSpend: amount(row._sum.adSpend),
        grossRevenue: amount(row._sum.grossRevenue),
      })),
      pendingCollections,
      renewalsDueSoon: renewals,
      criticalStock: criticalStockRows.filter((product) =>
        decimal(product.stockQuantity)
          .minus(decimal(product.stockReserved))
          .lessThanOrEqualTo(decimal(product.stockMinimum)),
      ).length,
      sourceOfTruth: {
        manualActivity: 'DailyMetric',
        financialSales: 'Sale and confirmed Payment',
        financialSalesCount: 'Sale',
      },
    };
  }

  private normalizeDto(dto: UpsertDailyMetricDto) {
    const country = dto.country.trim().toUpperCase();
    const currency = (dto.currency ?? 'USD').trim().toUpperCase();
    if (!/^(?:[A-Z]{2}|GLOBAL)$/.test(country)) {
      throw new BadRequestException({
        code: 'DAILY_METRIC_COUNTRY_INVALID',
        message: 'El país debe ser ISO-2 o GLOBAL.',
      });
    }
    if (!isSupportedCurrency(currency)) {
      throw new BadRequestException({
        code: 'DAILY_METRIC_CURRENCY_INVALID',
        message: 'La moneda no está soportada.',
      });
    }
    const campaignKey = dto.campaignId?.trim() ?? '';
    return {
      metricDate: metricDate(dto.metricDate),
      campaignId: dto.campaignId,
      campaignKey,
      campaignName: normalizedText(dto.campaignName),
      platform: normalizedText(dto.platform),
      country,
      conversations: dto.conversations,
      demos: dto.demos,
      salesCount: dto.salesCount ?? 0,
      adSpend: money(dto.adSpend),
      grossRevenue: dto.grossRevenue === undefined ? null : money(dto.grossRevenue),
      currency,
      notes: normalizedText(dto.notes) ?? null,
    };
  }

  private normalizeImportRow(row: {
    metricDate: string;
    campaignName?: string;
    platform?: string;
    country: string;
    conversations: number;
    demos: number;
    salesCount: number;
    adSpend: string;
    grossRevenue?: string;
    currency: string;
    notes?: string;
  }) {
    return this.normalizeDto({
      metricDate: row.metricDate,
      ...(row.campaignName ? { campaignName: row.campaignName } : {}),
      ...(row.platform ? { platform: row.platform } : {}),
      country: row.country,
      conversations: row.conversations,
      demos: row.demos,
      salesCount: row.salesCount,
      adSpend: row.adSpend,
      ...(row.grossRevenue ? { grossRevenue: row.grossRevenue } : {}),
      currency: row.currency,
      ...(row.notes ? { notes: row.notes } : {}),
    });
  }

  private async resolveCampaign(
    transaction: Prisma.TransactionClient,
    normalized: ReturnType<OperationalDashboardService['normalizeDto']>,
    user: AuthenticatedUser,
  ) {
    if (normalized.campaignId) {
      const campaign = await transaction.campaign.findFirst({
        where: {
          id: normalized.campaignId,
          organizationId: user.organizationId,
          deletedAt: null,
          active: true,
          status: MarketingStatus.ACTIVE,
        },
      });
      if (!campaign)
        throw new NotFoundException({
          code: 'DAILY_METRIC_CAMPAIGN_NOT_FOUND',
          message: 'La campaña no existe o no está activa.',
        });
      return campaign;
    }
    if (!normalized.campaignName) return null;
    const existing = await transaction.campaign.findFirst({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        active: true,
        status: MarketingStatus.ACTIVE,
        name: { equals: normalized.campaignName, mode: 'insensitive' },
      },
    });
    if (existing) return existing;
    return transaction.campaign.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        name: normalized.campaignName,
        source: 'MANUAL',
        platform: normalized.platform ?? 'MANUAL',
        targetedCountry: normalized.country === 'GLOBAL' ? null : normalized.country,
        status: MarketingStatus.ACTIVE,
        active: true,
      },
    });
  }

  private async upsertNormalized(
    transaction: Prisma.TransactionClient,
    normalized: ReturnType<OperationalDashboardService['normalizeDto']>,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
    source: DailyMetricSource,
  ) {
    const campaign = await this.resolveCampaign(transaction, normalized, user);
    const campaignKey = campaign?.id ?? '';
    const existing = await transaction.dailyMetric.findUnique({
      where: {
        organizationId_metricDate_campaignKey_country: {
          organizationId: user.organizationId,
          metricDate: normalized.metricDate,
          campaignKey,
          country: normalized.country,
        },
      },
    });
    const data = {
      campaignId: campaign?.id ?? null,
      campaignKey,
      campaignNameSnapshot: campaign?.name ?? normalized.campaignName ?? null,
      country: normalized.country,
      conversations: normalized.conversations,
      demos: normalized.demos,
      salesCount: normalized.salesCount,
      adSpend: normalized.adSpend,
      grossRevenue: normalized.grossRevenue,
      currency: normalized.currency,
      notes: normalized.notes,
      source,
      updatedByUserId: user.userId,
    };
    const record = existing
      ? await transaction.dailyMetric.update({
          where: { id: existing.id },
          data,
          include: { campaign: { select: { id: true, name: true } } },
        })
      : await transaction.dailyMetric.create({
          data: {
            ...data,
            organizationId: user.organizationId,
            metricDate: normalized.metricDate,
            createdByUserId: user.userId,
          },
          include: { campaign: { select: { id: true, name: true } } },
        });
    await this.audit.recordWithClient(transaction, {
      organizationId: user.organizationId,
      userId: user.userId,
      action: existing ? 'DAILY_METRIC_UPDATED' : 'DAILY_METRIC_CREATED',
      tableName: 'DailyMetric',
      recordId: record.id,
      previousValue: existing ? this.auditValue(existing) : undefined,
      newValue: this.auditValue(record),
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return this.publicDailyMetric(record);
  }

  private publicDailyMetric(record: {
    id: string;
    metricDate: Date;
    campaignId: string | null;
    campaignNameSnapshot: string | null;
    country: string;
    conversations: number;
    demos: number;
    salesCount: number;
    adSpend: Prisma.Decimal;
    grossRevenue: Prisma.Decimal | null;
    currency: string;
    notes: string | null;
    source: DailyMetricSource;
    createdAt: Date;
    updatedAt: Date;
    campaign?: { id: string; name: string } | null;
  }) {
    return {
      id: record.id,
      metricDate: record.metricDate.toISOString().slice(0, 10),
      campaign:
        record.campaign ??
        (record.campaignId
          ? { id: record.campaignId, name: record.campaignNameSnapshot ?? 'Campaña' }
          : null),
      country: record.country,
      conversations: record.conversations,
      demos: record.demos,
      salesCount: record.salesCount,
      adSpend: amount(record.adSpend),
      grossRevenue: record.grossRevenue === null ? null : amount(record.grossRevenue),
      currency: record.currency,
      notes: record.notes,
      source: record.source,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private auditValue(record: {
    metricDate: Date;
    country: string;
    conversations: number;
    demos: number;
    salesCount: number;
    adSpend: unknown;
    grossRevenue: unknown;
    currency: string;
    campaignId?: string | null;
  }) {
    return {
      metricDate: record.metricDate.toISOString().slice(0, 10),
      country: record.country,
      conversations: record.conversations,
      demos: record.demos,
      salesCount: record.salesCount,
      adSpend: amount(record.adSpend),
      grossRevenue: record.grossRevenue === null ? null : amount(record.grossRevenue),
      currency: record.currency,
      ...(record.campaignId ? { campaignId: record.campaignId } : {}),
    } satisfies Prisma.InputJsonObject;
  }

  private async realSummaryAsync(
    organizationId: string,
    sales: Array<{
      currency: string;
      _count: { _all: number };
      _sum: { total: Prisma.Decimal | null };
    }>,
    payments: Array<{
      currency: string;
      _sum: {
        grossAmount: Prisma.Decimal | null;
        feeAmount: Prisma.Decimal | null;
        netAmount: Prisma.Decimal | null;
        refundedAmount: Prisma.Decimal | null;
      };
    }>,
    expenses: Array<{ currency: string; _sum: { amount: Prisma.Decimal | null } }>,
  ): Promise<RealSummary> {
    const gross = new Map<string, Prisma.Decimal>();
    const paid = new Map<string, Prisma.Decimal>();
    const fees = new Map<string, Prisma.Decimal>();
    const net = new Map<string, Prisma.Decimal>();
    const costs = new Map<string, Prisma.Decimal>();
    let salesCount = 0;

    for (const row of sales) {
      salesCount += row._count._all;
      addMoney(gross, row.currency, row._sum.total);
    }
    for (const row of payments) {
      addMoney(paid, row.currency, row._sum.grossAmount);
      addMoney(fees, row.currency, row._sum.feeAmount);
      addMoney(
        net,
        row.currency,
        decimal(row._sum.netAmount).minus(decimal(row._sum.refundedAmount)),
      );
    }
    for (const row of expenses) addMoney(costs, row.currency, row._sum.amount);

    const currencies = new Set([...gross.keys(), ...paid.keys(), ...net.keys(), ...costs.keys()]);
    const map = (source: Map<string, Prisma.Decimal>): MoneySummary[] =>
      [...source.entries()].map(([currency, value]) => ({ currency, amount: value.toFixed(2) }));

    const profit = [...currencies].map((currency) => ({
      currency,
      amount: (net.get(currency) ?? new Prisma.Decimal(0))
        .minus(costs.get(currency) ?? new Prisma.Decimal(0))
        .toFixed(2),
    }));

    const averageTicket = [...gross.entries()].map(([currency, value]) => ({
      currency,
      amount: salesCount ? value.div(salesCount).toFixed(2) : '0.00',
    }));

    // USD Conversions
    let usdGrossBilling = new Prisma.Decimal(0);
    for (const [curr, val] of gross.entries()) {
      const { usdAmount } = await this.fx.convertToUsd(organizationId, val, curr);
      usdGrossBilling = usdGrossBilling.plus(usdAmount);
    }

    let usdGrossPayments = new Prisma.Decimal(0);
    for (const [curr, val] of paid.entries()) {
      const { usdAmount } = await this.fx.convertToUsd(organizationId, val, curr);
      usdGrossPayments = usdGrossPayments.plus(usdAmount);
    }

    let usdFees = new Prisma.Decimal(0);
    for (const [curr, val] of fees.entries()) {
      const { usdAmount } = await this.fx.convertToUsd(organizationId, val, curr);
      usdFees = usdFees.plus(usdAmount);
    }

    let usdNetIncome = new Prisma.Decimal(0);
    for (const [curr, val] of net.entries()) {
      const { usdAmount } = await this.fx.convertToUsd(organizationId, val, curr);
      usdNetIncome = usdNetIncome.plus(usdAmount);
    }

    let usdExpenses = new Prisma.Decimal(0);
    for (const [curr, val] of costs.entries()) {
      const { usdAmount } = await this.fx.convertToUsd(organizationId, val, curr);
      usdExpenses = usdExpenses.plus(usdAmount);
    }

    const usdProfit = usdNetIncome.minus(usdExpenses);

    return {
      salesCount,
      billingGross: map(gross),
      confirmedPayments: map(paid),
      netIncome: map(net),
      expenses: map(costs),
      profit,
      averageTicket,
      usdGrossBilling: usdGrossBilling.toFixed(2),
      usdGrossPayments: usdGrossPayments.toFixed(2),
      usdFees: usdFees.toFixed(2),
      usdNetIncome: usdNetIncome.toFixed(2),
      usdExpenses: usdExpenses.toFixed(2),
      usdProfit: usdProfit.toFixed(2),
    };
  }

  private async pendingCollections(
    organizationId: string,
    dates: DateRange,
    productId?: string,
    country?: string,
  ) {
    const sales = await this.prisma.sale.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: [SaleStatus.CONFIRMED, SaleStatus.FULFILLED] },
        createdAt: { gte: dates.from, lt: dates.to },
        ...(country ? { contact: { is: { country } } } : {}),
        ...(productId ? { items: { some: { productId, deletedAt: null } } } : {}),
      },
      select: {
        id: true,
        currency: true,
        total: true,
        contact: { select: { firstName: true, lastName: true, phone: true } },
        payments: {
          where: { deletedAt: null, status: PaymentStatus.CONFIRMED },
          select: { grossAmount: true, refundedAmount: true },
        },
      },
    });

    const summaries = new Map<string, Prisma.Decimal>();
    let totalUsdPending = new Prisma.Decimal(0);

    for (const sale of sales) {
      const paid = sale.payments.reduce(
        (total, payment) => total.plus(payment.grossAmount).minus(payment.refundedAmount),
        new Prisma.Decimal(0),
      );
      const balance = new Prisma.Decimal(sale.total).minus(paid);
      if (balance.greaterThan(0)) {
        addMoney(summaries, sale.currency, balance);
        const { usdAmount } = await this.fx.convertToUsd(organizationId, balance, sale.currency);
        totalUsdPending = totalUsdPending.plus(usdAmount);
      }
    }

    return {
      byCurrency: [...summaries.entries()].map(([currency, balance]) => ({
        currency,
        balance: balance.toFixed(2),
      })),
      totalUsd: totalUsdPending.toFixed(2),
    };
  }
}
