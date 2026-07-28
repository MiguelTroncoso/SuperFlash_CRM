import { HttpStatus, Injectable } from '@nestjs/common';
import { ActivityType, Prisma, SaleStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  ApplicationEventBus,
  CommercialEventName,
} from '../../infrastructure/events/application-event-bus';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
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
  CreateSaleDto,
  CreateSaleItemDto,
  ListSalesQueryDto,
  UpdateSaleDto,
} from './dto/sales.dto';
import { SalesAccessPolicy } from './access/sales-access.policy';

const saleInclude = {
  contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  seller: { select: { id: true, firstName: true, lastName: true, email: true } },
  opportunity: {
    select: {
      id: true,
      title: true,
      pipelineStage: { select: { id: true, name: true, color: true } },
    },
  },
  items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.SaleInclude;

type SaleWithDetails = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

interface SaleSnapshotSource {
  product: {
    id: string;
    name: string;
    slug: string;
    sku: string | null;
    type: SaleWithDetails['items'][number]['productTypeSnapshot'];
    fulfillmentMode: SaleWithDetails['items'][number]['fulfillmentModeSnapshot'];
    requiresSubscription: boolean;
    metadata: Prisma.JsonValue | null;
    active: boolean;
    status: string;
    price: Prisma.Decimal | null;
  };
  plan: {
    id: string;
    name: string;
    billingPeriodUnit: SaleWithDetails['items'][number]['billingPeriodUnitSnapshot'];
    billingPeriodCount: number;
    metadata: Prisma.JsonValue | null;
  } | null;
  variant: { id: string; name: string; code: string | null; attributes: Prisma.JsonValue } | null;
  priceBookEntry: { id: string; salePrice: Prisma.Decimal; taxIncluded: boolean } | null;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: ApplicationEventBus,
    private readonly access: SalesAccessPolicy,
  ) {}

  async create(
    dto: CreateSaleDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    const saleId = await this.prisma.$transaction((transaction) =>
      this.createInternal(transaction, dto, context.user, context.metadata.ipAddress),
    );
    this.publish('SaleCreated', saleId, context.user, { status: SaleStatus.DRAFT });
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
        return this.createInternal(transaction, dto, context.user, context.metadata.ipAddress);
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
    this.publish('SaleCreated', saleId, context.user, { conversion: 'OPPORTUNITY' });
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
              { note: { contains: query.search, mode: 'insensitive' } },
              { contact: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
              { contact: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
              { opportunity: { is: { title: { contains: query.search, mode: 'insensitive' } } } },
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
      data: records.map((record) => this.mapSale(record)),
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
    return { ...this.mapSale(sale), balance };
  }

  async update(
    id: string,
    dto: UpdateSaleDto,
    context: CommercialRequestContext,
  ): Promise<Record<string, unknown>> {
    const current = await this.prisma.sale.findFirst({
      where: { id, organizationId: context.user.organizationId, deletedAt: null },
      select: {
        id: true,
        status: true,
        userId: true,
        discountAmount: true,
        taxAmount: true,
        note: true,
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
    const discount =
      dto.discountAmount === undefined ? current.discountAmount : parseMoney(dto.discountAmount);
    const tax = dto.taxAmount === undefined ? current.taxAmount : parseMoney(dto.taxAmount);
    const subtotal = await this.prisma.saleItem.aggregate({
      where: { organizationId: context.user.organizationId, saleId: id, deletedAt: null },
      _sum: { total: true },
    });
    const total = (subtotal._sum.total ?? new Prisma.Decimal(0)).sub(discount).add(tax);
    if (total.isNegative()) {
      throw commercialException(
        HttpStatus.BAD_REQUEST,
        COMMERCIAL_ERROR_CODES.INVALID_MONEY,
        'El total de la venta no puede ser negativo.',
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.sale.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          discountAmount: discount,
          taxAmount: tax,
          total,
          note: dto.note === undefined ? current.note : dto.note?.trim() || null,
          version: { increment: 1 },
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'SALE_UPDATED',
        tableName: 'Sale',
        recordId: id,
        previousValue: jsonObject({
          discountAmount: current.discountAmount.toFixed(2),
          taxAmount: current.taxAmount.toFixed(2),
          note: current.note,
        }),
        newValue: jsonObject({
          discountAmount: discount.toFixed(2),
          taxAmount: tax.toFixed(2),
          note: dto.note ?? current.note,
        }),
        ip: context.metadata.ipAddress,
      });
    });
    return this.findOne(id, context.user);
  }

  async confirm(id: string, context: CommercialRequestContext): Promise<Record<string, unknown>> {
    return this.transition(id, SaleStatus.CONFIRMED, 'SaleConfirmed', 'SALE_CONFIRMED', context);
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
    user: AuthenticatedUser,
    ipAddress: string | undefined,
  ): Promise<string> {
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
      const built = await this.buildItem(transaction, item, currency, user.organizationId);
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
        requiresSubscriptionSnapshot: built.product.requiresSubscription,
        skuSnapshot: built.product.sku,
        planNameSnapshot: built.plan?.name ?? null,
        variantNameSnapshot: built.variant?.name ?? null,
        billingPeriodUnitSnapshot: built.plan?.billingPeriodUnit ?? null,
        billingPeriodCountSnapshot: built.plan?.billingPeriodCount ?? null,
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
    const sale = await transaction.sale.create({
      data: {
        organizationId: user.organizationId,
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
      },
    });
    await this.audit.recordWithClient(transaction, {
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'SALE_CREATED',
      tableName: 'Sale',
      recordId: sale.id,
      newValue: jsonObject({ status: SaleStatus.DRAFT, total: total.toFixed(2), currency }),
      ip: ipAddress,
    });
    return sale.id;
  }

  private async buildItem(
    transaction: CommercialClient,
    dto: CreateSaleItemDto,
    currency: string,
    organizationId: string,
  ): Promise<{
    product: SaleSnapshotSource['product'];
    plan: SaleSnapshotSource['plan'];
    variant: SaleSnapshotSource['variant'];
    priceBookEntry: SaleSnapshotSource['priceBookEntry'];
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    discount: Prisma.Decimal;
    tax: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    snapshot: Prisma.InputJsonObject;
  }> {
    const product = await transaction.product.findFirst({
      where: { organizationId, id: dto.productId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        type: true,
        fulfillmentMode: true,
        requiresSubscription: true,
        metadata: true,
        active: true,
        status: true,
        price: true,
      },
    });
    if (!product) this.notFound(COMMERCIAL_ERROR_CODES.CATALOG_NOT_FOUND, 'El producto no existe.');
    const plan = dto.planId
      ? await transaction.productPlan.findFirst({
          where: { organizationId, id: dto.planId, productId: dto.productId, deletedAt: null },
          select: {
            id: true,
            name: true,
            billingPeriodUnit: true,
            billingPeriodCount: true,
            metadata: true,
          },
        })
      : null;
    if (dto.planId && !plan)
      this.notFound(COMMERCIAL_ERROR_CODES.CATALOG_NOT_FOUND, 'El plan no pertenece al producto.');
    const variant = dto.variantId
      ? await transaction.productVariant.findFirst({
          where: { organizationId, id: dto.variantId, productId: dto.productId, deletedAt: null },
          select: { id: true, name: true, code: true, attributes: true },
        })
      : null;
    if (dto.variantId && !variant)
      this.notFound(
        COMMERCIAL_ERROR_CODES.CATALOG_NOT_FOUND,
        'La variante no pertenece al producto.',
      );
    const priceBookEntry = dto.priceBookEntryId
      ? await transaction.priceBookEntry.findFirst({
          where: {
            organizationId,
            id: dto.priceBookEntryId,
            productId: dto.productId,
            planId: dto.planId ?? null,
            variantId: dto.variantId ?? null,
            deletedAt: null,
          },
          select: { id: true, salePrice: true, taxIncluded: true },
        })
      : null;
    if (dto.priceBookEntryId && !priceBookEntry)
      this.notFound(
        COMMERCIAL_ERROR_CODES.CATALOG_NOT_FOUND,
        'El precio no pertenece a la combinación del catálogo.',
      );
    const quantity = parseQuantity(dto.quantity);
    positive(quantity, 'quantity');
    const unitPrice = parseMoney(
      dto.unitPrice ?? priceBookEntry?.salePrice.toFixed(2) ?? product.price?.toFixed(2) ?? '0',
    );
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
    const snapshot = JSON.parse(
      JSON.stringify({ product, plan, variant, priceBookEntry, currency }),
    ) as Prisma.InputJsonObject;
    return {
      product,
      plan,
      variant,
      priceBookEntry,
      quantity,
      unitPrice,
      discount,
      tax,
      lineTotal,
      snapshot,
    };
  }

  private async transition(
    id: string,
    target: SaleStatus,
    eventName: CommercialEventName,
    auditAction: string,
    context: CommercialRequestContext,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    let changed = false;
    await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Sale" WHERE "id" = ${id}::uuid AND "organizationId" = ${context.user.organizationId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0)
        this.notFound(COMMERCIAL_ERROR_CODES.SALE_NOT_FOUND, 'La venta no existe.');
      const sale = await transaction.sale.findFirst({
        where: { id, organizationId: context.user.organizationId, deletedAt: null },
        select: { status: true, userId: true, contactId: true, opportunityId: true },
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
      await transaction.sale.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status: target,
          version: { increment: 1 },
          ...(target === SaleStatus.CONFIRMED ? { soldAt: new Date() } : {}),
          ...(target === SaleStatus.CANCELLED
            ? { cancelledAt: new Date(), cancellationReason: reason?.trim() || null }
            : {}),
        },
      });
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
      });
      changed = true;
    });
    if (changed) this.publish(eventName, id, context.user, { status: target });
    return this.findOne(id, context.user);
  }

  private validTransition(from: SaleStatus, to: SaleStatus): boolean {
    if (to === SaleStatus.CONFIRMED)
      return from === SaleStatus.DRAFT || from === SaleStatus.PENDING;
    if (to === SaleStatus.FULFILLED) return from === SaleStatus.CONFIRMED;
    if (to === SaleStatus.CANCELLED)
      return from !== SaleStatus.FULFILLED && from !== SaleStatus.CANCELLED;
    return false;
  }

  private mapSale(sale: SaleWithDetails): Record<string, unknown> {
    return {
      id: sale.id,
      status: sale.status,
      contact: sale.contact,
      opportunity: sale.opportunity,
      owner: sale.seller,
      subtotal: sale.subtotal.toFixed(2),
      discountAmount: sale.discountAmount.toFixed(2),
      taxAmount: sale.taxAmount.toFixed(2),
      total: sale.total.toFixed(2),
      currency: sale.currency,
      note: sale.note,
      soldAt: sale.soldAt,
      cancelledAt: sale.cancelledAt,
      cancellationReason: sale.cancellationReason,
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
        catalogSnapshot: item.catalogSnapshot,
      })),
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
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

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
