import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ExpenseFrequency, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { isSupportedCurrency } from '../commercial/currency';
import {
  CreateCategoryDto,
  CreateExpenseDto,
  CreateRecurringExpenseDto,
  FinancialPeriodQueryDto,
  ListExpensesQueryDto,
  UpdateCategoryDto,
  UpdateExpenseDto,
  UpdateRecurringExpenseDto,
} from './dto/financial.dto';
import { FinancialDashboard, FinancialRequestMetadata } from './financial.types';

const VARIABLE_CATEGORY_NAMES = new Set(['Publicidad', 'Comisiones', 'Impuestos']);

function dateRange(month: string | undefined): { from: Date; to: Date; key: string } {
  const base = month ? DateTime.fromISO(month, { zone: 'UTC' }) : DateTime.utc();
  if (!base.isValid) throw new UnprocessableEntityException('El mes financiero no es válido.');
  const start = base.startOf('month');
  return {
    from: start.toJSDate(),
    to: start.plus({ months: 1 }).toJSDate(),
    key: start.toFormat('yyyy-MM'),
  };
}

function cleanText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ?? null;
}

function assertNonNegativeAmount(value: string): string {
  const amount = new Prisma.Decimal(value);
  if (!amount.isFinite() || amount.isNegative())
    throw new UnprocessableEntityException({
      code: 'FINANCIAL_AMOUNT_INVALID',
      message: 'El monto debe ser un número finito y no negativo.',
    });
  return value;
}

function assertDateRange(start: Date | undefined, end: Date | undefined): void {
  if (start && Number.isNaN(start.getTime()))
    throw new UnprocessableEntityException('La fecha de inicio no es válida.');
  if (end && Number.isNaN(end.getTime()))
    throw new UnprocessableEntityException('La fecha de término no es válida.');
  if (start && end && end <= start)
    throw new UnprocessableEntityException('La fecha de término debe ser posterior al inicio.');
}

function nextDate(date: Date, frequency: ExpenseFrequency): Date {
  const value = DateTime.fromJSDate(date, { zone: 'UTC' });
  const result =
    frequency === ExpenseFrequency.WEEKLY
      ? value.plus({ weeks: 1 })
      : frequency === ExpenseFrequency.ANNUAL
        ? value.plus({ years: 1 })
        : value.plus({ months: 1 });
  return result.toJSDate();
}

@Injectable()
export class FinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listCategories(user: AuthenticatedUser) {
    return this.prisma.expenseCategory.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createCategory(
    dto: CreateCategoryDto,
    user: AuthenticatedUser,
    metadata: FinancialRequestMetadata,
  ) {
    const name = dto.name.trim();
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { organizationId: user.organizationId, name, deletedAt: null },
    });
    if (existing)
      throw new ConflictException({
        code: 'FINANCIAL_CATEGORY_EXISTS',
        message: 'La categoría ya existe.',
      });
    const category = await this.prisma.expenseCategory.create({
      data: {
        organizationId: user.organizationId,
        name,
        description: cleanText(dto.description),
        color: dto.color?.toUpperCase() ?? null,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'FINANCIAL_CATEGORY_CREATED',
      tableName: 'ExpenseCategory',
      recordId: category.id,
      newValue: { name: category.name },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return category;
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    user: AuthenticatedUser,
    metadata: FinancialRequestMetadata,
  ) {
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!existing)
      throw new NotFoundException({
        code: 'FINANCIAL_CATEGORY_NOT_FOUND',
        message: 'Categoría no encontrada.',
      });
    const data: Prisma.ExpenseCategoryUncheckedUpdateInput = {
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: cleanText(dto.description) } : {}),
      ...(dto.color !== undefined ? { color: dto.color.toUpperCase() } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    };
    const category = await this.prisma.expenseCategory.update({ where: { id }, data });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'FINANCIAL_CATEGORY_UPDATED',
      tableName: 'ExpenseCategory',
      recordId: id,
      previousValue: { name: existing.name, active: existing.active },
      newValue: { name: category.name, active: category.active },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return category;
  }

  async archiveCategory(id: string, user: AuthenticatedUser, metadata: FinancialRequestMetadata) {
    const existing = await this.prisma.expenseCategory.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!existing)
      throw new NotFoundException({
        code: 'FINANCIAL_CATEGORY_NOT_FOUND',
        message: 'Categoría no encontrada.',
      });
    const category = await this.prisma.expenseCategory.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'FINANCIAL_CATEGORY_ARCHIVED',
      tableName: 'ExpenseCategory',
      recordId: id,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return category;
  }

  async listExpenses(query: ListExpensesQueryDto, user: AuthenticatedUser) {
    const page = query.page || 1;
    const limit = query.limit || 25;
    const where: Prisma.ExpenseWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
    };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.from || query.to)
      where.expenseDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    if (query.search?.trim())
      where.OR = [
        { description: { contains: query.search.trim(), mode: 'insensitive' } },
        { vendorName: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { category: { select: { id: true, name: true, color: true } } },
        orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async assertReferences(
    organizationId: string,
    dto: { categoryId?: string; campaignId?: string },
  ) {
    if (dto.categoryId) {
      const category = await this.prisma.expenseCategory.findFirst({
        where: { id: dto.categoryId, organizationId, active: true, deletedAt: null },
      });
      if (!category)
        throw new UnprocessableEntityException({
          code: 'FINANCIAL_CATEGORY_INVALID',
          message: 'La categoría no pertenece a la organización o está inactiva.',
        });
    }
    if (dto.campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: dto.campaignId, organizationId, deletedAt: null },
      });
      if (!campaign)
        throw new UnprocessableEntityException({
          code: 'FINANCIAL_CAMPAIGN_INVALID',
          message: 'La campaña no pertenece a la organización.',
        });
    }
  }

  private assertCurrency(value: string): string {
    const currency = value.trim().toUpperCase();
    if (!isSupportedCurrency(currency))
      throw new UnprocessableEntityException({
        code: 'FINANCIAL_CURRENCY_INVALID',
        message: 'La moneda no está soportada.',
      });
    return currency;
  }

  async createExpense(
    dto: CreateExpenseDto,
    user: AuthenticatedUser,
    metadata: FinancialRequestMetadata,
  ) {
    await this.assertReferences(user.organizationId, dto);
    const currency = this.assertCurrency(dto.currency);
    const startDate = dto.startDate ? new Date(dto.startDate) : undefined;
    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;
    assertDateRange(startDate, endDate);
    const data: Prisma.ExpenseUncheckedCreateInput = {
      organizationId: user.organizationId,
      categoryId: dto.categoryId ?? null,
      campaignId: dto.campaignId ?? null,
      amount: assertNonNegativeAmount(dto.amount),
      currency,
      expenseDate: new Date(dto.expenseDate),
      vendorName: cleanText(dto.vendorName),
      description: cleanText(dto.description),
      paymentMethod: dto.paymentMethod,
      frequency: dto.frequency,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      active: dto.active ?? true,
      notes: cleanText(dto.notes),
      receiptUrl: cleanText(dto.receiptUrl),
    };
    const expense = await this.prisma.expense.create({ data });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'FINANCIAL_EXPENSE_CREATED',
      tableName: 'Expense',
      recordId: expense.id,
      newValue: {
        amount: expense.amount.toString(),
        currency: expense.currency,
        expenseDate: expense.expenseDate,
      },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return expense;
  }

  async updateExpense(
    id: string,
    dto: UpdateExpenseDto,
    user: AuthenticatedUser,
    metadata: FinancialRequestMetadata,
  ) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!existing)
      throw new NotFoundException({
        code: 'FINANCIAL_EXPENSE_NOT_FOUND',
        message: 'Gasto no encontrado.',
      });
    await this.assertReferences(user.organizationId, dto);
    const startDate = dto.startDate !== undefined ? new Date(dto.startDate) : undefined;
    const endDate = dto.endDate !== undefined ? new Date(dto.endDate) : undefined;
    assertDateRange(
      startDate ?? existing.startDate ?? undefined,
      endDate ?? existing.endDate ?? undefined,
    );
    const data: Prisma.ExpenseUncheckedUpdateInput = {
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.campaignId !== undefined ? { campaignId: dto.campaignId } : {}),
      ...(dto.amount !== undefined ? { amount: assertNonNegativeAmount(dto.amount) } : {}),
      ...(dto.currency !== undefined ? { currency: this.assertCurrency(dto.currency) } : {}),
      ...(dto.expenseDate !== undefined ? { expenseDate: new Date(dto.expenseDate) } : {}),
      ...(dto.vendorName !== undefined ? { vendorName: cleanText(dto.vendorName) } : {}),
      ...(dto.description !== undefined ? { description: cleanText(dto.description) } : {}),
      ...(dto.paymentMethod !== undefined ? { paymentMethod: dto.paymentMethod } : {}),
      ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
      ...(dto.startDate !== undefined ? { startDate: startDate as Date } : {}),
      ...(dto.endDate !== undefined ? { endDate: endDate as Date } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
      ...(dto.notes !== undefined ? { notes: cleanText(dto.notes) } : {}),
      ...(dto.receiptUrl !== undefined ? { receiptUrl: cleanText(dto.receiptUrl) } : {}),
    };
    const expense = await this.prisma.expense.update({ where: { id }, data });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'FINANCIAL_EXPENSE_UPDATED',
      tableName: 'Expense',
      recordId: id,
      previousValue: { amount: existing.amount.toString(), currency: existing.currency },
      newValue: { amount: expense.amount.toString(), currency: expense.currency },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return expense;
  }

  async archiveExpense(id: string, user: AuthenticatedUser, metadata: FinancialRequestMetadata) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!existing)
      throw new NotFoundException({
        code: 'FINANCIAL_EXPENSE_NOT_FOUND',
        message: 'Gasto no encontrado.',
      });
    const expense = await this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'FINANCIAL_EXPENSE_ARCHIVED',
      tableName: 'Expense',
      recordId: id,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return expense;
  }

  async createRecurring(
    dto: CreateRecurringExpenseDto,
    user: AuthenticatedUser,
    metadata: FinancialRequestMetadata,
  ) {
    await this.assertReferences(user.organizationId, dto);
    const currency = this.assertCurrency(dto.currency);
    if ((dto.frequency as ExpenseFrequency) === ExpenseFrequency.ONE_TIME)
      throw new UnprocessableEntityException({
        code: 'FINANCIAL_FREQUENCY_INVALID',
        message: 'Un gasto recurrente debe tener una frecuencia periódica.',
      });
    const startsOn = new Date(dto.startsOn);
    const endsOn = dto.endsOn ? new Date(dto.endsOn) : undefined;
    if (endsOn && endsOn <= startsOn)
      throw new UnprocessableEntityException('La fecha de término debe ser posterior al inicio.');
    assertDateRange(startsOn, endsOn);
    const data: Prisma.RecurringExpenseUncheckedCreateInput = {
      organizationId: user.organizationId,
      categoryId: dto.categoryId ?? null,
      name: dto.name.trim(),
      vendorName: cleanText(dto.vendorName),
      description: cleanText(dto.description),
      amount: assertNonNegativeAmount(dto.amount),
      currency,
      paymentMethod: dto.paymentMethod,
      frequency: dto.frequency,
      startsOn,
      endsOn: endsOn ?? null,
      nextOccurrenceDate: startsOn,
      notes: cleanText(dto.notes),
      receiptUrl: cleanText(dto.receiptUrl),
    };
    const recurring = await this.prisma.recurringExpense.create({ data });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'FINANCIAL_RECURRING_CREATED',
      tableName: 'RecurringExpense',
      recordId: recurring.id,
      newValue: { name: recurring.name, frequency: recurring.frequency },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return recurring;
  }

  async listRecurring(user: AuthenticatedUser) {
    return this.prisma.recurringExpense.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      include: { category: { select: { id: true, name: true, color: true } } },
      orderBy: [{ active: 'desc' }, { nextOccurrenceDate: 'asc' }],
    });
  }

  async updateRecurring(
    id: string,
    dto: UpdateRecurringExpenseDto,
    user: AuthenticatedUser,
    metadata: FinancialRequestMetadata,
  ) {
    const existing = await this.prisma.recurringExpense.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!existing)
      throw new NotFoundException({
        code: 'FINANCIAL_RECURRING_NOT_FOUND',
        message: 'Gasto recurrente no encontrado.',
      });
    await this.assertReferences(user.organizationId, dto);
    if ((dto.frequency as ExpenseFrequency | undefined) === ExpenseFrequency.ONE_TIME)
      throw new UnprocessableEntityException({
        code: 'FINANCIAL_FREQUENCY_INVALID',
        message: 'Un gasto recurrente debe tener una frecuencia periódica.',
      });
    if (dto.amount !== undefined) assertNonNegativeAmount(dto.amount);
    const nextEndsOn = dto.endsOn !== undefined ? new Date(dto.endsOn) : existing.endsOn;
    assertDateRange(existing.startsOn, nextEndsOn ?? undefined);
    const now = new Date();
    const data: Prisma.RecurringExpenseUncheckedUpdateInput = {
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.vendorName !== undefined ? { vendorName: cleanText(dto.vendorName) } : {}),
      ...(dto.description !== undefined ? { description: cleanText(dto.description) } : {}),
      ...(dto.amount !== undefined ? { amount: assertNonNegativeAmount(dto.amount) } : {}),
      ...(dto.currency !== undefined ? { currency: this.assertCurrency(dto.currency) } : {}),
      ...(dto.paymentMethod !== undefined ? { paymentMethod: dto.paymentMethod } : {}),
      ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
      ...(dto.endsOn !== undefined ? { endsOn: new Date(dto.endsOn) } : {}),
      ...(dto.notes !== undefined ? { notes: cleanText(dto.notes) } : {}),
      ...(dto.receiptUrl !== undefined ? { receiptUrl: cleanText(dto.receiptUrl) } : {}),
      ...(dto.pause ? { active: false, pausedAt: now } : {}),
      ...(dto.finish ? { active: false, finishedAt: now, nextOccurrenceDate: null } : {}),
      ...(dto.active !== undefined && !dto.pause && !dto.finish
        ? { active: dto.active, ...(dto.active ? { pausedAt: null, finishedAt: null } : {}) }
        : {}),
    };
    const recurring = await this.prisma.recurringExpense.update({ where: { id }, data });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'FINANCIAL_RECURRING_UPDATED',
      tableName: 'RecurringExpense',
      recordId: id,
      newValue: { active: recurring.active, nextOccurrenceDate: recurring.nextOccurrenceDate },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return recurring;
  }

  async generateDueRecurring(user: AuthenticatedUser, metadata: FinancialRequestMetadata) {
    const now = new Date();
    const due = await this.prisma.recurringExpense.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        active: true,
        nextOccurrenceDate: { lte: now },
      },
      orderBy: { nextOccurrenceDate: 'asc' },
      take: 100,
    });
    let generated = 0;
    for (const template of due) {
      await this.prisma.$transaction(async (transaction) => {
        const locked = await transaction.recurringExpense.findFirst({
          where: {
            id: template.id,
            organizationId: user.organizationId,
            active: true,
            deletedAt: null,
            nextOccurrenceDate: { lte: now },
          },
        });
        if (!locked || !locked.nextOccurrenceDate) return;
        const occurrenceKey = DateTime.fromJSDate(locked.nextOccurrenceDate, {
          zone: 'UTC',
        }).toFormat('yyyy-MM-dd');
        try {
          await transaction.expense.create({
            data: {
              organizationId: user.organizationId,
              recurringExpenseId: locked.id,
              categoryId: locked.categoryId,
              amount: locked.amount,
              currency: locked.currency,
              expenseDate: locked.nextOccurrenceDate,
              startDate: locked.startsOn,
              endDate: locked.endsOn,
              vendorName: locked.vendorName,
              description: locked.description,
              paymentMethod: locked.paymentMethod,
              frequency: locked.frequency,
              active: true,
              notes: locked.notes,
              receiptUrl: locked.receiptUrl,
              generated: true,
              occurrenceKey,
            },
          });
          generated += 1;
        } catch (error: unknown) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
            throw error;
        }
        const next = nextDate(locked.nextOccurrenceDate, locked.frequency);
        await transaction.recurringExpense.update({
          where: { id: locked.id },
          data: {
            nextOccurrenceDate: locked.endsOn && next > locked.endsOn ? null : next,
            ...(locked.endsOn && next > locked.endsOn ? { active: false, finishedAt: now } : {}),
          },
        });
      });
    }
    if (generated > 0)
      await this.audit.record({
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'FINANCIAL_RECURRING_GENERATED',
        tableName: 'RecurringExpense',
        recordId: user.organizationId,
        newValue: { generated },
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
    return { generated };
  }

  async dashboard(
    query: FinancialPeriodQueryDto,
    user: AuthenticatedUser,
  ): Promise<FinancialDashboard> {
    const range = dateRange(query.month);
    const previous = {
      from: DateTime.fromJSDate(range.from).minus({ months: 1 }).toJSDate(),
      to: range.from,
    };
    const currency = query.currency ? this.assertCurrency(query.currency) : undefined;
    const saleWhere = (from: Date, to: Date): Prisma.SaleWhereInput => ({
      organizationId: user.organizationId,
      deletedAt: null,
      status: { in: ['CONFIRMED', 'FULFILLED'] },
      ...(currency ? { currency } : {}),
      OR: [{ soldAt: { gte: from, lt: to } }, { soldAt: null, createdAt: { gte: from, lt: to } }],
    });
    const expenseWhere = (from: Date, to: Date): Prisma.ExpenseWhereInput => ({
      organizationId: user.organizationId,
      deletedAt: null,
      expenseDate: { gte: from, lt: to },
      ...(currency ? { currency } : {}),
    });
    const [
      sales,
      expenses,
      previousSales,
      previousExpenses,
      recurring,
      allExpenses,
      trendSales,
      trendExpenses,
      subscriptions,
    ] = await Promise.all([
      this.prisma.sale.aggregate({ where: saleWhere(range.from, range.to), _sum: { total: true } }),
      this.prisma.expense.aggregate({
        where: expenseWhere(range.from, range.to),
        _sum: { amount: true },
      }),
      this.prisma.sale.aggregate({
        where: saleWhere(previous.from, previous.to),
        _sum: { total: true },
      }),
      this.prisma.expense.aggregate({
        where: expenseWhere(previous.from, previous.to),
        _sum: { amount: true },
      }),
      this.prisma.recurringExpense.findMany({
        where: {
          organizationId: user.organizationId,
          active: true,
          deletedAt: null,
          nextOccurrenceDate: {
            gte: range.from,
            lt: DateTime.fromJSDate(range.to).plus({ months: 1 }).toJSDate(),
          },
          ...(currency ? { currency } : {}),
        },
        orderBy: { nextOccurrenceDate: 'asc' },
        take: 10,
        select: { id: true, name: true, amount: true, currency: true, nextOccurrenceDate: true },
      }),
      this.prisma.expense.findMany({
        where: expenseWhere(range.from, range.to),
        select: { amount: true, category: { select: { name: true } } },
      }),
      this.prisma.sale.findMany({
        where: {
          ...saleWhere(
            DateTime.fromJSDate(range.from).minus({ months: 11 }).startOf('month').toJSDate(),
            range.to,
          ),
        },
        select: { total: true, currency: true, soldAt: true, createdAt: true },
      }),
      this.prisma.expense.findMany({
        where: {
          ...expenseWhere(
            DateTime.fromJSDate(range.from).minus({ months: 11 }).startOf('month').toJSDate(),
            range.to,
          ),
        },
        select: { amount: true, currency: true, expenseDate: true },
      }),
      currency
        ? this.prisma.subscription.findMany({
            where: {
              organizationId: user.organizationId,
              deletedAt: null,
              status: 'ACTIVE',
              currency,
            },
            select: { amount: true, billingCycle: true, customIntervalDays: true },
          })
        : Promise.resolve([]),
    ]);
    const revenue = Number(sales._sum.total ?? 0);
    const expensesTotal = Number(expenses._sum.amount ?? 0);
    const previousRevenue = Number(previousSales._sum.total ?? 0);
    const previousExpenseTotal = Number(previousExpenses._sum.amount ?? 0);
    const variableCost = allExpenses
      .filter((row) => row.category?.name && VARIABLE_CATEGORY_NAMES.has(row.category.name))
      .reduce((sum, row) => sum + Number(row.amount), 0);
    const fixed = expensesTotal - variableCost;
    const mrr = subscriptions.reduce((sum, subscription) => {
      const amount = Number(subscription.amount);
      if (subscription.billingCycle === 'WEEKLY') return sum + (amount * 52) / 12;
      if (subscription.billingCycle === 'QUARTERLY') return sum + amount / 3;
      if (subscription.billingCycle === 'SEMI_ANNUAL') return sum + amount / 6;
      if (subscription.billingCycle === 'ANNUAL') return sum + amount / 12;
      if (subscription.billingCycle === 'CUSTOM' && subscription.customIntervalDays)
        return sum + (amount * 30) / subscription.customIntervalDays;
      return sum + amount;
    }, 0);
    const monthlyTrend = Array.from({ length: 12 }, (_, index) => {
      const month = DateTime.fromJSDate(range.from)
        .minus({ months: 11 - index })
        .toFormat('yyyy-MM');
      const monthRevenue = trendSales
        .filter(
          (row) =>
            DateTime.fromJSDate(row.soldAt ?? row.createdAt).toFormat('yyyy-MM') === month &&
            (!currency || row.currency === currency),
        )
        .reduce((sum, row) => sum + Number(row.total), 0);
      const monthExpenses = trendExpenses
        .filter(
          (row) =>
            DateTime.fromJSDate(row.expenseDate).toFormat('yyyy-MM') === month &&
            (!currency || row.currency === currency),
        )
        .reduce((sum, row) => sum + Number(row.amount), 0);
      return {
        month,
        revenue: monthRevenue.toFixed(2),
        expenses: monthExpenses.toFixed(2),
        netProfit: (monthRevenue - monthExpenses).toFixed(2),
      };
    });
    const netProfit = revenue - expensesTotal;
    const grossProfit = revenue - variableCost;
    return {
      month: range.key,
      currency: currency ?? null,
      revenue: revenue.toFixed(2),
      expenses: expensesTotal.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      netProfit: netProfit.toFixed(2),
      marginPercent: revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(2)) : 0,
      mrr: mrr.toFixed(2),
      arr: (mrr * 12).toFixed(2),
      estimatedCash: netProfit.toFixed(2),
      fixedMonthlyCost: fixed.toFixed(2),
      variableCost: variableCost.toFixed(2),
      breakEven: fixed.toFixed(2),
      previousMonth: {
        revenue: previousRevenue.toFixed(2),
        expenses: previousExpenseTotal.toFixed(2),
        netProfit: (previousRevenue - previousExpenseTotal).toFixed(2),
      },
      upcomingRecurringExpenses: recurring.map((row) => ({
        ...row,
        amount: row.amount.toString(),
      })),
      monthlyTrend,
    };
  }

  async profitability(user: AuthenticatedUser, query: FinancialPeriodQueryDto) {
    const range = dateRange(query.month);
    const currency = query.currency ? this.assertCurrency(query.currency) : undefined;
    const sales = await this.prisma.sale.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { in: ['CONFIRMED', 'FULFILLED'] },
        ...(currency ? { currency } : {}),
        OR: [
          { soldAt: { gte: range.from, lt: range.to } },
          { soldAt: null, createdAt: { gte: range.from, lt: range.to } },
        ],
      },
      include: {
        contact: { select: { country: true } },
        opportunity: { select: { campaign: { select: { id: true, name: true } } } },
        items: {
          where: { deletedAt: null },
          select: { productId: true, productNameSnapshot: true, total: true },
        },
      },
    });
    const byProduct = new Map<string, { revenue: number; sales: number }>();
    const byCountry = new Map<string, { revenue: number; sales: number }>();
    const byCampaign = new Map<string, { revenue: number; sales: number }>();
    for (const sale of sales) {
      const country = sale.contact.country ?? 'UNKNOWN';
      const countryRow = byCountry.get(country) ?? { revenue: 0, sales: 0 };
      countryRow.revenue += Number(sale.total);
      countryRow.sales += 1;
      byCountry.set(country, countryRow);
      const campaign = sale.opportunity?.campaign;
      if (campaign) {
        const row = byCampaign.get(campaign.id) ?? { revenue: 0, sales: 0 };
        row.revenue += Number(sale.total);
        row.sales += 1;
        byCampaign.set(campaign.id, row);
      }
      for (const item of sale.items) {
        const key = item.productId ?? item.productNameSnapshot;
        const row = byProduct.get(key) ?? { revenue: 0, sales: 0 };
        row.revenue += Number(item.total);
        row.sales += 1;
        byProduct.set(key, row);
      }
    }
    const map = (values: Map<string, { revenue: number; sales: number }>) =>
      [...values.entries()]
        .map(([key, value]) => ({
          key,
          revenue: value.revenue.toFixed(2),
          sales: value.sales,
          expense: '0.00',
          profit: value.revenue.toFixed(2),
        }))
        .sort((a, b) => Number(b.revenue) - Number(a.revenue));
    return {
      month: range.key,
      byProduct: map(byProduct),
      byCountry: map(byCountry),
      byCampaign: map(byCampaign),
      note: 'Los costos por dimensión se habilitan cuando existan gastos atribuibles a esa dimensión.',
    };
  }
}
