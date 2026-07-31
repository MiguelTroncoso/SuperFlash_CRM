import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityType,
  NotificationStatus,
  Prisma,
  RenewalReminderKind,
  RenewalReminderStatus,
  RenewalStatus,
  RenewalWorkflowStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { RenewalsAccessPolicy } from '../renewals/renewals.policy';
import {
  RenewalCenterQueryDto,
  RenewalDashboardQueryDto,
  RenewalImportDto,
  RenewalReportQueryDto,
  UpdateRenewalWorkflowDto,
} from './dto/renewal-intelligence.dto';
import { csvEscape, csvValue, parseRenewalCsv, RenewalCsvRow } from './renewal-csv';

const renewalInclude = {
  owner: { select: { id: true, firstName: true, lastName: true } },
  subscription: {
    select: {
      contactId: true,
      productId: true,
      productNameSnapshot: true,
      amount: true,
      currency: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          country: true,
        },
      },
    },
  },
} as const;

type RenewalRecord = Prisma.RenewalGetPayload<{ include: typeof renewalInclude }>;
type DbClient = PrismaService | Prisma.TransactionClient;

interface ValidatedImportRow {
  line: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  contactId: string | null;
  subscriptionId: string | null;
  sourceSaleId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  amount: Prisma.Decimal | null;
  currency: string | null;
  status: RenewalStatus | null;
  workflowStatus: RenewalWorkflowStatus | null;
  userId: string | null;
  notes: string | null;
  cycleKey: string | null;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addMonths(value: Date, months: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function moneyByCurrency(records: Array<{ amount: Prisma.Decimal; currency: string }>) {
  const amounts = new Map<string, Prisma.Decimal>();
  for (const record of records) {
    amounts.set(
      record.currency,
      (amounts.get(record.currency) ?? new Prisma.Decimal(0)).plus(record.amount),
    );
  }
  return [...amounts.entries()].map(([currency, amount]) => ({
    currency,
    amount: amount.toFixed(2),
  }));
}

function workflowLabel(status: RenewalWorkflowStatus): string {
  const labels: Record<RenewalWorkflowStatus, string> = {
    PENDING: 'Pendiente',
    CONTACTED: 'Contactar',
    IN_CONVERSATION: 'En conversación',
    PAYMENT_PROMISE: 'Promesa de pago',
    PAID: 'Pagado',
    RENEWED: 'Renovado',
    NOT_RENEWED: 'No renovó',
    CANCELLED: 'Cancelado',
    LOST: 'Perdido',
  };
  return labels[status];
}

@Injectable()
export class RenewalIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: RenewalsAccessPolicy,
  ) {}

  async list(
    query: RenewalCenterQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.assertRead(user);
    const where = this.where(query, user.organizationId);
    const orderBy: Prisma.RenewalOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
    const [records, total] = await Promise.all([
      this.prisma.renewal.findMany({
        where,
        include: renewalInclude,
        orderBy: [orderBy, { id: query.sortOrder }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.renewal.count({ where }),
    ]);
    return {
      data: records.map((record) => this.publicRenewal(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async dashboard(
    query: RenewalDashboardQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.assertRead(user);
    const now = query.date ? new Date(query.date) : new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = addMonths(monthStart, 1);
    const previousStart = addMonths(monthStart, -1);
    const previousEnd = monthStart;
    const baseWhere = this.dashboardWhere(query, user.organizationId);
    const [renewals, paidThisMonth, paidPreviousMonth, expenses] = await Promise.all([
      this.prisma.renewal.findMany({
        where: { ...baseWhere, deletedAt: null },
        include: renewalInclude,
        orderBy: { dueAt: 'asc' },
      }),
      this.prisma.renewal.findMany({
        where: {
          ...baseWhere,
          deletedAt: null,
          status: RenewalStatus.PAID,
          paidAt: { gte: monthStart, lt: monthEnd },
        },
        select: { amount: true, currency: true },
      }),
      this.prisma.renewal.findMany({
        where: {
          ...baseWhere,
          deletedAt: null,
          status: RenewalStatus.PAID,
          paidAt: { gte: previousStart, lt: previousEnd },
        },
        select: { amount: true, currency: true },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          expenseDate: { gte: monthStart, lt: monthEnd },
        },
        select: { amount: true, currency: true },
      }),
    ]);
    const today = startOfDay(now);
    const next7 = addDays(today, 7);
    const next15 = addDays(today, 15);
    const next30 = addDays(today, 30);
    const active = renewals.filter(
      (renewal) =>
        renewal.status !== RenewalStatus.PAID && renewal.status !== RenewalStatus.CANCELLED,
    );
    const upcoming = active.filter((renewal) => renewal.dueAt >= today && renewal.dueAt < next30);
    const overdue = active.filter((renewal) => renewal.dueAt < today);
    const paid = renewals.filter((renewal) => renewal.status === RenewalStatus.PAID);
    const lost = renewals.filter(
      (renewal) =>
        renewal.workflowStatus === RenewalWorkflowStatus.LOST ||
        renewal.workflowStatus === RenewalWorkflowStatus.NOT_RENEWED,
    );
    const eligible = paid.length + lost.length + overdue.length;
    const currentRevenue = moneyByCurrency(paidThisMonth);
    const previousRevenue = moneyByCurrency(paidPreviousMonth);
    const monthlyExpenses = moneyByCurrency(expenses);
    const projectedRevenue = moneyByCurrency(upcoming);
    return {
      generatedAt: new Date().toISOString(),
      period: { from: monthStart, to: monthEnd },
      cards: {
        today: renewals.filter((renewal) => dateKey(renewal.dueAt) === dateKey(today)).length,
        next7Days: active.filter((renewal) => renewal.dueAt >= today && renewal.dueAt < next7)
          .length,
        next15Days: active.filter((renewal) => renewal.dueAt >= today && renewal.dueAt < next15)
          .length,
        next30Days: upcoming.length,
        upcomingAmount: projectedRevenue,
        renewedAmount: currentRevenue,
        lostAmount: moneyByCurrency(lost),
        mrrRenewable: projectedRevenue,
        renewalRate: eligible > 0 ? Number(((paid.length / eligible) * 100).toFixed(2)) : 0,
        atRiskCustomers: new Set(
          [...upcoming.filter((renewal) => renewal.dueAt < next7), ...overdue].map(
            (renewal) => renewal.subscription.contactId,
          ),
        ).size,
        projectedRevenue,
        recoveredRevenue: currentRevenue,
        previousMonthRenewedAmount: previousRevenue,
      },
      financial: {
        currentExpenses: monthlyExpenses,
        projectedProfit: this.subtractMoney(projectedRevenue, monthlyExpenses),
      },
      critical: overdue.slice(0, 20).map((renewal) => this.publicRenewal(renewal)),
      upcoming: upcoming.slice(0, 20).map((renewal) => this.publicRenewal(renewal)),
      history: paid.slice(0, 20).map((renewal) => this.publicRenewal(renewal)),
    };
  }

  async calendar(
    query: RenewalCenterQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.assertRead(user);
    const records = await this.prisma.renewal.findMany({
      where: this.where(query, user.organizationId),
      include: renewalInclude,
      orderBy: { dueAt: 'asc' },
      take: 2_000,
    });
    const grouped = new Map<string, RenewalRecord[]>();
    for (const record of records) {
      const key = dateKey(record.dueAt);
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    }
    return {
      data: [...grouped.entries()].map(([date, items]) => ({
        date,
        items: items.map((item) => this.publicRenewal(item)),
      })),
    };
  }

  async updateWorkflow(
    id: string,
    dto: UpdateRenewalWorkflowDto,
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    this.assertRead(user);
    const current = await this.prisma.renewal.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: renewalInclude,
    });
    if (!current) this.notFound();
    this.access.assertMutate(user, current.userId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.renewal.update({
        where: { organizationId_id: { organizationId: user.organizationId, id } },
        data: { workflowStatus: dto.workflowStatus, notes: dto.note?.trim() || current.notes },
      });
      await transaction.activity.create({
        data: {
          organizationId: user.organizationId,
          userId: user.userId,
          contactId: current.subscription.contactId,
          type: ActivityType.STATUS_CHANGE,
          title: 'Estado de renovación actualizado',
          description: `${workflowLabel(current.workflowStatus)} → ${workflowLabel(dto.workflowStatus)}`,
          metadata: { renewalId: id, workflowStatus: dto.workflowStatus },
          requestId,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'RENEWAL_WORKFLOW_STATUS_CHANGED',
        tableName: 'Renewal',
        recordId: id,
        previousValue: { workflowStatus: current.workflowStatus },
        newValue: { workflowStatus: dto.workflowStatus },
        requestId,
      });
    });
    const updated = await this.prisma.renewal.findFirstOrThrow({
      where: { id, organizationId: user.organizationId },
      include: renewalInclude,
    });
    return this.publicRenewal(updated);
  }

  async generateReminders(
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<Record<string, number>> {
    this.assertRead(user);
    const now = new Date();
    const from = addDays(startOfDay(now), -7);
    const to = addDays(startOfDay(now), 31);
    const records = await this.prisma.renewal.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        dueAt: { gte: from, lt: to },
        status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        workflowStatus: { notIn: [RenewalWorkflowStatus.RENEWED, RenewalWorkflowStatus.CANCELLED] },
      },
      include: renewalInclude,
    });
    let created = 0;
    let delivered = 0;
    await this.prisma.$transaction(async (transaction) => {
      for (const renewal of records) {
        for (const reminder of this.reminderDefinitions(renewal.dueAt)) {
          const entry = await transaction.renewalReminder.upsert({
            where: {
              organizationId_renewalId_kind: {
                organizationId: user.organizationId,
                renewalId: renewal.id,
                kind: reminder.kind,
              },
            },
            update: { scheduledFor: reminder.scheduledFor, userId: renewal.userId },
            create: {
              organizationId: user.organizationId,
              renewalId: renewal.id,
              userId: renewal.userId,
              kind: reminder.kind,
              scheduledFor: reminder.scheduledFor,
            },
          });
          if (
            entry.status === RenewalReminderStatus.DELIVERED ||
            reminder.scheduledFor > now ||
            !renewal.userId
          )
            continue;
          const deduplicationKey = `renewal-reminder:${renewal.id}:${reminder.kind}`;
          const notification = await transaction.notification.upsert({
            where: {
              organizationId_deduplicationKey: {
                organizationId: user.organizationId,
                deduplicationKey,
              },
            },
            update: {},
            create: {
              organizationId: user.organizationId,
              userId: renewal.userId,
              type: 'RENEWAL_REMINDER',
              title: `Renovación ${reminder.label}`,
              body: `${renewal.subscription.contact.firstName ?? 'Cliente'} tiene una renovación para gestionar.`,
              status: NotificationStatus.UNREAD,
              actionUrl: '/renewals',
              metadata: { renewalId: renewal.id, kind: reminder.kind },
              requestId,
              deduplicationKey,
            },
          });
          await transaction.renewalReminder.update({
            where: { organizationId_id: { organizationId: user.organizationId, id: entry.id } },
            data: {
              status: RenewalReminderStatus.DELIVERED,
              notificationId: notification.id,
              deliveredAt: now,
            },
          });
          delivered += 1;
        }
      }
      created = await transaction.renewalReminder.count({
        where: { organizationId: user.organizationId, createdAt: { gte: now } },
      });
    });
    return { created, delivered };
  }

  async reminders(user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.assertRead(user);
    const records = await this.prisma.renewalReminder.findMany({
      where: { organizationId: user.organizationId },
      include: {
        renewal: { include: renewalInclude },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 500,
    });
    return {
      data: records.map((record) => ({
        id: record.id,
        renewalId: record.renewalId,
        kind: record.kind,
        status: record.status,
        scheduledFor: record.scheduledFor,
        deliveredAt: record.deliveredAt,
        assignedTo: record.user,
        renewal: this.publicRenewal(record.renewal),
      })),
    };
  }

  async customer(contactId: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.assertRead(user);
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId: user.organizationId, deletedAt: null },
      include: {
        subscriptions: {
          where: { deletedAt: null },
          orderBy: { nextBillingAt: 'asc' },
          select: {
            id: true,
            productNameSnapshot: true,
            startsAt: true,
            currentPeriodEnd: true,
            nextBillingAt: true,
            amount: true,
            currency: true,
            status: true,
            renewals: {
              where: { deletedAt: null },
              orderBy: { dueAt: 'desc' },
              select: {
                id: true,
                status: true,
                workflowStatus: true,
                dueAt: true,
                paidAt: true,
                amount: true,
                currency: true,
              },
            },
          },
        },
      },
    });
    if (!contact) this.notFound();
    const allRenewals = contact.subscriptions.flatMap((subscription) => subscription.renewals);
    const ltv = moneyByCurrency(
      allRenewals.filter((renewal) => renewal.status === RenewalStatus.PAID),
    );
    return {
      contact: {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        country: contact.country,
      },
      products: contact.subscriptions.map((subscription) => ({
        id: subscription.id,
        productName: subscription.productNameSnapshot,
        startsAt: subscription.startsAt,
        expiresAt: subscription.currentPeriodEnd,
        nextRenewalAt: subscription.nextBillingAt,
        amount: subscription.amount.toFixed(2),
        currency: subscription.currency,
        status: subscription.status,
        renewals: subscription.renewals.map((renewal) => ({
          id: renewal.id,
          status: renewal.status,
          workflowStatus: renewal.workflowStatus,
          dueAt: renewal.dueAt,
          paidAt: renewal.paidAt,
          amount: renewal.amount.toFixed(2),
          currency: renewal.currency,
        })),
      })),
      renewalCount: allRenewals.length,
      mrr: moneyByCurrency(
        contact.subscriptions.filter((subscription) => subscription.status === 'ACTIVE'),
      ),
      ltv,
      currentStatus: allRenewals[0]?.workflowStatus ?? RenewalWorkflowStatus.PENDING,
    };
  }

  async report(
    query: RenewalReportQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.assertRead(user);
    const records = await this.prisma.renewal.findMany({
      where: this.where(query, user.organizationId),
      include: renewalInclude,
      orderBy: { dueAt: 'asc' },
      take: 10_000,
    });
    const groups = new Map<
      string,
      { label: string; currency: string; amount: Prisma.Decimal; count: number; paid: number }
    >();
    for (const record of records) {
      const key = this.groupKey(record, query.groupBy);
      const mapKey = `${key}|${record.currency}`;
      const previous = groups.get(mapKey) ?? {
        label: key,
        currency: record.currency,
        amount: new Prisma.Decimal(0),
        count: 0,
        paid: 0,
      };
      previous.amount = previous.amount.plus(record.amount);
      previous.count += 1;
      if (record.status === RenewalStatus.PAID) previous.paid += 1;
      groups.set(mapKey, previous);
    }
    return {
      groupBy: query.groupBy,
      data: [...groups.values()].map((row) => ({ ...row, amount: row.amount.toFixed(2) })),
    };
  }

  async exportCsv(query: RenewalReportQueryDto, user: AuthenticatedUser): Promise<string> {
    const report = await this.report(query, user);
    const rows = Array.isArray(report.data) ? report.data : [];
    return [
      ['Grupo', 'Moneda', 'Monto', 'Renovaciones', 'Pagadas'].map(csvEscape).join(','),
      ...rows.map((row) => {
        const item = row as Record<string, unknown>;
        return [item.label, item.currency, item.amount, item.count, item.paid]
          .map(csvEscape)
          .join(',');
      }),
    ].join('\n');
  }

  async importPreview(
    dto: RenewalImportDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.assertCreate(user);
    const rows = parseRenewalCsv(dto.csv);
    const validated = [];
    for (const row of rows)
      validated.push(await this.validateImportRow(this.prisma, row, user.organizationId));
    return this.importResponse(validated);
  }

  async importCsv(
    dto: RenewalImportDto,
    user: AuthenticatedUser,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    this.assertCreate(user);
    const rows = parseRenewalCsv(dto.csv);
    const result = await this.prisma.$transaction(async (transaction) => {
      const validated: ValidatedImportRow[] = [];
      for (const row of rows)
        validated.push(await this.validateImportRow(transaction, row, user.organizationId));
      const created: string[] = [];
      for (const row of validated.filter((item) => item.valid)) {
        if (
          !row.subscriptionId ||
          !row.sourceSaleId ||
          !row.periodStart ||
          !row.periodEnd ||
          !row.amount ||
          !row.currency ||
          !row.status ||
          !row.workflowStatus ||
          !row.cycleKey
        )
          continue;
        const subscription = await transaction.subscription.findFirstOrThrow({
          where: { organizationId: user.organizationId, id: row.subscriptionId, deletedAt: null },
        });
        const existing = await transaction.renewal.findUnique({
          where: {
            organizationId_subscriptionId_cycleKey: {
              organizationId: user.organizationId,
              subscriptionId: row.subscriptionId,
              cycleKey: row.cycleKey,
            },
          },
          select: { id: true },
        });
        if (existing) continue;
        const createdRenewal = await transaction.renewal.create({
          data: {
            organizationId: user.organizationId,
            subscriptionId: subscription.id,
            sourceSaleId: row.sourceSaleId,
            userId: row.userId ?? subscription.userId,
            status: row.status,
            workflowStatus: row.workflowStatus,
            billingCycle: subscription.billingCycle,
            customIntervalDays: subscription.customIntervalDays,
            amount: row.amount,
            currency: row.currency,
            dueAt: row.periodEnd,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            cycleKey: row.cycleKey,
            paidAt: row.status === RenewalStatus.PAID ? row.periodEnd : null,
            snapshotVersion: subscription.snapshotVersion,
            productNameSnapshot: subscription.productNameSnapshot,
            skuSnapshot: subscription.skuSnapshot,
            catalogSnapshot: subscription.catalogSnapshot as Prisma.InputJsonValue,
            notes: row.notes ? `Importación histórica: ${row.notes}` : 'Importación histórica',
          },
          select: { id: true },
        });
        created.push(createdRenewal.id);
        await transaction.activity.create({
          data: {
            organizationId: user.organizationId,
            userId: user.userId,
            contactId: row.contactId,
            type: ActivityType.SYSTEM,
            title: 'Renovación importada',
            metadata: { renewalId: createdRenewal.id, source: 'CSV_IMPORT' },
            requestId,
          },
        });
      }
      await this.audit.recordWithClient(transaction, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'RENEWAL_CSV_IMPORTED',
        tableName: 'Renewal',
        recordId: randomUUID(),
        newValue: { rows: rows.length, created: created.length },
        requestId,
      });
      return { validated, created };
    });
    return { ...this.importResponse(result.validated), created: result.created.length };
  }

  private async validateImportRow(
    client: DbClient,
    row: RenewalCsvRow,
    organizationId: string,
  ): Promise<ValidatedImportRow> {
    const contactReference = csvValue(row.values, 'Cliente', 'Contact', 'contactId');
    const productReference = csvValue(row.values, 'Producto', 'Product', 'productId');
    const startValue = csvValue(row.values, 'Fecha inicio', 'startDate', 'periodStart');
    const endValue = csvValue(
      row.values,
      'Fecha vencimiento',
      'Fecha de vencimiento',
      'endDate',
      'periodEnd',
    );
    const amountValue = csvValue(row.values, 'Monto', 'Amount');
    const currency = csvValue(row.values, 'Moneda', 'Currency').toUpperCase();
    const state = csvValue(row.values, 'Estado', 'Status');
    const responsibleReference = csvValue(row.values, 'Responsable', 'assignedUserId', 'userId');
    const notes = csvValue(row.values, 'Notas', 'Notes') || null;
    const errors: string[] = [];
    const warnings: string[] = [];
    const contactMatches = await client.contact.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(contactReference && /^[0-9a-f-]{36}$/i.test(contactReference)
          ? { id: contactReference }
          : {
              OR: [
                { email: contactReference.toLowerCase() },
                { phone: contactReference },
                { firstName: contactReference },
              ],
            }),
      },
      select: { id: true },
      take: 2,
    });
    if (contactMatches.length === 0) errors.push('Cliente no encontrado en la organización.');
    if (contactMatches.length > 1) errors.push('Cliente ambiguo; usa el UUID del contacto.');
    const contactId = contactMatches[0]?.id ?? null;
    const subscriptions = contactId
      ? await client.subscription.findMany({
          where: {
            organizationId,
            contactId,
            deletedAt: null,
            ...(productReference && /^[0-9a-f-]{36}$/i.test(productReference)
              ? { productId: productReference }
              : productReference
                ? { productNameSnapshot: { equals: productReference, mode: 'insensitive' } }
                : {}),
          },
          select: {
            id: true,
            saleId: true,
            userId: true,
            billingCycle: true,
            customIntervalDays: true,
            snapshotVersion: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            catalogSnapshot: true,
          },
          take: 2,
        })
      : [];
    if (subscriptions.length === 0)
      errors.push('No existe una suscripción compatible para importar el ciclo.');
    if (subscriptions.length > 1) errors.push('Producto ambiguo; usa productId en el encabezado.');
    const subscription = subscriptions[0];
    const responsibleMatches = responsibleReference
      ? await client.user.findMany({
          where: {
            organizationId,
            deletedAt: null,
            status: 'ACTIVE',
            ...(responsibleReference && /^[0-9a-f-]{36}$/i.test(responsibleReference)
              ? { id: responsibleReference }
              : {
                  OR: [
                    { email: responsibleReference.toLowerCase() },
                    { firstName: responsibleReference },
                  ],
                }),
          },
          select: { id: true },
          take: 2,
        })
      : [];
    if (responsibleMatches.length > 1) errors.push('Responsable ambiguo; usa su UUID.');
    if (responsibleReference && responsibleMatches.length === 0)
      errors.push('Responsable no encontrado o inactivo.');
    const periodStart = new Date(startValue);
    const periodEnd = new Date(endValue);
    if (!startValue || Number.isNaN(periodStart.getTime())) errors.push('Fecha inicio inválida.');
    if (!endValue || Number.isNaN(periodEnd.getTime())) errors.push('Fecha vencimiento inválida.');
    if (
      !Number.isNaN(periodStart.getTime()) &&
      !Number.isNaN(periodEnd.getTime()) &&
      periodEnd <= periodStart
    )
      errors.push('La fecha de vencimiento debe ser posterior al inicio.');
    let amount: Prisma.Decimal | null = null;
    try {
      amount = new Prisma.Decimal(amountValue.replace(',', '.'));
      if (amount.isNegative() || amount.isZero()) errors.push('El monto debe ser mayor que cero.');
    } catch {
      errors.push('Monto inválido.');
    }
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('La moneda debe usar ISO 4217 de tres letras.');
    const workflowStatus = this.importWorkflowStatus(state);
    if (!workflowStatus) errors.push('Estado de renovación no reconocido.');
    const status =
      workflowStatus === RenewalWorkflowStatus.CANCELLED
        ? RenewalStatus.CANCELLED
        : workflowStatus === RenewalWorkflowStatus.PAID ||
            workflowStatus === RenewalWorkflowStatus.RENEWED
          ? RenewalStatus.PAID
          : periodEnd <= new Date()
            ? RenewalStatus.OVERDUE
            : RenewalStatus.PENDING;
    const cycleKey =
      subscription && !Number.isNaN(periodStart.getTime())
        ? `${subscription.id}:${periodStart.toISOString()}`
        : null;
    const existing =
      cycleKey && subscription
        ? await client.renewal.findUnique({
            where: {
              organizationId_subscriptionId_cycleKey: {
                organizationId,
                subscriptionId: subscription.id,
                cycleKey,
              },
            },
            select: { id: true },
          })
        : null;
    if (existing) warnings.push(`El ciclo ya existe (${existing.id}) y será omitido.`);
    return {
      line: row.line,
      valid: errors.length === 0,
      errors,
      warnings,
      contactId,
      subscriptionId: subscription?.id ?? null,
      sourceSaleId: subscription?.saleId ?? null,
      periodStart: Number.isNaN(periodStart.getTime()) ? null : periodStart,
      periodEnd: Number.isNaN(periodEnd.getTime()) ? null : periodEnd,
      amount,
      currency: currency || null,
      status,
      workflowStatus: workflowStatus ?? null,
      userId: responsibleMatches[0]?.id ?? null,
      notes,
      cycleKey,
    };
  }

  private importResponse(rows: ValidatedImportRow[]): Record<string, unknown> {
    return {
      valid: rows.filter((row) => row.valid).length,
      invalid: rows.filter((row) => !row.valid).length,
      duplicates: rows.filter((row) => row.warnings.length > 0).length,
      rows: rows.map((row) => ({ ...row, amount: row.amount?.toFixed(2) ?? null })),
    };
  }

  private importWorkflowStatus(value: string): RenewalWorkflowStatus | null {
    const normalized = value
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replaceAll(' ', '_');
    const aliases: Record<string, RenewalWorkflowStatus> = {
      PENDING: RenewalWorkflowStatus.PENDING,
      PENDIENTE: RenewalWorkflowStatus.PENDING,
      CONTACTAR: RenewalWorkflowStatus.CONTACTED,
      CONTACTED: RenewalWorkflowStatus.CONTACTED,
      EN_CONVERSACION: RenewalWorkflowStatus.IN_CONVERSATION,
      IN_CONVERSATION: RenewalWorkflowStatus.IN_CONVERSATION,
      PROMESA_DE_PAGO: RenewalWorkflowStatus.PAYMENT_PROMISE,
      PAYMENT_PROMISE: RenewalWorkflowStatus.PAYMENT_PROMISE,
      PAGADO: RenewalWorkflowStatus.PAID,
      PAID: RenewalWorkflowStatus.PAID,
      RENOVADO: RenewalWorkflowStatus.RENEWED,
      RENEWED: RenewalWorkflowStatus.RENEWED,
      NO_RENOVO: RenewalWorkflowStatus.NOT_RENEWED,
      NOT_RENEWED: RenewalWorkflowStatus.NOT_RENEWED,
      CANCELADO: RenewalWorkflowStatus.CANCELLED,
      CANCELLED: RenewalWorkflowStatus.CANCELLED,
      PERDIDO: RenewalWorkflowStatus.LOST,
      LOST: RenewalWorkflowStatus.LOST,
    };
    return aliases[normalized] ?? null;
  }

  private reminderDefinitions(
    dueAt: Date,
  ): Array<{ kind: RenewalReminderKind; scheduledFor: Date; label: string }> {
    const dueDay = startOfDay(dueAt);
    const definitions: ReadonlyArray<readonly [RenewalReminderKind, number, string]> = [
      [RenewalReminderKind.DAYS_30, -30, 'en 30 días'],
      [RenewalReminderKind.DAYS_15, -15, 'en 15 días'],
      [RenewalReminderKind.DAYS_7, -7, 'en 7 días'],
      [RenewalReminderKind.DAYS_3, -3, 'en 3 días'],
      [RenewalReminderKind.DAYS_1, -1, 'mañana'],
      [RenewalReminderKind.DUE_TODAY, 0, 'hoy'],
      [RenewalReminderKind.OVERDUE_3, 3, 'vencida hace 3 días'],
      [RenewalReminderKind.OVERDUE_7, 7, 'vencida hace 7 días'],
    ];
    return definitions.map(([kind, offset, label]) => ({
      kind,
      scheduledFor: addDays(dueDay, offset),
      label,
    }));
  }

  private groupKey(record: RenewalRecord, groupBy: RenewalReportQueryDto['groupBy']): string {
    if (groupBy === 'product') return record.productNameSnapshot;
    if (groupBy === 'country') return record.subscription.contact.country ?? 'Sin país';
    if (groupBy === 'seller')
      return record.owner
        ? `${record.owner.firstName} ${record.owner.lastName ?? ''}`.trim()
        : 'Sin responsable';
    if (groupBy === 'customer')
      return (
        `${record.subscription.contact.firstName ?? ''} ${record.subscription.contact.lastName ?? ''}`.trim() ||
        record.subscription.contact.email ||
        record.subscription.contact.phone ||
        'Sin nombre'
      );
    if (groupBy === 'year') return String(record.dueAt.getUTCFullYear());
    if (groupBy === 'quarter')
      return `${record.dueAt.getUTCFullYear()}-Q${Math.floor(record.dueAt.getUTCMonth() / 3) + 1}`;
    return record.dueAt.toISOString().slice(0, 7);
  }

  private subtractMoney(
    left: Array<{ currency: string; amount: string }>,
    right: Array<{ currency: string; amount: string }>,
  ) {
    const costs = new Map(right.map((row) => [row.currency, new Prisma.Decimal(row.amount)]));
    return left.map((row) => ({
      currency: row.currency,
      amount: new Prisma.Decimal(row.amount).minus(costs.get(row.currency) ?? 0).toFixed(2),
    }));
  }

  private where(query: RenewalCenterQueryDto, organizationId: string): Prisma.RenewalWhereInput {
    const subscription: Prisma.SubscriptionWhereInput = {};
    if (query.country) subscription.contact = { country: query.country.toUpperCase() };
    if (query.productId) subscription.productId = query.productId;
    if (query.contactId) subscription.contactId = query.contactId;
    return {
      organizationId,
      deletedAt: null,
      ...(Object.keys(subscription).length > 0 ? { subscription } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.workflowStatus ? { workflowStatus: query.workflowStatus } : {}),
      ...(query.from || query.to
        ? {
            dueAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  private dashboardWhere(
    query: RenewalDashboardQueryDto,
    organizationId: string,
  ): Prisma.RenewalWhereInput {
    const center = new RenewalCenterQueryDto();
    if (query.country) center.country = query.country;
    if (query.productId) center.productId = query.productId;
    if (query.userId) center.userId = query.userId;
    return this.where(center, organizationId);
  }

  private publicRenewal(record: RenewalRecord): Record<string, unknown> {
    const contact = record.subscription.contact;
    return {
      id: record.id,
      subscriptionId: record.subscriptionId,
      sourceSaleId: record.sourceSaleId,
      generatedSaleId: record.generatedSaleId,
      status: record.status,
      workflowStatus: record.workflowStatus,
      workflowLabel: workflowLabel(record.workflowStatus),
      amount: record.amount.toFixed(2),
      currency: record.currency,
      dueAt: record.dueAt,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
      paidAt: record.paidAt,
      product: { id: record.subscription.productId, name: record.productNameSnapshot },
      customer: {
        id: contact.id,
        name:
          `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() ||
          contact.email ||
          contact.phone,
        email: contact.email,
        phone: contact.phone,
        country: contact.country,
      },
      assignedTo: record.owner,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private assertRead(user: AuthenticatedUser): void {
    this.access.assertRead(user);
  }

  private assertCreate(user: AuthenticatedUser): void {
    this.access.assertCreate(user);
  }

  private notFound(): never {
    throw new HttpException(
      { statusCode: 404, code: 'RENEWAL_NOT_FOUND', message: 'La renovación no existe.' },
      HttpStatus.NOT_FOUND,
    );
  }
}
