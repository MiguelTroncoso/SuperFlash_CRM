import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityType,
  BillingCycle,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RenewalStatus,
  SaleStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';

import { CommercialEventName } from '../../infrastructure/events/application-event-bus';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { COMMERCIAL_ERROR_CODES, commercialException } from '../commercial/commercial.errors';
import { CommercialRequestContext, jsonObject } from '../commercial/commercial.types';
import { CancelRenewalDto, CreateRenewalDto, ListRenewalsQueryDto } from './dto/renewals.dto';
import { RenewalsAccessPolicy } from './renewals.policy';

function sanitizeSnapshot(value: Prisma.JsonValue, includeCosts: boolean): Prisma.JsonValue {
  if (Array.isArray(value)) return value.map((item) => sanitizeSnapshot(item, includeCosts));
  if (value !== null && typeof value === 'object') {
    const output: Record<string, Prisma.JsonValue> = {};
    for (const [key, nested] of Object.entries(value) as Array<[string, Prisma.JsonValue]>) {
      if (!includeCosts && (key === 'costPrice' || key === 'minimumPrice')) continue;
      output[key] = sanitizeSnapshot(nested, includeCosts);
    }
    return output;
  }
  return value;
}

@Injectable()
export class RenewalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly access: RenewalsAccessPolicy,
  ) {}

  async createFromSubscription(
    subscriptionId: string,
    dto: CreateRenewalDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    const requestId = context.metadata.requestId ?? randomUUID();
    const result = await this.prisma.$transaction(async (transaction) => {
      const subscription = await this.lockSubscription(
        transaction,
        subscriptionId,
        context.user.organizationId,
      );
      if (
        subscription.status === SubscriptionStatus.CANCELLED ||
        subscription.status === SubscriptionStatus.EXPIRED
      )
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'No se puede renovar una suscripción finalizada.',
        );

      const periodStart =
        subscription.currentPeriodEnd ?? subscription.nextBillingAt ?? subscription.startsAt;
      const periodEnd = this.addCycle(
        periodStart,
        subscription.billingCycle,
        subscription.customIntervalDays,
      );
      if (!periodEnd)
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_ELIGIBLE,
          'La suscripción no tiene un intervalo de renovación válido.',
        );
      const cycleKey = this.cycleKey(subscription.id, periodStart);
      const existing = await transaction.renewal.findUnique({
        where: {
          organizationId_subscriptionId_cycleKey: {
            organizationId: context.user.organizationId,
            subscriptionId: subscription.id,
            cycleKey,
          },
        },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };

      const dueAt = dto.dueAt ? new Date(dto.dueAt) : periodStart;
      const renewal = await transaction.renewal.create({
        data: {
          organizationId: context.user.organizationId,
          subscriptionId: subscription.id,
          sourceSaleId: subscription.saleId,
          userId: subscription.userId ?? context.user.userId,
          status: RenewalStatus.PENDING,
          billingCycle: subscription.billingCycle,
          customIntervalDays: subscription.customIntervalDays,
          amount: subscription.amount,
          currency: subscription.currency,
          dueAt,
          periodStart,
          periodEnd,
          cycleKey,
          snapshotVersion: subscription.snapshotVersion,
          productNameSnapshot: subscription.productNameSnapshot,
          skuSnapshot: subscription.skuSnapshot,
          catalogSnapshot: subscription.catalogSnapshot as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: subscription.contactId,
          saleId: subscription.saleId,
          type: ActivityType.SYSTEM,
          title: 'Renovación creada',
          metadata: jsonObject({
            renewalId: renewal.id,
            cycleKey,
            status: RenewalStatus.PENDING,
          }),
          requestId,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'RENEWAL_CREATED',
        tableName: 'Renewal',
        recordId: renewal.id,
        newValue: jsonObject({
          subscriptionId,
          cycleKey,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          dueAt: dueAt.toISOString(),
        }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.enqueueEvent(transaction, 'RenewalCreated', renewal.id, context, requestId, {
        status: RenewalStatus.PENDING,
        cycleKey,
      });
      return { id: renewal.id, created: true };
    });
    return this.findOne(result.id, context.user);
  }

  async list(
    query: ListRenewalsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const where: Prisma.RenewalWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.subscriptionId ? { subscriptionId: query.subscriptionId } : {}),
      ...(query.dueFrom || query.dueTo
        ? {
            dueAt: {
              ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
              ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
            },
          }
        : {}),
    };
    const orderBy: Prisma.RenewalOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
    const [records, total] = await Promise.all([
      this.prisma.renewal.findMany({
        where,
        orderBy: [orderBy, { id: query.sortOrder }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.renewal.count({ where }),
    ]);
    return {
      data: records.map((record) => this.map(record, user)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const renewal = await this.prisma.renewal.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!renewal)
      this.notFound(COMMERCIAL_ERROR_CODES.RENEWAL_NOT_FOUND, 'La renovación no existe.');
    return this.map(renewal, user);
  }

  async markDue(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    return this.transitionDue(id, context);
  }

  async pay(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    const requestId = context.metadata.requestId ?? randomUUID();
    await this.prisma.$transaction(async (transaction) => {
      const renewal = await this.lockRenewal(transaction, id, context.user.organizationId);
      this.access.assertMutate(context.user, renewal.userId);
      if (renewal.status === RenewalStatus.PAID) return;
      if (renewal.status === RenewalStatus.CANCELLED)
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'La renovación está cancelada.',
        );

      const subscription = await this.lockSubscription(
        transaction,
        renewal.subscriptionId,
        context.user.organizationId,
      );
      if (subscription.status !== SubscriptionStatus.ACTIVE)
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'La suscripción debe estar activa para pagar la renovación.',
        );

      const item = await transaction.saleItem.findFirst({
        where: {
          organizationId: context.user.organizationId,
          id: subscription.saleItemId,
          deletedAt: null,
        },
        select: {
          productId: true,
          planId: true,
          variantId: true,
          priceBookEntryId: true,
          snapshotVersion: true,
          productNameSnapshot: true,
          productSlugSnapshot: true,
          productTypeSnapshot: true,
          fulfillmentModeSnapshot: true,
          requiresSubscriptionSnapshot: true,
          skuSnapshot: true,
          planNameSnapshot: true,
          variantNameSnapshot: true,
          billingPeriodUnitSnapshot: true,
          billingPeriodCountSnapshot: true,
          catalogSnapshot: true,
          quantity: true,
        },
      });
      if (!item)
        this.notFound(
          COMMERCIAL_ERROR_CODES.SALE_ITEM_NOT_FOUND,
          'El ítem original de la suscripción no existe.',
        );

      const sale = await transaction.sale.create({
        data: {
          organizationId: context.user.organizationId,
          contactId: subscription.contactId,
          userId: subscription.userId ?? context.user.userId,
          status: SaleStatus.CONFIRMED,
          subtotal: renewal.amount,
          discountAmount: 0,
          taxAmount: 0,
          total: renewal.amount,
          currency: renewal.currency,
          soldAt: new Date(),
          note: `Renovación ${renewal.id}`,
        },
        select: { id: true },
      });
      await transaction.saleItem.create({
        data: {
          organizationId: context.user.organizationId,
          saleId: sale.id,
          productId: item.productId,
          planId: item.planId,
          variantId: item.variantId,
          priceBookEntryId: item.priceBookEntryId,
          snapshotVersion: item.snapshotVersion,
          productNameSnapshot: item.productNameSnapshot,
          productSlugSnapshot: item.productSlugSnapshot,
          productTypeSnapshot: item.productTypeSnapshot,
          fulfillmentModeSnapshot: item.fulfillmentModeSnapshot,
          requiresSubscriptionSnapshot: item.requiresSubscriptionSnapshot,
          skuSnapshot: item.skuSnapshot,
          planNameSnapshot: item.planNameSnapshot,
          variantNameSnapshot: item.variantNameSnapshot,
          billingPeriodUnitSnapshot: item.billingPeriodUnitSnapshot,
          billingPeriodCountSnapshot: item.billingPeriodCountSnapshot,
          catalogSnapshot: item.catalogSnapshot as Prisma.InputJsonValue,
          quantity: item.quantity,
          unitPrice: renewal.amount.div(item.quantity),
          discountAmount: 0,
          taxAmount: 0,
          total: renewal.amount,
          currency: renewal.currency,
        },
      });
      const payment = await transaction.payment.create({
        data: {
          organizationId: context.user.organizationId,
          saleId: sale.id,
          grossAmount: renewal.amount,
          feeAmount: 0,
          netAmount: renewal.amount,
          currency: renewal.currency,
          method: PaymentMethod.MANUAL,
          reference: `renewal:${renewal.id}`,
          idempotencyKey: `renewal:${renewal.id}`,
          requestFingerprint: createHash('sha256')
            .update(`${sale.id}|${renewal.amount.toFixed(2)}|${renewal.currency}|renewal`)
            .digest('hex'),
          status: PaymentStatus.CONFIRMED,
          paymentDate: new Date(),
          confirmedAt: new Date(),
        },
        select: { id: true },
      });
      await transaction.renewal.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status: RenewalStatus.PAID,
          workflowStatus: 'RENEWED',
          paidAt: new Date(),
          generatedSaleId: sale.id,
          version: { increment: 1 },
        },
      });
      await transaction.subscription.update({
        where: {
          organizationId_id: {
            organizationId: context.user.organizationId,
            id: renewal.subscriptionId,
          },
        },
        data: {
          currentPeriodStart: renewal.periodStart,
          currentPeriodEnd: renewal.periodEnd,
          nextBillingAt: renewal.periodEnd,
          version: { increment: 1 },
        },
      });

      const nextPeriodStart = renewal.periodEnd;
      const nextPeriodEnd = this.addCycle(
        nextPeriodStart,
        subscription.billingCycle,
        subscription.customIntervalDays,
      );
      if (nextPeriodEnd) {
        const nextCycleKey = this.cycleKey(subscription.id, nextPeriodStart);
        const nextRenewal = await transaction.renewal.upsert({
          where: {
            organizationId_subscriptionId_cycleKey: {
              organizationId: context.user.organizationId,
              subscriptionId: subscription.id,
              cycleKey: nextCycleKey,
            },
          },
          update: {},
          create: {
            organizationId: context.user.organizationId,
            subscriptionId: subscription.id,
            sourceSaleId: sale.id,
            userId: subscription.userId ?? context.user.userId,
            status: RenewalStatus.PENDING,
            workflowStatus: 'PENDING',
            billingCycle: subscription.billingCycle,
            customIntervalDays: subscription.customIntervalDays,
            amount: renewal.amount,
            currency: renewal.currency,
            dueAt: nextPeriodStart,
            periodStart: nextPeriodStart,
            periodEnd: nextPeriodEnd,
            cycleKey: nextCycleKey,
            snapshotVersion: renewal.snapshotVersion,
            productNameSnapshot: renewal.productNameSnapshot,
            skuSnapshot: renewal.skuSnapshot,
            catalogSnapshot: renewal.catalogSnapshot as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        await transaction.activity.create({
          data: {
            organizationId: context.user.organizationId,
            userId: context.user.userId,
            contactId: subscription.contactId,
            saleId: sale.id,
            type: ActivityType.SYSTEM,
            title: 'Siguiente renovación creada',
            metadata: jsonObject({
              renewalId: nextRenewal.id,
              previousRenewalId: id,
              cycleKey: nextCycleKey,
            }),
            requestId,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'RENEWAL_CREATED',
          tableName: 'Renewal',
          recordId: nextRenewal.id,
          newValue: jsonObject({
            subscriptionId: subscription.id,
            sourceSaleId: sale.id,
            cycleKey: nextCycleKey,
            periodStart: nextPeriodStart.toISOString(),
            periodEnd: nextPeriodEnd.toISOString(),
          }),
          ip: context.metadata.ipAddress,
          requestId,
        });
        await this.enqueueEvent(transaction, 'RenewalCreated', nextRenewal.id, context, requestId, {
          status: RenewalStatus.PENDING,
          cycleKey: nextCycleKey,
        });
      }

      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: subscription.contactId,
          saleId: sale.id,
          type: ActivityType.SYSTEM,
          title: 'Renovación pagada',
          metadata: jsonObject({ renewalId: id, status: RenewalStatus.PAID }),
          requestId,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'SALE_CREATED',
        tableName: 'Sale',
        recordId: sale.id,
        newValue: jsonObject({
          status: SaleStatus.CONFIRMED,
          total: renewal.amount.toFixed(2),
          source: 'RENEWAL',
        }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'PAYMENT_CREATED',
        tableName: 'Payment',
        recordId: payment.id,
        newValue: jsonObject({
          status: PaymentStatus.CONFIRMED,
          amount: renewal.amount.toFixed(2),
          source: 'RENEWAL',
        }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'RENEWAL_PAID',
        tableName: 'Renewal',
        recordId: id,
        newValue: jsonObject({ generatedSaleId: sale.id, paymentId: payment.id }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.enqueueEvent(transaction, 'RenewalPaid', id, context, requestId, {
        status: RenewalStatus.PAID,
        workflowStatus: 'RENEWED',
        generatedSaleId: sale.id,
      });
      await this.enqueueEvent(transaction, 'SaleCreated', sale.id, context, requestId, {
        source: 'RENEWAL',
        status: SaleStatus.CONFIRMED,
      });
      await this.enqueueEvent(transaction, 'SaleConfirmed', sale.id, context, requestId, {
        source: 'RENEWAL',
      });
      await this.enqueueEvent(transaction, 'PaymentCreated', payment.id, context, requestId, {
        source: 'RENEWAL',
        status: PaymentStatus.CONFIRMED,
      });
      await this.enqueueEvent(transaction, 'PaymentConfirmed', payment.id, context, requestId, {
        source: 'RENEWAL',
      });
    });
    return this.findOne(id, context.user);
  }

  async cancel(
    id: string,
    dto: CancelRenewalDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    const requestId = context.metadata.requestId ?? randomUUID();
    await this.prisma.$transaction(async (transaction) => {
      const renewal = await this.lockRenewal(transaction, id, context.user.organizationId);
      this.access.assertMutate(context.user, renewal.userId);
      if (renewal.status === RenewalStatus.CANCELLED) return;
      if (renewal.status === RenewalStatus.PAID)
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'No se puede cancelar una renovación pagada.',
        );
      await transaction.renewal.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status: RenewalStatus.CANCELLED,
          notes: dto.reason?.trim() || null,
          version: { increment: 1 },
        },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          type: ActivityType.SYSTEM,
          title: 'Renovación cancelada',
          metadata: jsonObject({ renewalId: id, status: RenewalStatus.CANCELLED }),
          requestId,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'RENEWAL_CANCELLED',
        tableName: 'Renewal',
        recordId: id,
        newValue: jsonObject({ status: RenewalStatus.CANCELLED }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.enqueueEvent(transaction, 'RenewalCancelled', id, context, requestId, {
        status: RenewalStatus.CANCELLED,
      });
    });
    return this.findOne(id, context.user);
  }

  private async transitionDue(
    id: string,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    const requestId = context.metadata.requestId ?? randomUUID();
    await this.prisma.$transaction(async (transaction) => {
      const renewal = await this.lockRenewal(transaction, id, context.user.organizationId);
      this.access.assertMutate(context.user, renewal.userId);
      if (renewal.status === RenewalStatus.DUE) return;
      if (renewal.status !== RenewalStatus.PENDING && renewal.status !== RenewalStatus.OVERDUE)
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'La renovación no está pendiente.',
        );
      if (renewal.dueAt > new Date())
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.RENEWAL_TOO_EARLY,
          'La renovación todavía no está vencida.',
        );
      await transaction.renewal.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { status: RenewalStatus.DUE, version: { increment: 1 } },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          type: ActivityType.SYSTEM,
          title: 'Renovación vencida',
          metadata: jsonObject({ renewalId: id, status: RenewalStatus.DUE }),
          requestId,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'RENEWAL_DUE',
        tableName: 'Renewal',
        recordId: id,
        newValue: jsonObject({ status: RenewalStatus.DUE }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.enqueueEvent(transaction, 'RenewalDue', id, context, requestId, {
        status: RenewalStatus.DUE,
      });
    });
    return this.findOne(id, context.user);
  }

  private async lockRenewal(
    transaction: Prisma.TransactionClient,
    id: string,
    organizationId: string,
  ) {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Renewal" WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`,
    );
    if (locked.length === 0)
      this.notFound(COMMERCIAL_ERROR_CODES.RENEWAL_NOT_FOUND, 'La renovación no existe.');
    const renewal = await transaction.renewal.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!renewal)
      this.notFound(COMMERCIAL_ERROR_CODES.RENEWAL_NOT_FOUND, 'La renovación no existe.');
    return renewal;
  }

  private async lockSubscription(
    transaction: Prisma.TransactionClient,
    id: string,
    organizationId: string,
  ) {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Subscription" WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`,
    );
    if (locked.length === 0)
      this.notFound(COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_FOUND, 'La suscripción no existe.');
    const subscription = await transaction.subscription.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!subscription)
      this.notFound(COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_FOUND, 'La suscripción no existe.');
    return subscription;
  }

  private addCycle(
    start: Date,
    cycle: BillingCycle,
    customDays: number | null | undefined,
  ): Date | null {
    const next = new Date(start);
    if (cycle === BillingCycle.TRIAL) next.setUTCDate(next.getUTCDate() + 14);
    else if (cycle === BillingCycle.WEEKLY) next.setUTCDate(next.getUTCDate() + 7);
    else if (cycle === BillingCycle.MONTHLY) next.setUTCMonth(next.getUTCMonth() + 1);
    else if (cycle === BillingCycle.QUARTERLY) next.setUTCMonth(next.getUTCMonth() + 3);
    else if (cycle === BillingCycle.SEMI_ANNUAL) next.setUTCMonth(next.getUTCMonth() + 6);
    else if (cycle === BillingCycle.ANNUAL) next.setUTCFullYear(next.getUTCFullYear() + 1);
    else if (customDays && customDays > 0) next.setUTCDate(next.getUTCDate() + customDays);
    else return null;
    return next;
  }

  private cycleKey(subscriptionId: string, periodStart: Date): string {
    return `${subscriptionId}:${periodStart.toISOString()}`;
  }

  private async enqueueEvent(
    transaction: Prisma.TransactionClient,
    eventType: CommercialEventName,
    aggregateId: string,
    context: CommercialRequestContext,
    requestId: string,
    payload: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await this.outbox.enqueueWithClient(transaction, {
      eventType,
      organizationId: context.user.organizationId,
      aggregateType: 'Renewal',
      aggregateId,
      actorId: context.user.userId,
      requestId,
      payload: jsonObject(payload),
    });
  }

  private map(
    renewal: Prisma.RenewalGetPayload<object>,
    user: AuthenticatedUser,
  ): Record<string, unknown> {
    return {
      id: renewal.id,
      subscriptionId: renewal.subscriptionId,
      sourceSaleId: renewal.sourceSaleId,
      generatedSaleId: renewal.generatedSaleId,
      status: renewal.status,
      workflowStatus: renewal.workflowStatus,
      billingCycle: renewal.billingCycle,
      customIntervalDays: renewal.customIntervalDays,
      amount: renewal.amount.toFixed(2),
      currency: renewal.currency,
      dueAt: renewal.dueAt,
      periodStart: renewal.periodStart,
      periodEnd: renewal.periodEnd,
      cycleKey: renewal.cycleKey,
      paidAt: renewal.paidAt,
      snapshotVersion: renewal.snapshotVersion,
      productName: renewal.productNameSnapshot,
      sku: renewal.skuSnapshot,
      catalogSnapshot: sanitizeSnapshot(
        renewal.catalogSnapshot,
        user.permissions.includes('catalog.costs.read'),
      ),
      notes: renewal.notes,
      createdAt: renewal.createdAt,
      updatedAt: renewal.updatedAt,
    };
  }

  private notFound(code: string, message: string): never {
    throw commercialException(HttpStatus.NOT_FOUND, code, message);
  }
}
