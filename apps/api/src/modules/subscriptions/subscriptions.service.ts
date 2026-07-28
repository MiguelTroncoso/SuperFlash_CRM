import { HttpStatus, Injectable } from '@nestjs/common';
import { ActivityType, BillingCycle, Prisma, SubscriptionStatus } from '@prisma/client';
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
import {
  CancelSubscriptionDto,
  CreateSubscriptionDto,
  ListSubscriptionsQueryDto,
} from './dto/subscriptions.dto';
import { SubscriptionsAccessPolicy } from './subscriptions.policy';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: ApplicationEventBus,
    private readonly access: SubscriptionsAccessPolicy,
  ) {}

  async createFromSaleItem(
    saleItemId: string,
    dto: CreateSubscriptionDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    const result = await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "SaleItem" WHERE "id" = ${saleItemId}::uuid AND "organizationId" = ${context.user.organizationId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0)
        this.notFound(COMMERCIAL_ERROR_CODES.SALE_ITEM_NOT_FOUND, 'El ítem de venta no existe.');
      const existing = await transaction.subscription.findFirst({
        where: { organizationId: context.user.organizationId, saleItemId },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
      const item = await transaction.saleItem.findFirst({
        where: { organizationId: context.user.organizationId, id: saleItemId, deletedAt: null },
        select: {
          id: true,
          saleId: true,
          productId: true,
          planId: true,
          variantId: true,
          productNameSnapshot: true,
          skuSnapshot: true,
          planNameSnapshot: true,
          variantNameSnapshot: true,
          catalogSnapshot: true,
          total: true,
          quantity: true,
          currency: true,
          billingPeriodUnitSnapshot: true,
          billingPeriodCountSnapshot: true,
          sale: { select: { contactId: true, userId: true, status: true } },
        },
      });
      if (!item)
        this.notFound(COMMERCIAL_ERROR_CODES.SALE_ITEM_NOT_FOUND, 'El ítem de venta no existe.');
      if (item.sale.status === 'CANCELLED')
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'No se puede crear una suscripción desde una venta cancelada.',
        );
      const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
      const nextBillingAt = this.nextBillingAt(startsAt, dto.billingCycle, dto.customIntervalDays);
      const subscription = await transaction.subscription.create({
        data: {
          organizationId: context.user.organizationId,
          saleId: item.saleId,
          saleItemId: item.id,
          contactId: item.sale.contactId,
          userId: item.sale.userId ?? context.user.userId,
          productId: item.productId,
          planId: item.planId,
          variantId: item.variantId,
          status: SubscriptionStatus.PENDING,
          billingCycle: dto.billingCycle,
          customIntervalDays: dto.customIntervalDays ?? null,
          currency: item.currency,
          amount: item.total,
          quantity: item.quantity,
          productNameSnapshot: item.productNameSnapshot,
          skuSnapshot: item.skuSnapshot,
          planNameSnapshot: item.planNameSnapshot,
          variantNameSnapshot: item.variantNameSnapshot,
          catalogSnapshot: item.catalogSnapshot as Prisma.InputJsonValue,
          startsAt,
          currentPeriodStart: startsAt,
          currentPeriodEnd: nextBillingAt,
          nextBillingAt,
        },
        select: { id: true },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: item.sale.contactId,
          saleId: item.saleId,
          type: ActivityType.SALE,
          title: 'Suscripción creada',
          metadata: jsonObject({
            status: SubscriptionStatus.PENDING,
            billingCycle: dto.billingCycle,
          }),
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'SUBSCRIPTION_CREATED',
        tableName: 'Subscription',
        recordId: subscription.id,
        newValue: jsonObject({ saleItemId, billingCycle: dto.billingCycle }),
        ip: context.metadata.ipAddress,
      });
      return { id: subscription.id, created: true };
    });
    if (result.created)
      this.publish('SubscriptionCreated', result.id, context.user, {
        status: SubscriptionStatus.PENDING,
      });
    return this.findOne(result.id, context.user);
  }

  async list(
    query: ListSubscriptionsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const where: Prisma.SubscriptionWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };
    const orderBy: Prisma.SubscriptionOrderByWithRelationInput = {
      [query.sortBy]: query.sortOrder,
    };
    const [records, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        orderBy: [orderBy, { id: query.sortOrder }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.subscription.count({ where }),
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
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!subscription)
      this.notFound(COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_FOUND, 'La suscripción no existe.');
    return this.map(subscription);
  }

  async activate(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    return this.transition(
      id,
      SubscriptionStatus.ACTIVE,
      'SubscriptionActivated',
      'SUBSCRIPTION_ACTIVATED',
      context,
    );
  }
  async suspend(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    return this.transition(
      id,
      SubscriptionStatus.SUSPENDED,
      'SubscriptionSuspended',
      'SUBSCRIPTION_SUSPENDED',
      context,
    );
  }
  async expire(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    return this.transition(
      id,
      SubscriptionStatus.EXPIRED,
      'SubscriptionExpired',
      'SUBSCRIPTION_EXPIRED',
      context,
    );
  }
  async cancel(
    id: string,
    dto: CancelSubscriptionDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    return this.transition(
      id,
      SubscriptionStatus.CANCELLED,
      'SubscriptionCancelled',
      'SUBSCRIPTION_CANCELLED',
      context,
      dto.reason,
    );
  }

  private async transition(
    id: string,
    target: SubscriptionStatus,
    eventName: CommercialEventName,
    action: string,
    context: CommercialRequestContext,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    let changed = false;
    await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Subscription" WHERE "id" = ${id}::uuid AND "organizationId" = ${context.user.organizationId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0)
        this.notFound(COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_FOUND, 'La suscripción no existe.');
      const subscription = await transaction.subscription.findFirst({
        where: { id, organizationId: context.user.organizationId, deletedAt: null },
      });
      if (!subscription)
        this.notFound(COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_FOUND, 'La suscripción no existe.');
      this.access.assertMutate(context.user, subscription.userId);
      if (subscription.status === target) return;
      if (!this.validTransition(subscription.status, target))
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'La suscripción no puede cambiar a ese estado.',
        );
      const now = new Date();
      await transaction.subscription.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status: target,
          version: { increment: 1 },
          ...(target === SubscriptionStatus.ACTIVE
            ? {
                activatedAt: now,
                currentPeriodStart: subscription.currentPeriodStart ?? now,
                currentPeriodEnd:
                  subscription.currentPeriodEnd ??
                  this.nextBillingAt(
                    now,
                    subscription.billingCycle,
                    subscription.customIntervalDays,
                  ),
                nextBillingAt:
                  subscription.nextBillingAt ??
                  this.nextBillingAt(
                    now,
                    subscription.billingCycle,
                    subscription.customIntervalDays,
                  ),
              }
            : {}),
          ...(target === SubscriptionStatus.SUSPENDED ? { suspendedAt: now } : {}),
          ...(target === SubscriptionStatus.EXPIRED ? { expiredAt: now } : {}),
          ...(target === SubscriptionStatus.CANCELLED
            ? { cancelledAt: now, cancellationReason: reason?.trim() || null }
            : {}),
        },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: subscription.contactId,
          saleId: subscription.saleId,
          type: ActivityType.STATUS_CHANGE,
          title: `Suscripción ${target.toLowerCase()}`,
          metadata: jsonObject({ status: target }),
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action,
        tableName: 'Subscription',
        recordId: id,
        previousValue: jsonObject({ status: subscription.status }),
        newValue: jsonObject({ status: target }),
        ip: context.metadata.ipAddress,
      });
      changed = true;
    });
    if (changed) this.publish(eventName, id, context.user, { status: target });
    return this.findOne(id, context.user);
  }

  private validTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
    if (to === SubscriptionStatus.ACTIVE)
      return from === SubscriptionStatus.PENDING || from === SubscriptionStatus.SUSPENDED;
    if (to === SubscriptionStatus.SUSPENDED) return from === SubscriptionStatus.ACTIVE;
    if (to === SubscriptionStatus.EXPIRED)
      return from === SubscriptionStatus.ACTIVE || from === SubscriptionStatus.SUSPENDED;
    if (to === SubscriptionStatus.CANCELLED)
      return from !== SubscriptionStatus.CANCELLED && from !== SubscriptionStatus.EXPIRED;
    return false;
  }

  private nextBillingAt(
    start: Date,
    cycle: BillingCycle,
    customIntervalDays: number | null | undefined,
  ): Date | null {
    const next = new Date(start);
    if (cycle === BillingCycle.TRIAL) next.setUTCDate(next.getUTCDate() + 14);
    else if (cycle === BillingCycle.WEEKLY) next.setUTCDate(next.getUTCDate() + 7);
    else if (cycle === BillingCycle.MONTHLY) next.setUTCMonth(next.getUTCMonth() + 1);
    else if (cycle === BillingCycle.QUARTERLY) next.setUTCMonth(next.getUTCMonth() + 3);
    else if (cycle === BillingCycle.SEMI_ANNUAL) next.setUTCMonth(next.getUTCMonth() + 6);
    else if (cycle === BillingCycle.ANNUAL) next.setUTCFullYear(next.getUTCFullYear() + 1);
    else if (customIntervalDays) next.setUTCDate(next.getUTCDate() + customIntervalDays);
    else return null;
    return next;
  }

  private map(subscription: Prisma.SubscriptionGetPayload<object>): Record<string, unknown> {
    return {
      id: subscription.id,
      saleId: subscription.saleId,
      saleItemId: subscription.saleItemId,
      contactId: subscription.contactId,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      customIntervalDays: subscription.customIntervalDays,
      currency: subscription.currency,
      amount: subscription.amount.toFixed(2),
      quantity: subscription.quantity.toFixed(3),
      productName: subscription.productNameSnapshot,
      sku: subscription.skuSnapshot,
      planName: subscription.planNameSnapshot,
      variantName: subscription.variantNameSnapshot,
      catalogSnapshot: subscription.catalogSnapshot,
      startsAt: subscription.startsAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      nextBillingAt: subscription.nextBillingAt,
      activatedAt: subscription.activatedAt,
      suspendedAt: subscription.suspendedAt,
      expiredAt: subscription.expiredAt,
      cancelledAt: subscription.cancelledAt,
      cancellationReason: subscription.cancellationReason,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
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
