import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityType,
  BillingCycle,
  BillingPeriodUnit,
  FollowUpStatus,
  PaymentMethod,
  PaymentStatus,
  PipelineStageCategory,
  Prisma,
  ProductStockMovementType,
  RenewalReminderKind,
  RenewalStatus,
  SaleStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { addSubscriptionBillingCycle, addSubscriptionDuration } from '@superflash/utils';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CommercialEventName } from '../../infrastructure/events/application-event-bus';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { SaleCatalogResolution, PricingService } from '../catalog/pricing/pricing.service';
import { isSupportedCurrency } from '../commercial/currency';
import {
  CommercialClient,
  CommercialRequestContext,
  jsonObject,
  normalizeCurrency,
  parseMoney,
  parseQuantity,
  positive,
} from '../commercial/commercial.types';
import { COMMERCIAL_ERROR_CODES, commercialException } from '../commercial/commercial.errors';
import {
  ConfirmSalePaymentDto,
  CreateSaleDto,
  CreateSaleItemDto,
  ListSalesQueryDto,
  UpdateSaleDto,
} from './dto/sales.dto';
import { SalesAccessPolicy } from './access/sales-access.policy';
import { nextSaleNumber } from '../commercial/sale-number';

const saleInclude = {
  contact: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, country: true },
  },
  seller: { select: { id: true, firstName: true, lastName: true, email: true } },
  opportunity: {
    select: {
      id: true,
      title: true,
      pipelineStage: { select: { id: true, name: true, color: true } },
    },
  },
  items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' as const } },
  subscriptions: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      saleItemId: true,
      status: true,
      billingCycle: true,
      customIntervalDays: true,
      productNameSnapshot: true,
      catalogSnapshot: true,
      startsAt: true,
      currentPeriodEnd: true,
      nextBillingAt: true,
      renewals: {
        where: { deletedAt: null },
        orderBy: { periodStart: 'asc' as const },
        take: 1,
        select: { id: true, status: true, dueAt: true },
      },
    },
  },
  payments: {
    where: { deletedAt: null },
    orderBy: { paymentDate: 'desc' as const },
    select: {
      id: true,
      grossAmount: true,
      feeAmount: true,
      netAmount: true,
      refundedAmount: true,
      currency: true,
      method: true,
      reference: true,
      status: true,
      paymentDate: true,
      confirmedAt: true,
    },
  },
  renewalItems: {
    where: { deletedAt: null },
    orderBy: { periodStart: 'desc' as const },
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
  fulfillments: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      status: true,
      mode: true,
      attemptCount: true,
      completedAt: true,
      provider: { select: { name: true } },
      activations: {
        where: { deletedAt: null },
        select: { status: true, activatedAt: true, expiresAt: true },
      },
    },
  },
  activities: {
    where: { deletedAt: null },
    orderBy: { occurredAt: 'desc' as const },
    take: 20,
    select: { id: true, type: true, title: true, occurredAt: true, metadata: true },
  },
} satisfies Prisma.SaleInclude;

type SaleWithDetails = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

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
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly pricing: PricingService,
    private readonly access: SalesAccessPolicy,
  ) {}

  async create(
    dto: CreateSaleDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    const saleId = await this.prisma.$transaction(async (transaction) => {
      const id = await this.createInternal(transaction, dto, context);
      await this.enqueueEvent(transaction, 'SaleCreated', id, context, {
        status: SaleStatus.DRAFT,
      });
      return id;
    });
    return this.findOne(saleId, context.user);
  }

  async convertOpportunity(
    opportunityId: string,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    let saleId: string;
    try {
      saleId = await this.prisma.$transaction(async (transaction) => {
        const locked = await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "Opportunity" WHERE "id" = ${opportunityId}::uuid AND "organizationId" = ${context.user.organizationId}::uuid FOR UPDATE`,
        );
        if (locked.length === 0)
          this.notFound(COMMERCIAL_ERROR_CODES.NOT_FOUND, 'La oportunidad no existe.');
        const opportunity = await transaction.opportunity.findFirst({
          where: {
            organizationId: context.user.organizationId,
            id: opportunityId,
            deletedAt: null,
          },
          select: {
            id: true,
            contactId: true,
            productId: true,
            currency: true,
            userId: true,
            title: true,
          },
        });
        if (!opportunity)
          this.notFound(COMMERCIAL_ERROR_CODES.NOT_FOUND, 'La oportunidad no existe.');
        const existing = await transaction.sale.findFirst({
          where: {
            organizationId: context.user.organizationId,
            opportunityId,
            deletedAt: null,
            status: { not: SaleStatus.CANCELLED },
          },
          select: { id: true },
        });
        if (existing) {
          throw commercialException(
            HttpStatus.CONFLICT,
            COMMERCIAL_ERROR_CODES.SALE_OPPORTUNITY_ALREADY_CONVERTED,
            'La oportunidad ya fue convertida en una venta.',
            { existingSaleId: existing.id },
          );
        }
        if (!opportunity.productId) {
          throw commercialException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            COMMERCIAL_ERROR_CODES.SALE_OPPORTUNITY_PRODUCT_REQUIRED,
            'La oportunidad debe tener un producto para convertirse en venta.',
          );
        }
        const product = await transaction.product.findFirst({
          where: {
            organizationId: context.user.organizationId,
            id: opportunity.productId,
            deletedAt: null,
          },
          select: { price: true, currency: true },
        });
        if (!product)
          this.notFound(COMMERCIAL_ERROR_CODES.CATALOG_NOT_FOUND, 'El producto no existe.');
        const dto: CreateSaleDto = {
          contactId: opportunity.contactId,
          opportunityId: opportunity.id,
          currency: normalizeCurrency(opportunity.currency ?? product.currency ?? 'USD'),
          items: [
            {
              productId: opportunity.productId,
              quantity: '1',
              unitPrice: (product.price ?? new Prisma.Decimal(0)).toFixed(2),
            },
          ],
        };
        const id = await this.createInternal(transaction, dto, context);
        await this.enqueueEvent(transaction, 'SaleCreated', id, context, {
          conversion: 'OPPORTUNITY',
        });
        return id;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.SALE_OPPORTUNITY_ALREADY_CONVERTED,
          'La oportunidad ya fue convertida en una venta.',
        );
      }
      throw error;
    }
    return this.findOne(saleId, context.user);
  }

  async list(query: ListSalesQueryDto, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const where: Prisma.SaleWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.currency ? { currency: normalizeCurrency(query.currency) } : {}),
      ...(query.search
        ? {
            OR: [
              { saleNumber: { contains: query.search, mode: 'insensitive' } },
              { note: { contains: query.search, mode: 'insensitive' } },
              { contact: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
              { contact: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
              { contact: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
              { contact: { is: { phone: { contains: query.search, mode: 'insensitive' } } } },
              {
                contact: {
                  is: { phoneNormalized: { contains: query.search, mode: 'insensitive' } },
                },
              },
              { opportunity: { is: { title: { contains: query.search, mode: 'insensitive' } } } },
              {
                items: {
                  some: {
                    deletedAt: null,
                    productNameSnapshot: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
              {
                items: {
                  some: {
                    deletedAt: null,
                    skuSnapshot: { contains: query.search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.SaleOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };
    const [records, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: [orderBy, { id: query.sortOrder }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return {
      data: records.map((record) => this.mapSale(record, user)),
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
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: saleInclude,
    });
    if (!sale) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
    const balance = await this.calculateBalance(id, user.organizationId);
    return { ...this.mapSale(sale, user), balance };
  }

  async update(
    id: string,
    dto: UpdateSaleDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Sale" WHERE "id" = ${id}::uuid AND "organizationId" = ${context.user.organizationId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0)
        this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
      const current = await transaction.sale.findFirst({
        where: { id, organizationId: context.user.organizationId, deletedAt: null },
        select: {
          id: true,
          status: true,
          userId: true,
          version: true,
          subtotal: true,
          total: true,
          discountAmount: true,
          taxAmount: true,
          note: true,
          paymentDueAt: true,
          paymentMethod: true,
          paidNow: true,
        },
      });
      if (!current) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
      this.access.assertMutate(context.user, current.userId);
      if (current.status !== SaleStatus.DRAFT && current.status !== SaleStatus.PENDING) {
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'Solo se pueden modificar ventas en borrador o pendientes.',
        );
      }
      const saleItems = await transaction.saleItem.findMany({
        where: { organizationId: context.user.organizationId, saleId: id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          discountAmount: true,
          taxAmount: true,
          total: true,
          requiresSubscriptionSnapshot: true,
          billingPeriodUnitSnapshot: true,
          billingPeriodCountSnapshot: true,
          catalogSnapshot: true,
        },
      });
      const itemId = dto.itemId ?? (saleItems.length === 1 ? saleItems[0]?.id : undefined);
      if (
        (dto.unitPrice !== undefined ||
          dto.subscriptionDurationDays !== undefined ||
          dto.priceOverrideReason !== undefined) &&
        !itemId
      ) {
        throw commercialException(
          HttpStatus.BAD_REQUEST,
          COMMERCIAL_ERROR_CODES.SALE_ITEM_NOT_FOUND,
          'Debes indicar el ítem de la venta que deseas modificar.',
        );
      }
      const targetItem = itemId ? saleItems.find((item) => item.id === itemId) : undefined;
      if (itemId && !targetItem) {
        throw commercialException(
          HttpStatus.NOT_FOUND,
          COMMERCIAL_ERROR_CODES.SALE_ITEM_NOT_FOUND,
          'El ítem de la venta no existe.',
        );
      }
      if (dto.subscriptionDurationDays !== undefined && !targetItem?.requiresSubscriptionSnapshot) {
        throw commercialException(
          HttpStatus.BAD_REQUEST,
          COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_ELIGIBLE,
          'La duración solo aplica a productos con suscripción.',
        );
      }
      const requestedUnitPrice = dto.unitPrice === undefined ? null : parseMoney(dto.unitPrice);
      if (requestedUnitPrice?.isNegative()) {
        throw commercialException(
          HttpStatus.BAD_REQUEST,
          COMMERCIAL_ERROR_CODES.INVALID_MONEY,
          'El precio no puede ser negativo.',
        );
      }
      if (
        requestedUnitPrice &&
        targetItem &&
        !requestedUnitPrice.eq(targetItem.unitPrice) &&
        !dto.priceOverrideReason?.trim()
      ) {
        throw commercialException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          COMMERCIAL_ERROR_CODES.PRICE_OVERRIDE_FORBIDDEN,
          'El cambio de precio requiere un motivo.',
        );
      }
      const discount =
        dto.discountAmount === undefined ? current.discountAmount : parseMoney(dto.discountAmount);
      const tax = dto.taxAmount === undefined ? current.taxAmount : parseMoney(dto.taxAmount);
      if (discount.isNegative() || tax.isNegative()) {
        throw commercialException(
          HttpStatus.BAD_REQUEST,
          COMMERCIAL_ERROR_CODES.INVALID_MONEY,
          'Los descuentos e impuestos no pueden ser negativos.',
        );
      }
      const itemTotals = saleItems.map((item) => {
        const unitPrice =
          item.id === targetItem?.id && requestedUnitPrice ? requestedUnitPrice : item.unitPrice;
        return {
          item,
          unitPrice,
          total: item.quantity.mul(unitPrice).sub(item.discountAmount).add(item.taxAmount),
        };
      });
      const subtotal = itemTotals.reduce(
        (sum, item) => sum.add(item.item.quantity.mul(item.unitPrice)),
        new Prisma.Decimal(0),
      );
      const total = subtotal.sub(discount).add(tax);
      if (total.isNegative()) {
        throw commercialException(
          HttpStatus.BAD_REQUEST,
          COMMERCIAL_ERROR_CODES.INVALID_MONEY,
          'El total de la venta no puede ser negativo.',
        );
      }
      if (
        targetItem &&
        (requestedUnitPrice ||
          dto.subscriptionDurationDays !== undefined ||
          dto.priceOverrideReason !== undefined)
      ) {
        const snapshot = this.snapshotRecord(targetItem.catalogSnapshot) ?? {};
        const nextSnapshot = { ...snapshot } as Record<string, Prisma.JsonValue>;
        const billing = this.durationSnapshot(dto.subscriptionDurationDays ?? 30);
        if (requestedUnitPrice) {
          nextSnapshot.pricingSource = 'MANUAL_OVERRIDE';
          if (dto.priceOverrideReason !== undefined)
            nextSnapshot.pricingOverrideReason = dto.priceOverrideReason.trim() || null;
          nextSnapshot.salePrice = requestedUnitPrice.toFixed(2);
        }
        if (dto.subscriptionDurationDays !== undefined) {
          nextSnapshot.subscriptionDurationDays = dto.subscriptionDurationDays;
          nextSnapshot.billingPeriodUnit = billing.unit;
          nextSnapshot.billingPeriodCount = billing.count;
        }
        const updatedItem = itemTotals.find((item) => item.item.id === targetItem.id);
        await transaction.saleItem.update({
          where: {
            organizationId_id: { organizationId: context.user.organizationId, id: targetItem.id },
          },
          data: {
            ...(requestedUnitPrice ? { unitPrice: requestedUnitPrice } : {}),
            ...(dto.subscriptionDurationDays !== undefined
              ? {
                  billingPeriodUnitSnapshot: billing.unit,
                  billingPeriodCountSnapshot: billing.count,
                }
              : {}),
            ...(updatedItem ? { total: updatedItem.total } : {}),
            catalogSnapshot: nextSnapshot as Prisma.InputJsonValue,
          },
        });
      }
      const paidNow = dto.paidNow ?? current.paidNow;
      await transaction.sale.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          subtotal,
          discountAmount: discount,
          taxAmount: tax,
          total,
          note: dto.note === undefined ? current.note : dto.note?.trim() || null,
          paymentMethod:
            dto.paymentMethod === undefined ? current.paymentMethod : dto.paymentMethod,
          paidNow,
          paymentDueAt: paidNow
            ? null
            : dto.paymentDueAt === undefined
              ? current.paymentDueAt
              : dto.paymentDueAt
                ? new Date(dto.paymentDueAt)
                : null,
          version: { increment: 1 },
        },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          saleId: id,
          type: ActivityType.SYSTEM,
          title: 'Venta actualizada',
          metadata: jsonObject({ status: current.status }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'SALE_UPDATED',
        tableName: 'Sale',
        recordId: id,
        previousValue: jsonObject({
          subtotal: current.subtotal.toFixed(2),
          total: current.total.toFixed(2),
          discountAmount: current.discountAmount.toFixed(2),
          taxAmount: current.taxAmount.toFixed(2),
          note: current.note,
          paymentMethod: current.paymentMethod,
          paidNow: current.paidNow,
        }),
        newValue: jsonObject({
          subtotal: subtotal.toFixed(2),
          total: total.toFixed(2),
          discountAmount: discount.toFixed(2),
          taxAmount: tax.toFixed(2),
          note: dto.note ?? current.note,
          paymentMethod: dto.paymentMethod ?? current.paymentMethod,
          paidNow,
        }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
    });
    return this.findOne(id, context.user);
  }

  async remove(id: string, context: CommercialRequestContext): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Sale" WHERE "id" = ${id}::uuid AND "organizationId" = ${context.user.organizationId}::uuid FOR UPDATE`,
      );
      const sale = await transaction.sale.findFirst({
        where: { id, organizationId: context.user.organizationId, deletedAt: null },
        select: { id: true, status: true, userId: true, contactId: true, opportunityId: true },
      });
      if (!sale) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
      this.access.assertDelete(context.user, sale.userId);
      const totals = await transaction.payment.aggregate({
        where: {
          organizationId: context.user.organizationId,
          saleId: id,
          deletedAt: null,
          status: { in: [PaymentStatus.CONFIRMED, PaymentStatus.REFUNDED] },
        },
        _sum: { netAmount: true, refundedAmount: true },
      });
      const netPaid = (totals._sum.netAmount ?? new Prisma.Decimal(0)).sub(
        totals._sum.refundedAmount ?? new Prisma.Decimal(0),
      );
      if (netPaid.gt(0)) {
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.SALE_CANCELLED_WITH_BALANCE,
          'La venta no se puede eliminar mientras tenga pagos netos.',
        );
      }
      const now = new Date();
      if (sale.status === SaleStatus.CONFIRMED || sale.status === SaleStatus.FULFILLED) {
        const items = await transaction.saleItem.findMany({
          where: { organizationId: context.user.organizationId, saleId: id, deletedAt: null },
          select: { productId: true, quantity: true },
        });
        const quantities = new Map<string, Prisma.Decimal>();
        for (const item of items) {
          if (item.productId) {
            quantities.set(
              item.productId,
              (quantities.get(item.productId) ?? new Prisma.Decimal(0)).add(item.quantity),
            );
          }
        }
        for (const [productId, quantity] of [...quantities.entries()].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          const locked = await transaction.$queryRaw<
            Array<{ stockQuantity: number; stockTrackingEnabled: boolean }>
          >(
            Prisma.sql`SELECT "stockQuantity", "stockTrackingEnabled" FROM "Product" WHERE "organizationId" = ${context.user.organizationId}::uuid AND "id" = ${productId}::uuid AND "deletedAt" IS NULL FOR UPDATE`,
          );
          const product = locked[0];
          if (!product?.stockTrackingEnabled) continue;
          const quantityBefore = product.stockQuantity;
          const quantityAfter = quantityBefore + quantity.toNumber();
          await transaction.product.update({
            where: {
              organizationId_id: { organizationId: context.user.organizationId, id: productId },
            },
            data: { stockQuantity: quantityAfter },
          });
          await transaction.productStockMovement.create({
            data: {
              organizationId: context.user.organizationId,
              productId,
              userId: context.user.userId,
              quantityBefore,
              quantityDelta: quantity.toNumber(),
              quantityAfter,
              movementType: ProductStockMovementType.RETURN,
              reason: `Venta eliminada ${id}`,
            },
          });
        }
      }
      await transaction.payment.updateMany({
        where: {
          organizationId: context.user.organizationId,
          saleId: id,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
          deletedAt: null,
        },
        data: { deletedAt: now },
      });
      await transaction.renewal.updateMany({
        where: { organizationId: context.user.organizationId, sourceSaleId: id, deletedAt: null },
        data: { deletedAt: now, status: RenewalStatus.CANCELLED, workflowStatus: 'CANCELLED' },
      });
      await transaction.subscription.updateMany({
        where: { organizationId: context.user.organizationId, saleId: id, deletedAt: null },
        data: { deletedAt: now, status: SubscriptionStatus.CANCELLED, cancelledAt: now },
      });
      await transaction.sale.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          deletedAt: now,
          status: SaleStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: 'Venta eliminada por operación comercial',
          version: { increment: 1 },
        },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: sale.contactId,
          opportunityId: sale.opportunityId,
          saleId: id,
          type: ActivityType.SYSTEM,
          title: 'Venta eliminada',
          metadata: jsonObject({ reason: 'soft_delete', stockReconciled: true }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'SALE_DELETED',
        tableName: 'Sale',
        recordId: id,
        previousValue: jsonObject({ status: sale.status }),
        newValue: jsonObject({ status: SaleStatus.CANCELLED, deletedAt: now.toISOString() }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
    });
  }

  async confirm(
    id: string,
    context: CommercialRequestContext,
    payment?: ConfirmSalePaymentDto,
  ): Promise<Record<string, unknown>> {
    return this.transition(
      id,
      SaleStatus.CONFIRMED,
      'SaleConfirmed',
      'SALE_CONFIRMED',
      context,
      undefined,
      payment,
    );
  }

  async fulfill(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    return this.transition(id, SaleStatus.FULFILLED, 'SaleFulfilled', 'SALE_FULFILLED', context);
  }

  async cancel(
    id: string,
    reason: string | undefined,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    return this.transition(
      id,
      SaleStatus.CANCELLED,
      'SaleCancelled',
      'SALE_CANCELLED',
      context,
      reason,
    );
  }

  async calculateBalance(saleId: string, organizationId: string): Promise<Record<string, string>> {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, organizationId, deletedAt: null },
      select: { total: true, currency: true },
    });
    if (!sale) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
    const aggregate = await this.prisma.payment.aggregate({
      where: { organizationId, saleId, status: { in: ['CONFIRMED', 'REFUNDED'] }, deletedAt: null },
      _sum: { netAmount: true, refundedAmount: true },
    });
    const confirmed = aggregate._sum.netAmount ?? new Prisma.Decimal(0);
    const refunded = aggregate._sum.refundedAmount ?? new Prisma.Decimal(0);
    return {
      currency: sale.currency,
      total: sale.total.toFixed(2),
      confirmed: confirmed.toFixed(2),
      refunded: refunded.toFixed(2),
      balance: sale.total.sub(confirmed).add(refunded).toFixed(2),
    };
  }

  private async createInternal(
    transaction: CommercialClient,
    dto: CreateSaleDto,
    context: CommercialRequestContext,
  ): Promise<string> {
    const user = context.user;
    const currency = normalizeCurrency(dto.currency);
    const contact = await transaction.contact.findFirst({
      where: { id: dto.contactId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) this.notFound(COMMERCIAL_ERROR_CODES.NOT_FOUND, 'El contacto no existe.');
    const opportunityId = dto.opportunityId ?? null;
    if (opportunityId) {
      const opportunity = await transaction.opportunity.findFirst({
        where: {
          id: opportunityId,
          organizationId: user.organizationId,
          contactId: dto.contactId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!opportunity)
        this.notFound(COMMERCIAL_ERROR_CODES.NOT_FOUND, 'La oportunidad no pertenece al contacto.');
    }
    const itemData: Array<Omit<Prisma.SaleItemCreateManyInput, 'saleId'>> = [];
    let subtotal = new Prisma.Decimal(0);
    let itemTotals = new Prisma.Decimal(0);
    for (const item of dto.items) {
      const built = await this.buildItem(transaction, item, currency, context);
      itemData.push({
        id: randomUUID(),
        organizationId: user.organizationId,
        productId: built.product.id,
        planId: built.plan?.id ?? null,
        variantId: built.variant?.id ?? null,
        priceBookEntryId: built.priceBookEntry?.id ?? null,
        productNameSnapshot: built.product.name,
        productSlugSnapshot: built.product.slug,
        productTypeSnapshot: built.product.type,
        fulfillmentModeSnapshot: built.product.fulfillmentMode,
        requiresSubscriptionSnapshot: built.requiresSubscription,
        skuSnapshot: built.product.sku,
        planNameSnapshot: built.plan?.name ?? null,
        variantNameSnapshot: built.variant?.name ?? null,
        billingPeriodUnitSnapshot: built.billingPeriodUnit,
        billingPeriodCountSnapshot: built.billingPeriodCount,
        catalogSnapshot: built.snapshot,
        quantity: built.quantity,
        unitPrice: built.unitPrice,
        discountAmount: built.discount,
        taxAmount: built.tax,
        total: built.lineTotal,
        currency,
      });
      subtotal = subtotal.add(built.quantity.mul(built.unitPrice));
      itemTotals = itemTotals.add(built.lineTotal);
    }
    const saleDiscount = parseMoney(dto.discountAmount);
    const saleTax = parseMoney(dto.taxAmount);
    const total = itemTotals.sub(saleDiscount).add(saleTax);
    if (total.isNegative()) {
      throw commercialException(
        HttpStatus.BAD_REQUEST,
        COMMERCIAL_ERROR_CODES.INVALID_MONEY,
        'El total de la venta no puede ser negativo.',
      );
    }
    const saleNumber = await nextSaleNumber(transaction, user.organizationId);
    const sale = await transaction.sale.create({
      data: {
        organizationId: user.organizationId,
        saleNumber,
        contactId: dto.contactId,
        opportunityId,
        userId: user.userId,
        status: SaleStatus.DRAFT,
        subtotal,
        discountAmount: saleDiscount,
        taxAmount: saleTax,
        total,
        currency,
        note: dto.note?.trim() || null,
        paymentDueAt: dto.paymentDueAt ? new Date(dto.paymentDueAt) : null,
      },
      select: { id: true },
    });
    await transaction.saleItem.createMany({
      data: itemData.map((item) => ({ ...item, saleId: sale.id })),
    });
    await transaction.activity.create({
      data: {
        organizationId: user.organizationId,
        userId: user.userId,
        contactId: dto.contactId,
        opportunityId,
        saleId: sale.id,
        type: ActivityType.SALE,
        title: 'Venta creada',
        metadata: jsonObject({ status: SaleStatus.DRAFT }),
        requestId: context.metadata.requestId ?? null,
      },
    });
    await this.audit.recordWithClient(transaction, {
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'SALE_CREATED',
      tableName: 'Sale',
      recordId: sale.id,
      newValue: jsonObject({ status: SaleStatus.DRAFT, total: total.toFixed(2), currency }),
      ip: context.metadata.ipAddress,
      requestId: context.metadata.requestId,
    });
    return sale.id;
  }

  private async buildItem(
    transaction: CommercialClient,
    dto: CreateSaleItemDto,
    currency: string,
    context: CommercialRequestContext,
  ): Promise<{
    product: SaleCatalogResolution['product'];
    plan: SaleCatalogResolution['plan'];
    variant: SaleCatalogResolution['variant'];
    priceBookEntry: SaleCatalogResolution['priceBookEntry'];
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    discount: Prisma.Decimal;
    tax: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    snapshot: Prisma.InputJsonObject;
    requiresSubscription: boolean;
    billingPeriodUnit: BillingPeriodUnit | null;
    billingPeriodCount: number | null;
  }> {
    const quantity = parseQuantity(dto.quantity);
    positive(quantity, 'quantity');
    const requestedUnitPrice = dto.unitPrice === undefined ? null : parseMoney(dto.unitPrice);
    const resolution = await this.pricing.resolveForSale({
      client: transaction,
      organizationId: context.user.organizationId,
      productId: dto.productId,
      planId: dto.planId ?? null,
      variantId: dto.variantId ?? null,
      priceBookEntryId: dto.priceBookEntryId ?? null,
      currency,
      requestedUnitPrice,
      canOverridePrice: context.user.permissions.includes('catalog.prices.override'),
      overrideReason: dto.priceOverrideReason?.trim() || null,
    });
    const unitPrice = resolution.unitPrice;
    const discount = parseMoney(dto.discountAmount);
    const tax = parseMoney(dto.taxAmount);
    if (unitPrice.isNegative() || discount.isNegative() || tax.isNegative()) {
      throw commercialException(
        HttpStatus.BAD_REQUEST,
        COMMERCIAL_ERROR_CODES.INVALID_MONEY,
        'Los importes no pueden ser negativos.',
      );
    }
    const lineTotal = quantity.mul(unitPrice).sub(discount).add(tax);
    if (lineTotal.isNegative())
      throw commercialException(
        HttpStatus.BAD_REQUEST,
        COMMERCIAL_ERROR_CODES.INVALID_MONEY,
        'El total del ítem no puede ser negativo.',
      );
    const requiresSubscription =
      resolution.product.requiresSubscription || resolution.product.type === 'SUBSCRIPTION';
    if (dto.subscriptionDurationDays !== undefined && !requiresSubscription) {
      throw commercialException(
        HttpStatus.BAD_REQUEST,
        COMMERCIAL_ERROR_CODES.SUBSCRIPTION_NOT_ELIGIBLE,
        'La duración de suscripción solo aplica a productos con renovación.',
      );
    }
    const duration = this.subscriptionDuration(dto.subscriptionDurationDays, resolution.plan);
    const snapshot = JSON.parse(
      JSON.stringify({
        snapshotVersion: 2,
        productId: resolution.product.id,
        productName: resolution.product.name,
        productSlug: resolution.product.slug,
        sku: resolution.product.sku,
        productType: resolution.product.type,
        planId: resolution.plan?.id ?? null,
        planName: resolution.plan?.name ?? null,
        variantId: resolution.variant?.id ?? null,
        variantName: resolution.variant?.name ?? null,
        quantity: quantity.toFixed(3),
        salePrice: (resolution.priceBookEntry?.salePrice ?? unitPrice).toFixed(2),
        minimumPrice: resolution.priceBookEntry?.minimumPrice?.toFixed(2) ?? null,
        costPrice: resolution.priceBookEntry?.costPrice?.toFixed(2) ?? null,
        currency,
        taxIncluded: resolution.priceBookEntry?.taxIncluded ?? false,
        taxAmount: tax.toFixed(2),
        billingPeriodCount: duration.billingPeriodCount,
        billingPeriodUnit: duration.billingPeriodUnit,
        subscriptionDurationDays: dto.subscriptionDurationDays ?? null,
        fulfillmentMode: resolution.product.fulfillmentMode,
        requiresSubscription,
        priceBookId: resolution.priceBook?.id ?? resolution.priceBookEntry?.priceBookId ?? null,
        priceBookEntryId: resolution.priceBookEntry?.id ?? null,
        pricingSource: resolution.pricingSource,
        pricingOverrideReason: dto.priceOverrideReason?.trim() || null,
        metadata: resolution.product.metadata,
      }),
    ) as Prisma.InputJsonObject;
    return {
      product: resolution.product,
      plan: resolution.plan,
      variant: resolution.variant,
      priceBookEntry: resolution.priceBookEntry,
      quantity,
      unitPrice,
      discount,
      tax,
      lineTotal,
      snapshot,
      requiresSubscription,
      billingPeriodUnit: duration.billingPeriodUnit,
      billingPeriodCount: duration.billingPeriodCount,
    };
  }

  private subscriptionDuration(
    durationDays: number | undefined,
    plan: SaleCatalogResolution['plan'],
  ): { billingPeriodUnit: BillingPeriodUnit | null; billingPeriodCount: number | null } {
    if (durationDays !== undefined) {
      if (durationDays === 30)
        return { billingPeriodUnit: BillingPeriodUnit.DAY, billingPeriodCount: 30 };
      if (durationDays === 90)
        return { billingPeriodUnit: BillingPeriodUnit.MONTH, billingPeriodCount: 3 };
      if (durationDays === 180)
        return { billingPeriodUnit: BillingPeriodUnit.MONTH, billingPeriodCount: 6 };
      if (durationDays === 365)
        return { billingPeriodUnit: BillingPeriodUnit.YEAR, billingPeriodCount: 1 };
    }
    if (plan) {
      return {
        billingPeriodUnit: plan.billingPeriodUnit,
        billingPeriodCount: plan.billingPeriodCount,
      };
    }
    return { billingPeriodUnit: BillingPeriodUnit.MONTH, billingPeriodCount: 1 };
  }

  private durationSnapshot(durationDays: number): {
    unit: BillingPeriodUnit;
    count: number;
  } {
    if (durationDays === 30) return { unit: BillingPeriodUnit.DAY, count: 30 };
    if (durationDays === 90) return { unit: BillingPeriodUnit.MONTH, count: 3 };
    if (durationDays === 180) return { unit: BillingPeriodUnit.MONTH, count: 6 };
    return { unit: BillingPeriodUnit.YEAR, count: 1 };
  }

  private async consumeTrackedStock(
    transaction: CommercialClient,
    saleId: string,
    context: CommercialRequestContext,
  ): Promise<void> {
    const items = await transaction.saleItem.findMany({
      where: {
        organizationId: context.user.organizationId,
        saleId,
        deletedAt: null,
        productId: { not: null },
      },
      select: { productId: true, quantity: true },
    });
    const quantities = new Map<string, Prisma.Decimal>();
    for (const item of items) {
      if (!item.productId) continue;
      if (!item.quantity.mod(1).isZero()) {
        throw commercialException(
          HttpStatus.BAD_REQUEST,
          COMMERCIAL_ERROR_CODES.STOCK_INVALID_QUANTITY,
          'La cantidad de productos con stock debe ser un número entero.',
        );
      }
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? new Prisma.Decimal(0)).add(item.quantity),
      );
    }
    for (const [productId, quantity] of [...quantities.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const locked = await transaction.$queryRaw<
        Array<{
          id: string;
          stockQuantity: number;
          stockReserved: number;
          stockTrackingEnabled: boolean;
        }>
      >(
        Prisma.sql`SELECT "id", "stockQuantity", "stockReserved", "stockTrackingEnabled"
          FROM "Product"
          WHERE "organizationId" = ${context.user.organizationId}::uuid
            AND "id" = ${productId}::uuid
            AND "deletedAt" IS NULL
          FOR UPDATE`,
      );
      if (locked.length === 0) continue;
      const product = locked[0];
      if (!product) continue;
      if (!product.stockTrackingEnabled) continue;
      const requested = quantity.toNumber();
      const available = product.stockQuantity - product.stockReserved;
      if (requested > available) {
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.STOCK_INSUFFICIENT,
          'No hay stock suficiente para confirmar la venta.',
          { productId, available: String(available), requested: String(requested) },
        );
      }
      const quantityAfter = product.stockQuantity - requested;
      await transaction.product.update({
        where: {
          organizationId_id: { organizationId: context.user.organizationId, id: productId },
        },
        data: { stockQuantity: quantityAfter },
      });
      await transaction.productStockMovement.create({
        data: {
          organizationId: context.user.organizationId,
          productId,
          userId: context.user.userId,
          quantityBefore: product.stockQuantity,
          quantityDelta: -requested,
          quantityAfter,
          movementType: ProductStockMovementType.EXIT,
          reason: `Venta ${saleId}`,
        },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          saleId,
          type: ActivityType.SYSTEM,
          title: 'Stock descontado',
          metadata: jsonObject({ productId, quantity: requested, quantityAfter }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CATALOG_STOCK_SALE_EXIT',
        tableName: 'Product',
        recordId: productId,
        previousValue: jsonObject({ stockQuantity: product.stockQuantity }),
        newValue: jsonObject({ stockQuantity: quantityAfter, quantity: requested, saleId }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
    }
  }

  private async ensureSubscriptionsForSale(
    transaction: CommercialClient,
    saleId: string,
    context: CommercialRequestContext,
    startedAt: Date,
  ): Promise<void> {
    const sale = await transaction.sale.findFirst({
      where: { id: saleId, organizationId: context.user.organizationId, deletedAt: null },
      select: { contactId: true, userId: true },
    });
    if (!sale) return;
    const items = await transaction.saleItem.findMany({
      where: {
        organizationId: context.user.organizationId,
        saleId,
        deletedAt: null,
        requiresSubscriptionSnapshot: true,
      },
      select: {
        id: true,
        saleId: true,
        productId: true,
        planId: true,
        variantId: true,
        snapshotVersion: true,
        productNameSnapshot: true,
        skuSnapshot: true,
        planNameSnapshot: true,
        variantNameSnapshot: true,
        catalogSnapshot: true,
        quantity: true,
        total: true,
        currency: true,
        billingPeriodUnitSnapshot: true,
        billingPeriodCountSnapshot: true,
      },
    });
    for (const item of items) {
      const existing = await transaction.subscription.findUnique({
        where: {
          organizationId_saleItemId: {
            organizationId: context.user.organizationId,
            saleItemId: item.id,
          },
        },
        select: { id: true },
      });
      if (existing) continue;
      const cycle = this.subscriptionCycle(item);
      const snapshot = this.snapshotRecord(item.catalogSnapshot);
      const durationDays = snapshot?.subscriptionDurationDays;
      const periodEnd =
        typeof durationDays === 'number'
          ? addSubscriptionDuration(startedAt, durationDays)
          : this.addSubscriptionCycle(startedAt, cycle.billingCycle, cycle.customIntervalDays);
      const subscription = await transaction.subscription.create({
        data: {
          organizationId: context.user.organizationId,
          saleId,
          saleItemId: item.id,
          contactId: sale.contactId,
          userId: sale.userId ?? context.user.userId,
          productId: item.productId,
          planId: item.planId,
          variantId: item.variantId,
          snapshotVersion: item.snapshotVersion,
          status: SubscriptionStatus.PENDING,
          billingCycle: cycle.billingCycle,
          customIntervalDays: cycle.customIntervalDays,
          currency: item.currency,
          amount: item.total,
          quantity: item.quantity,
          productNameSnapshot: item.productNameSnapshot,
          skuSnapshot: item.skuSnapshot,
          planNameSnapshot: item.planNameSnapshot,
          variantNameSnapshot: item.variantNameSnapshot,
          catalogSnapshot: item.catalogSnapshot as Prisma.InputJsonValue,
          startsAt: startedAt,
          currentPeriodStart: startedAt,
          currentPeriodEnd: periodEnd,
          nextBillingAt: periodEnd,
        },
        select: { id: true },
      });
      const renewal = await transaction.renewal.create({
        data: {
          organizationId: context.user.organizationId,
          subscriptionId: subscription.id,
          sourceSaleId: saleId,
          userId: sale.userId ?? context.user.userId,
          status: RenewalStatus.PENDING,
          billingCycle: cycle.billingCycle,
          customIntervalDays: cycle.customIntervalDays,
          amount: item.total,
          currency: item.currency,
          dueAt: periodEnd,
          periodStart: startedAt,
          periodEnd,
          cycleKey: this.cycleKey(subscription.id, startedAt),
          snapshotVersion: item.snapshotVersion,
          productNameSnapshot: item.productNameSnapshot,
          skuSnapshot: item.skuSnapshot,
          catalogSnapshot: item.catalogSnapshot as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      const reminderData = [
        { kind: RenewalReminderKind.DAYS_7, scheduledFor: this.shiftDays(periodEnd, -7) },
        { kind: RenewalReminderKind.DAYS_3, scheduledFor: this.shiftDays(periodEnd, -3) },
        { kind: RenewalReminderKind.DUE_TODAY, scheduledFor: periodEnd },
      ].map((reminder) => ({
        organizationId: context.user.organizationId,
        renewalId: renewal.id,
        userId: sale.userId ?? context.user.userId,
        kind: reminder.kind,
        scheduledFor: reminder.scheduledFor,
      }));
      await transaction.renewalReminder.createMany({ data: reminderData, skipDuplicates: true });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: sale.contactId,
          saleId,
          type: ActivityType.SYSTEM,
          title: 'Suscripción y renovación creadas',
          metadata: jsonObject({ subscriptionId: subscription.id, renewalId: renewal.id }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'SUBSCRIPTION_CREATED',
        tableName: 'Subscription',
        recordId: subscription.id,
        newValue: jsonObject({ saleId, saleItemId: item.id, billingCycle: cycle.billingCycle }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'RENEWAL_CREATED',
        tableName: 'Renewal',
        recordId: renewal.id,
        newValue: jsonObject({ subscriptionId: subscription.id, dueAt: periodEnd.toISOString() }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.enqueueEvent(transaction, 'SubscriptionCreated', subscription.id, context, {
        saleId,
        status: SubscriptionStatus.PENDING,
      });
      await this.enqueueEvent(transaction, 'RenewalCreated', renewal.id, context, {
        subscriptionId: subscription.id,
        status: RenewalStatus.PENDING,
      });
    }
  }

  private subscriptionCycle(item: {
    billingPeriodUnitSnapshot: BillingPeriodUnit | null;
    billingPeriodCountSnapshot: number | null;
    catalogSnapshot: Prisma.JsonValue;
  }): { billingCycle: BillingCycle; customIntervalDays: number | null } {
    const snapshot = this.snapshotRecord(item.catalogSnapshot);
    const durationDays = snapshot?.subscriptionDurationDays;
    if (typeof durationDays === 'number') {
      if (durationDays === 30) return { billingCycle: BillingCycle.CUSTOM, customIntervalDays: 30 };
      if (durationDays === 90)
        return { billingCycle: BillingCycle.QUARTERLY, customIntervalDays: null };
      if (durationDays === 180)
        return { billingCycle: BillingCycle.SEMI_ANNUAL, customIntervalDays: null };
      if (durationDays === 365)
        return { billingCycle: BillingCycle.ANNUAL, customIntervalDays: null };
    }
    const count = item.billingPeriodCountSnapshot ?? 1;
    if (item.billingPeriodUnitSnapshot === BillingPeriodUnit.DAY)
      return { billingCycle: BillingCycle.CUSTOM, customIntervalDays: count };
    if (item.billingPeriodUnitSnapshot === BillingPeriodUnit.WEEK)
      return { billingCycle: BillingCycle.CUSTOM, customIntervalDays: count * 7 };
    if (item.billingPeriodUnitSnapshot === BillingPeriodUnit.MONTH) {
      if (count === 3) return { billingCycle: BillingCycle.QUARTERLY, customIntervalDays: null };
      if (count === 6) return { billingCycle: BillingCycle.SEMI_ANNUAL, customIntervalDays: null };
      return { billingCycle: BillingCycle.MONTHLY, customIntervalDays: null };
    }
    if (item.billingPeriodUnitSnapshot === BillingPeriodUnit.YEAR)
      return { billingCycle: BillingCycle.ANNUAL, customIntervalDays: null };
    return { billingCycle: BillingCycle.MONTHLY, customIntervalDays: null };
  }

  private addSubscriptionCycle(
    start: Date,
    cycle: BillingCycle,
    customIntervalDays: number | null,
  ): Date {
    return (
      addSubscriptionBillingCycle(start, cycle, customIntervalDays) ??
      addSubscriptionDuration(start, 30)
    );
  }

  private cycleKey(subscriptionId: string, periodStart: Date): string {
    return `${subscriptionId}:${periodStart.toISOString()}`;
  }

  private shiftDays(date: Date, days: number): Date {
    const shifted = new Date(date);
    shifted.setDate(shifted.getDate() + days);
    return shifted;
  }

  private snapshotRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> | null {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, Prisma.JsonValue>;
    }
    return null;
  }

  private async markOpportunityPurchased(
    transaction: CommercialClient,
    saleId: string,
    context: CommercialRequestContext,
    occurredAt: Date,
  ): Promise<void> {
    const sale = await transaction.sale.findFirst({
      where: { id: saleId, organizationId: context.user.organizationId, deletedAt: null },
      select: { opportunityId: true, contactId: true },
    });
    if (!sale?.opportunityId) return;
    const purchasedStage = await transaction.pipelineStage.findFirst({
      where: {
        organizationId: context.user.organizationId,
        systemKey: 'PURCHASED',
        active: true,
        deletedAt: null,
        category: PipelineStageCategory.WON,
      },
      orderBy: { order: 'asc' },
      select: { id: true, name: true },
    });
    if (!purchasedStage) return;
    const opportunity = await transaction.opportunity.findFirst({
      where: {
        id: sale.opportunityId,
        organizationId: context.user.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        pipelineStageId: true,
        pipelineStage: { select: { id: true, name: true } },
      },
    });
    if (!opportunity || opportunity.pipelineStageId === purchasedStage.id) {
      await transaction.contact.update({
        where: {
          organizationId_id: { organizationId: context.user.organizationId, id: sale.contactId },
        },
        data: { isCustomer: true, lastActivityAt: occurredAt },
      });
      return;
    }
    await transaction.opportunity.update({
      where: {
        organizationId_id: { organizationId: context.user.organizationId, id: opportunity.id },
      },
      data: { pipelineStageId: purchasedStage.id, closedAt: occurredAt, wonAt: occurredAt },
    });
    await transaction.opportunityStageHistory.create({
      data: {
        organizationId: context.user.organizationId,
        opportunityId: opportunity.id,
        fromStageId: opportunity.pipelineStageId,
        toStageId: purchasedStage.id,
        changedByUserId: context.user.userId,
        reason: 'Venta confirmada',
        changedAt: occurredAt,
      },
    });
    await transaction.followUp.updateMany({
      where: {
        organizationId: context.user.organizationId,
        opportunityId: opportunity.id,
        status: FollowUpStatus.PENDING,
        deletedAt: null,
      },
      data: {
        status: FollowUpStatus.CANCELLED,
        cancelledAt: occurredAt,
        cancellationReason: 'Venta confirmada',
      },
    });
    await transaction.activity.create({
      data: {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        contactId: sale.contactId,
        opportunityId: opportunity.id,
        saleId,
        type: ActivityType.STATUS_CHANGE,
        title: 'Oportunidad marcada como Compró',
        metadata: jsonObject({ from: opportunity.pipelineStage.name, to: purchasedStage.name }),
        occurredAt,
        requestId: context.metadata.requestId ?? null,
      },
    });
    await transaction.contact.update({
      where: {
        organizationId_id: { organizationId: context.user.organizationId, id: sale.contactId },
      },
      data: { isCustomer: true, lastActivityAt: occurredAt },
    });
    await this.audit.recordWithClient(transaction, {
      organizationId: context.user.organizationId,
      userId: context.user.userId,
      action: 'OPPORTUNITY_STAGE_CHANGED',
      tableName: 'Opportunity',
      recordId: opportunity.id,
      previousValue: jsonObject({
        stageId: opportunity.pipelineStageId,
        stage: opportunity.pipelineStage.name,
      }),
      newValue: jsonObject({
        stageId: purchasedStage.id,
        stage: purchasedStage.name,
        reason: 'Venta confirmada',
      }),
      ip: context.metadata.ipAddress,
      requestId: context.metadata.requestId,
    });
    await this.enqueueEvent(transaction, 'OpportunityStageChanged', opportunity.id, context, {
      fromStageId: opportunity.pipelineStageId,
      toStageId: purchasedStage.id,
    });
  }

  private async transition(
    id: string,
    target: SaleStatus,
    eventName: CommercialEventName,
    auditAction: string,
    context: CommercialRequestContext,
    reason?: string,
    payment?: ConfirmSalePaymentDto,
  ): Promise<Record<string, unknown>> {
    await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Sale" WHERE "id" = ${id}::uuid AND "organizationId" = ${context.user.organizationId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0)
        this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
      const sale = await transaction.sale.findFirst({
        where: { id, organizationId: context.user.organizationId, deletedAt: null },
        select: {
          status: true,
          userId: true,
          contactId: true,
          opportunityId: true,
          currency: true,
          total: true,
          paymentMethod: true,
          paidNow: true,
        },
      });
      if (!sale) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
      this.access.assertMutate(context.user, sale.userId);
      if (sale.status === target) return;
      if (!this.validTransition(sale.status, target)) {
        throw commercialException(
          HttpStatus.CONFLICT,
          COMMERCIAL_ERROR_CODES.INVALID_STATE,
          'La venta no puede cambiar a ese estado.',
        );
      }
      if (target === SaleStatus.CANCELLED) {
        const paymentTotals = await transaction.payment.aggregate({
          where: {
            organizationId: context.user.organizationId,
            saleId: id,
            status: { in: ['CONFIRMED', 'REFUNDED'] },
            deletedAt: null,
          },
          _sum: { netAmount: true, refundedAmount: true },
        });
        const confirmedNet = (paymentTotals._sum.netAmount ?? new Prisma.Decimal(0)).sub(
          paymentTotals._sum.refundedAmount ?? new Prisma.Decimal(0),
        );
        if (confirmedNet.greaterThan(0))
          throw commercialException(
            HttpStatus.CONFLICT,
            COMMERCIAL_ERROR_CODES.SALE_CANCELLED_WITH_BALANCE,
            'La venta debe tener pagos netos en cero antes de cancelarse.',
          );
      }
      const transitionAt = new Date();
      if (target === SaleStatus.CONFIRMED) {
        await this.consumeTrackedStock(transaction, id, context);
      }
      await transaction.sale.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status: target,
          version: { increment: 1 },
          ...(target === SaleStatus.CONFIRMED ? { soldAt: transitionAt } : {}),
          ...(target === SaleStatus.CANCELLED
            ? { cancelledAt: transitionAt, cancellationReason: reason?.trim() || null }
            : {}),
        },
      });
      if (target === SaleStatus.CONFIRMED) {
        await this.ensureSubscriptionsForSale(transaction, id, context, transitionAt);
        await this.markOpportunityPurchased(transaction, id, context, transitionAt);
        const immediatePayment =
          payment ??
          (sale.paidNow
            ? {
                amount: sale.total.toFixed(2),
                currency: sale.currency,
                method: sale.paymentMethod ?? PaymentMethod.MANUAL,
              }
            : undefined);
        if (immediatePayment)
          await this.createConfirmedPayment(
            transaction,
            id,
            immediatePayment,
            context,
            transitionAt,
          );
      }
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: sale.contactId,
          opportunityId: sale.opportunityId,
          saleId: id,
          type: ActivityType.STATUS_CHANGE,
          title: `Venta ${target.toLowerCase()}`,
          metadata: jsonObject({ status: target }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: auditAction,
        tableName: 'Sale',
        recordId: id,
        previousValue: jsonObject({ status: sale.status }),
        newValue: jsonObject({ status: target }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.enqueueEvent(transaction, eventName, id, context, { status: target });
    });
    return this.findOne(id, context.user);
  }

  private async createConfirmedPayment(
    transaction: CommercialClient,
    saleId: string,
    payment: ConfirmSalePaymentDto,
    context: CommercialRequestContext,
    occurredAt: Date,
  ): Promise<void> {
    const amount = parseMoney(payment.amount);
    positive(amount, 'payment amount');
    const currency = normalizeCurrency(payment.currency);
    if (!isSupportedCurrency(currency)) {
      throw commercialException(
        HttpStatus.BAD_REQUEST,
        COMMERCIAL_ERROR_CODES.UNSUPPORTED_CURRENCY,
        'La moneda no está admitida.',
      );
    }
    const sale = await transaction.sale.findFirst({
      where: { id: saleId, organizationId: context.user.organizationId, deletedAt: null },
      select: { total: true, currency: true },
    });
    if (!sale) this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
    if (sale.currency !== currency)
      throw commercialException(
        HttpStatus.BAD_REQUEST,
        COMMERCIAL_ERROR_CODES.INVALID_MONEY,
        'La moneda del pago debe coincidir con la venta.',
      );
    const aggregate = await transaction.payment.aggregate({
      where: {
        organizationId: context.user.organizationId,
        saleId,
        status: { in: [PaymentStatus.CONFIRMED, PaymentStatus.REFUNDED] },
        deletedAt: null,
      },
      _sum: { netAmount: true, refundedAmount: true },
    });
    const confirmed = (aggregate._sum.netAmount ?? new Prisma.Decimal(0)).sub(
      aggregate._sum.refundedAmount ?? new Prisma.Decimal(0),
    );
    if (amount.gt(sale.total.sub(confirmed)))
      throw commercialException(
        HttpStatus.CONFLICT,
        COMMERCIAL_ERROR_CODES.PAYMENT_EXCEEDS_BALANCE,
        'El pago excede el saldo pendiente de la venta.',
      );
    const paymentId = randomUUID();
    await transaction.payment.create({
      data: {
        id: paymentId,
        organizationId: context.user.organizationId,
        saleId,
        grossAmount: amount,
        feeAmount: new Prisma.Decimal(0),
        netAmount: amount,
        currency,
        method: payment.method,
        status: PaymentStatus.CONFIRMED,
        paymentDate: occurredAt,
        confirmedAt: occurredAt,
      },
    });
    await transaction.activity.create({
      data: {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        saleId,
        type: ActivityType.PAYMENT,
        title: 'Pago confirmado con la venta',
        metadata: jsonObject({ status: PaymentStatus.CONFIRMED, method: payment.method }),
        requestId: context.metadata.requestId ?? null,
      },
    });
    await this.audit.recordWithClient(transaction, {
      organizationId: context.user.organizationId,
      userId: context.user.userId,
      action: 'PAYMENT_CONFIRMED',
      tableName: 'Payment',
      recordId: paymentId,
      newValue: jsonObject({ status: PaymentStatus.CONFIRMED, saleId, amount: amount.toFixed(2) }),
      ip: context.metadata.ipAddress,
      requestId: context.metadata.requestId,
    });
    await this.outbox.enqueueWithClient(transaction, {
      eventType: 'PaymentConfirmed',
      organizationId: context.user.organizationId,
      aggregateType: 'Payment',
      aggregateId: paymentId,
      actorId: context.user.userId,
      requestId: context.metadata.requestId ?? randomUUID(),
      payload: jsonObject({ status: PaymentStatus.CONFIRMED, saleId }),
    });
  }

  private validTransition(from: SaleStatus, to: SaleStatus): boolean {
    if (to === SaleStatus.CONFIRMED)
      return from === SaleStatus.DRAFT || from === SaleStatus.PENDING;
    if (to === SaleStatus.FULFILLED) return from === SaleStatus.CONFIRMED;
    if (to === SaleStatus.CANCELLED)
      return from !== SaleStatus.FULFILLED && from !== SaleStatus.CANCELLED;
    return false;
  }

  private mapSale(sale: SaleWithDetails, user: AuthenticatedUser): Record<string, unknown> {
    const includeCosts = user.permissions.includes('catalog.costs.read');
    const firstName = sale.contact?.firstName?.trim() ?? '';
    const lastName = sale.contact?.lastName?.trim() ?? '';
    const contactName =
      [firstName, lastName].filter(Boolean).join(' ') ||
      sale.contact?.phone?.trim() ||
      sale.contact?.email?.trim() ||
      'Cliente';
    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      status: sale.status,
      contact: sale.contact
        ? {
            id: sale.contact.id,
            name: contactName,
            firstName: sale.contact.firstName,
            lastName: sale.contact.lastName,
            phone: sale.contact.phone,
            email: sale.contact.email,
            country: sale.contact.country,
          }
        : null,
      opportunity: sale.opportunity,
      owner: sale.seller,
      subtotal: sale.subtotal.toFixed(2),
      discountAmount: sale.discountAmount.toFixed(2),
      taxAmount: sale.taxAmount.toFixed(2),
      total: sale.total.toFixed(2),
      currency: sale.currency,
      paymentMethod: sale.paymentMethod,
      paidNow: sale.paidNow,
      note: sale.note,
      paymentDueAt: sale.paymentDueAt,
      soldAt: sale.soldAt,
      cancelledAt: sale.cancelledAt,
      cancellationReason: sale.cancellationReason,
      subscriptions: sale.subscriptions.map((subscription) => {
        const snapshot = this.snapshotRecord(subscription.catalogSnapshot);
        const durationDays = snapshot?.subscriptionDurationDays;
        const renewal = subscription.renewals[0] ?? null;
        return {
          id: subscription.id,
          saleItemId: subscription.saleItemId,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          customIntervalDays: subscription.customIntervalDays,
          productName: subscription.productNameSnapshot,
          durationDays: typeof durationDays === 'number' ? durationDays : null,
          startsAt: subscription.startsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
          nextBillingAt: subscription.nextBillingAt,
          renewal: renewal
            ? { id: renewal.id, status: renewal.status, dueAt: renewal.dueAt }
            : null,
        };
      }),
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        planId: item.planId,
        variantId: item.variantId,
        productName: item.productNameSnapshot,
        sku: item.skuSnapshot,
        quantity: item.quantity.toFixed(3),
        unitPrice: item.unitPrice.toFixed(2),
        discountAmount: item.discountAmount.toFixed(2),
        taxAmount: item.taxAmount.toFixed(2),
        total: item.total.toFixed(2),
        currency: item.currency,
        snapshotVersion: item.snapshotVersion,
        catalogSnapshot: sanitizeSnapshot(item.catalogSnapshot, includeCosts),
      })),
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        grossAmount: payment.grossAmount.toFixed(2),
        feeAmount: payment.feeAmount.toFixed(2),
        netAmount: payment.netAmount.toFixed(2),
        refundedAmount: payment.refundedAmount.toFixed(2),
        currency: payment.currency,
        method: payment.method,
        reference: payment.reference,
        status: payment.status,
        paymentDate: payment.paymentDate,
      })),
      renewals: sale.renewalItems.map((renewal) => ({
        id: renewal.id,
        status: renewal.status,
        workflowStatus: renewal.workflowStatus,
        dueAt: renewal.dueAt,
        paidAt: renewal.paidAt,
        amount: renewal.amount.toFixed(2),
        currency: renewal.currency,
      })),
      fulfillments: sale.fulfillments.map((fulfillment) => ({
        id: fulfillment.id,
        status: fulfillment.status,
        mode: fulfillment.mode,
        attemptCount: fulfillment.attemptCount,
        completedAt: fulfillment.completedAt,
        provider: fulfillment.provider?.name ?? null,
        activations: fulfillment.activations,
      })),
      activities: sale.activities,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    };
  }

  private async enqueueEvent(
    transaction: CommercialClient,
    name: CommercialEventName,
    aggregateId: string,
    context: CommercialRequestContext,
    payload: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.outbox.enqueueWithClient(transaction, {
      eventType: name,
      organizationId: context.user.organizationId,
      aggregateType: 'Commercial',
      aggregateId,
      actorId: context.user.userId,
      requestId: context.metadata.requestId ?? randomUUID(),
      payload,
    });
  }

  private notFound(code: string, message: string): never {
    throw commercialException(HttpStatus.NOT_FOUND, code, message);
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
