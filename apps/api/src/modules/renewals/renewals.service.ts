import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RenewalStatus,
  SaleStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  ApplicationEventBus,
  CommercialEventName,
} from '../../infrastructure/events/application-event-bus';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CommercialRequestContext, jsonObject } from '../commercial/commercial.types';
import { COMMERCIAL_ERROR_CODES, commercialException } from '../commercial/commercial.errors';
import { CancelRenewalDto, CreateRenewalDto, ListRenewalsQueryDto } from './dto/renewals.dto';
import { RenewalsAccessPolicy } from './renewals.policy';

@Injectable()
export class RenewalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: ApplicationEventBus,
    private readonly access: RenewalsAccessPolicy,
  ) {}

  async createFromSubscription(
    subscriptionId: string,
    dto: CreateRenewalDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    const result = await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Subscription" WHERE "id" = ${subscriptionId}::uuid AND "organizationId" = ${context.user.organizationId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0)
        this.notFound(COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_FOUND, 'La suscripción no existe.');
      const subscription = await transaction.subscription.findFirst({
        where: { id: subscriptionId, organizationId: context.user.organizationId, deletedAt: null },
        select: {
          id: true,
          saleId: true,
          userId: true,
          status: true,
          billingCycle: true,
          amount: true,
          currency: true,
          productNameSnapshot: true,
          skuSnapshot: true,
          catalogSnapshot: true,
          nextBillingAt: true,
        },
      });
      if (!subscription)
        this.notFound(COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_FOUND, 'La suscripción no existe.');
      if (
        subscription.status === SubscriptionStatus.CANCELLED ||
        subscription.status === SubscriptionStatus.EXPIRED
      )
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'No se puede renovar una suscripción finalizada.',
        );
      const existing = await transaction.renewal.findFirst({
        where: {
          organizationId: context.user.organizationId,
          subscriptionId,
          deletedAt: null,
          status: { in: [RenewalStatus.PENDING, RenewalStatus.DUE, RenewalStatus.OVERDUE] },
        },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
      const dueAt = dto.dueAt ? new Date(dto.dueAt) : (subscription.nextBillingAt ?? new Date());
      const renewal = await transaction.renewal.create({
        data: {
          organizationId: context.user.organizationId,
          subscriptionId,
          sourceSaleId: subscription.saleId,
          userId: subscription.userId ?? context.user.userId,
          status: RenewalStatus.PENDING,
          billingCycle: subscription.billingCycle,
          amount: subscription.amount,
          currency: subscription.currency,
          dueAt,
          productNameSnapshot: subscription.productNameSnapshot,
          skuSnapshot: subscription.skuSnapshot,
          catalogSnapshot: subscription.catalogSnapshot as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'RENEWAL_CREATED',
        tableName: 'Renewal',
        recordId: renewal.id,
        newValue: jsonObject({ subscriptionId, dueAt: dueAt.toISOString() }),
        ip: context.metadata.ipAddress,
      });
      return { id: renewal.id, created: true };
    });
    if (result.created)
      this.publish('RenewalCreated', result.id, context.user, { status: RenewalStatus.PENDING });
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
      data: records.map((record) => this.map(record)),
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
    return this.map(renewal);
  }

  async markDue(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    return this.transitionDue(id, context);
  }

  async pay(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    const result = await this.prisma.$transaction(
      async (
        transaction,
      ): Promise<{ generatedSaleId: string; generatedPaymentId: string; created: boolean }> => {
        const renewal = await this.lockRenewal(transaction, id, context.user.organizationId);
        this.access.assertMutate(context.user, renewal.userId);
        if (renewal.status === RenewalStatus.PAID && renewal.generatedSaleId) {
          const existingPayment = await transaction.payment.findFirst({
            where: {
              organizationId: context.user.organizationId,
              idempotencyKey: `renewal:${renewal.id}`,
            },
            select: { id: true },
          });
          return {
            generatedSaleId: renewal.generatedSaleId,
            generatedPaymentId: existingPayment?.id ?? renewal.generatedSaleId,
            created: false,
          };
        }
        if (renewal.status === RenewalStatus.CANCELLED)
          throw commercialException(
            HttpStatus.CONFLICT,
            COMMERCIAL_ERROR_CODES.INVALID_STATE,
            'La renovación está cancelada.',
          );
        const subscription = await transaction.subscription.findFirst({
          where: {
            id: renewal.subscriptionId,
            organizationId: context.user.organizationId,
            deletedAt: null,
          },
          select: {
            contactId: true,
            userId: true,
            saleItemId: true,
            status: true,
            nextBillingAt: true,
            billingCycle: true,
            customIntervalDays: true,
          },
        });
        if (!subscription)
          this.notFound(COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_FOUND, 'La suscripción no existe.');
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
            paidAt: new Date(),
            generatedSaleId: sale.id,
            version: { increment: 1 },
          },
        });
        const nextStart = renewal.dueAt;
        const nextEnd = this.addCycle(
          nextStart,
          subscription.billingCycle,
          subscription.customIntervalDays,
        );
        await transaction.subscription.update({
          where: {
            organizationId_id: {
              organizationId: context.user.organizationId,
              id: renewal.subscriptionId,
            },
          },
          data: {
            currentPeriodStart: nextStart,
            currentPeriodEnd: nextEnd,
            nextBillingAt: nextEnd,
            version: { increment: 1 },
          },
        });
        await transaction.activity.create({
          data: {
            organizationId: context.user.organizationId,
            userId: context.user.userId,
            contactId: subscription.contactId,
            saleId: sale.id,
            type: ActivityType.SALE,
            title: 'Renovación pagada',
            metadata: jsonObject({ renewalId: id, status: RenewalStatus.PAID }),
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
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'RENEWAL_PAID',
          tableName: 'Renewal',
          recordId: id,
          newValue: jsonObject({ generatedSaleId: sale.id, paymentId: payment.id }),
          ip: context.metadata.ipAddress,
        });
        return { generatedSaleId: sale.id, generatedPaymentId: payment.id, created: true };
      },
    );
    if (result.created) {
      this.publish('RenewalPaid', id, context.user, {
        status: RenewalStatus.PAID,
        generatedSaleId: result.generatedSaleId,
      });
      this.publish('SaleCreated', result.generatedSaleId, context.user, {
        source: 'RENEWAL',
        status: SaleStatus.CONFIRMED,
      });
      this.publish('SaleConfirmed', result.generatedSaleId, context.user, { source: 'RENEWAL' });
      this.publish('PaymentCreated', result.generatedPaymentId, context.user, {
        source: 'RENEWAL',
        status: PaymentStatus.CONFIRMED,
      });
      this.publish('PaymentConfirmed', result.generatedPaymentId, context.user, {
        source: 'RENEWAL',
      });
    }
    return this.findOne(id, context.user);
  }

  async cancel(
    id: string,
    dto: CancelRenewalDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    let changed = false;
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
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'RENEWAL_CANCELLED',
        tableName: 'Renewal',
        recordId: id,
        newValue: jsonObject({ status: RenewalStatus.CANCELLED }),
        ip: context.metadata.ipAddress,
      });
      changed = true;
    });
    if (changed)
      this.publish('RenewalCancelled', id, context.user, { status: RenewalStatus.CANCELLED });
    return this.findOne(id, context.user);
  }

  private async transitionDue(
    id: string,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    let changed = false;
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
      await transaction.renewal.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { status: RenewalStatus.DUE, version: { increment: 1 } },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'RENEWAL_DUE',
        tableName: 'Renewal',
        recordId: id,
        newValue: jsonObject({ status: RenewalStatus.DUE }),
        ip: context.metadata.ipAddress,
      });
      changed = true;
    });
    if (changed) this.publish('RenewalDue', id, context.user, { status: RenewalStatus.DUE });
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

  private addCycle(start: Date, cycle: string, customDays: number | null): Date {
    const next = new Date(start);
    if (cycle === 'TRIAL') next.setUTCDate(next.getUTCDate() + 14);
    else if (cycle === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7);
    else if (cycle === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + 1);
    else if (cycle === 'QUARTERLY') next.setUTCMonth(next.getUTCMonth() + 3);
    else if (cycle === 'SEMI_ANNUAL') next.setUTCMonth(next.getUTCMonth() + 6);
    else if (cycle === 'ANNUAL') next.setUTCFullYear(next.getUTCFullYear() + 1);
    else next.setUTCDate(next.getUTCDate() + (customDays ?? 30));
    return next;
  }

  private map(renewal: Prisma.RenewalGetPayload<object>): Record<string, unknown> {
    return {
      id: renewal.id,
      subscriptionId: renewal.subscriptionId,
      sourceSaleId: renewal.sourceSaleId,
      generatedSaleId: renewal.generatedSaleId,
      status: renewal.status,
      billingCycle: renewal.billingCycle,
      amount: renewal.amount.toFixed(2),
      currency: renewal.currency,
      dueAt: renewal.dueAt,
      paidAt: renewal.paidAt,
      productName: renewal.productNameSnapshot,
      sku: renewal.skuSnapshot,
      catalogSnapshot: renewal.catalogSnapshot,
      notes: renewal.notes,
      createdAt: renewal.createdAt,
      updatedAt: renewal.updatedAt,
    };
  }
  private publish(
    name: CommercialEventName,
    aggregateId: string,
    user: AuthenticatedUser,
    payload: Record<string, unknown>,
  ): void {
    this.events.publish(name, {
      eventId: randomUUID(),
      occurredAt: new Date(),
      organizationId: user.organizationId,
      aggregateId,
      actorUserId: user.userId,
      payload,
    });
  }
  private notFound(code: string, message: string): never {
    throw commercialException(HttpStatus.NOT_FOUND, code, message);
  }
}
