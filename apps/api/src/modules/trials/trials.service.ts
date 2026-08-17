import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ProductStatus, SaleStatus, TrialStatus } from '@prisma/client';

import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { nextSaleNumber } from '../commercial/sale-number';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { operationsException, OPERATIONS_ERROR_CODES } from '../operations/operations.errors';
import { OperationsRequestContext, safeObject } from '../operations/operations.types';
import { CreateTrialDto, ListTrialsQueryDto } from './dto/trials.dto';

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class TrialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    dto: CreateTrialDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    const organizationId = context.user.organizationId;
    const start = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const end = dto.endsAt
      ? new Date(dto.endsAt)
      : new Date(start.getTime() + (dto.durationMinutes ?? 1_440) * 60_000);
    if (end <= start)
      throw operationsException(
        HttpStatus.BAD_REQUEST,
        OPERATIONS_ERROR_CODES.INVALID_STATE,
        'El periodo del trial no es válido.',
      );
    try {
      const record = await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${dto.contactId}:${dto.productId}:${dto.planId ?? '-'}:${dto.variantId ?? '-'}`}, 0))`,
        );
        const product = await transaction.product.findFirst({
          where: { id: dto.productId, organizationId, deletedAt: null },
        });
        if (!product)
          throw operationsException(
            HttpStatus.NOT_FOUND,
            OPERATIONS_ERROR_CODES.NOT_FOUND,
            'Producto no encontrado.',
          );
        if (!product.active || product.status !== ProductStatus.ACTIVE || !product.allowsDemo)
          throw operationsException(
            HttpStatus.CONFLICT,
            OPERATIONS_ERROR_CODES.TRIAL_NOT_ALLOWED,
            'El producto no admite trials activos.',
          );
        const contact = await transaction.contact.findFirst({
          where: { id: dto.contactId, organizationId, deletedAt: null },
        });
        if (!contact)
          throw operationsException(
            HttpStatus.NOT_FOUND,
            OPERATIONS_ERROR_CODES.NOT_FOUND,
            'Contacto no encontrado.',
          );
        if (dto.opportunityId) {
          const opportunity = await transaction.opportunity.findFirst({
            where: {
              id: dto.opportunityId,
              organizationId,
              contactId: dto.contactId,
              deletedAt: null,
            },
          });
          if (!opportunity)
            throw operationsException(
              HttpStatus.NOT_FOUND,
              OPERATIONS_ERROR_CODES.NOT_FOUND,
              'Oportunidad no encontrada.',
            );
        }
        const plan = dto.planId
          ? await transaction.productPlan.findFirst({
              where: {
                id: dto.planId,
                organizationId,
                productId: dto.productId,
                active: true,
                deletedAt: null,
              },
            })
          : null;
        if (dto.planId && !plan)
          throw operationsException(
            HttpStatus.CONFLICT,
            OPERATIONS_ERROR_CODES.MAPPING_INVALID,
            'El plan no es válido para el producto.',
          );
        const variant = dto.variantId
          ? await transaction.productVariant.findFirst({
              where: {
                id: dto.variantId,
                organizationId,
                productId: dto.productId,
                active: true,
                deletedAt: null,
              },
            })
          : null;
        if (dto.variantId && !variant)
          throw operationsException(
            HttpStatus.CONFLICT,
            OPERATIONS_ERROR_CODES.MAPPING_INVALID,
            'La variante no es válida para el producto.',
          );
        const provider = dto.providerId
          ? await transaction.provider.findFirst({
              where: { id: dto.providerId, organizationId, status: 'ACTIVE', deletedAt: null },
            })
          : null;
        if (dto.providerId && !provider)
          throw operationsException(
            HttpStatus.CONFLICT,
            OPERATIONS_ERROR_CODES.PROVIDER_INACTIVE,
            'El proveedor no está activo.',
          );
        const ownerId = dto.ownerId ?? context.user.userId;
        const owner = await transaction.user.findFirst({
          where: {
            id: ownerId,
            organizationId,
            status: 'ACTIVE',
            deletedAt: null,
            role: { deletedAt: null },
          },
        });
        if (!owner)
          throw operationsException(
            HttpStatus.CONFLICT,
            OPERATIONS_ERROR_CODES.CONFLICT,
            'El responsable no es válido.',
          );
        const identityKey = `${dto.contactId}:${dto.productId}:${dto.planId ?? '-'}:${dto.variantId ?? '-'}:${start.toISOString()}`;
        const existing = await transaction.trial.findFirst({
          where: {
            organizationId,
            contactId: dto.contactId,
            productId: dto.productId,
            planId: dto.planId ?? null,
            variantId: dto.variantId ?? null,
            deletedAt: null,
            status: { in: [TrialStatus.REQUESTED, TrialStatus.APPROVED, TrialStatus.ACTIVE] },
            startsAt: { lt: end },
            endsAt: { gt: start },
          },
        });
        if (existing) return existing;
        const snapshot = safeObject({
          snapshotVersion: 1,
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          productType: product.type,
          planId: plan?.id ?? null,
          planName: plan?.name ?? null,
          variantId: variant?.id ?? null,
          variantName: variant?.name ?? null,
          quantity: '1',
          salePrice: product.price?.toString() ?? '0',
          currency: product.currency ?? 'USD',
          fulfillmentMode: product.fulfillmentMode,
          requiresSubscription: product.requiresSubscription,
        });
        const created = await transaction.trial.create({
          data: {
            organizationId,
            contactId: dto.contactId,
            opportunityId: dto.opportunityId ?? null,
            productId: dto.productId,
            planId: dto.planId ?? null,
            variantId: dto.variantId ?? null,
            providerId: dto.providerId ?? null,
            ownerId,
            status: TrialStatus.REQUESTED,
            startsAt: start,
            endsAt: end,
            durationMinutes:
              dto.durationMinutes ?? Math.ceil((end.getTime() - start.getTime()) / 60_000),
            identityKey,
            snapshotVersion: 1,
            commercialSnapshot: snapshot,
            notes: dto.notes?.trim() ?? null,
            requestId: context.metadata.requestId ?? null,
          },
        });
        await transaction.activity.create({
          data: {
            organizationId,
            userId: context.user.userId,
            contactId: dto.contactId,
            opportunityId: dto.opportunityId ?? null,
            type: 'SYSTEM',
            title: 'Trial creado',
            metadata: safeObject({ trialId: created.id, status: created.status }),
            requestId: context.metadata.requestId ?? null,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'TRIAL_CREATED',
          tableName: 'Trial',
          recordId: created.id,
          newValue: safeObject({
            contactId: dto.contactId,
            productId: dto.productId,
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
          }),
          ip: context.metadata.ipAddress,
          requestId: context.metadata.requestId,
        });
        await this.event(transaction, 'TrialCreated', created.id, context, {
          status: created.status,
        });
        return created;
      });
      return this.map(record);
    } catch (error: unknown) {
      if (isUnique(error))
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.TRIAL_DUPLICATE,
          'Ya existe un trial para el mismo ciclo.',
        );
      throw error;
    }
  }

  async list(query: ListTrialsQueryDto, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const where: Prisma.TrialWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.trial.findMany({
        where,
        orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.trial.count({ where }),
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
    const record = await this.prisma.trial.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!record)
      throw operationsException(
        HttpStatus.NOT_FOUND,
        OPERATIONS_ERROR_CODES.TRIAL_NOT_FOUND,
        'Trial no encontrado.',
      );
    return this.map(record);
  }

  async transition(
    id: string,
    status: TrialStatus,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    const record = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "Trial" WHERE "organizationId" = ${context.user.organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`,
      );
      const current = await transaction.trial.findFirst({
        where: { id, organizationId: context.user.organizationId, deletedAt: null },
      });
      if (!current)
        throw operationsException(
          HttpStatus.NOT_FOUND,
          OPERATIONS_ERROR_CODES.TRIAL_NOT_FOUND,
          'Trial no encontrado.',
        );
      const allowed: Record<TrialStatus, TrialStatus[]> = {
        REQUESTED: [TrialStatus.APPROVED, TrialStatus.CANCELLED],
        APPROVED: [TrialStatus.ACTIVE, TrialStatus.CANCELLED],
        ACTIVE: [TrialStatus.EXPIRED, TrialStatus.CONVERTED, TrialStatus.CANCELLED],
        EXPIRED: [],
        CONVERTED: [],
        CANCELLED: [],
        FAILED: [],
      };
      if (!allowed[current.status].includes(status) && current.status !== status)
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'Transición de trial no válida.',
        );
      const updated = await transaction.trial.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { status },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: updated.contactId,
          opportunityId: updated.opportunityId,
          type: 'SYSTEM',
          title: `Trial ${status.toLowerCase()}`,
          metadata: safeObject({ trialId: id, status }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: `TRIAL_${status}`,
        tableName: 'Trial',
        recordId: id,
        previousValue: safeObject({ status: current.status }),
        newValue: safeObject({ status }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      const event: 'TrialActivated' | 'TrialExpired' =
        status === TrialStatus.ACTIVE ? 'TrialActivated' : 'TrialExpired';
      if (status === TrialStatus.ACTIVE || status === TrialStatus.EXPIRED)
        await this.event(transaction, event, id, context, { status });
      return updated;
    });
    return this.map(record);
  }

  async convert(id: string, context: OperationsRequestContext): Promise<Record<string, unknown>> {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "Trial" WHERE "organizationId" = ${context.user.organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`,
      );
      const trial = await transaction.trial.findFirst({
        where: { id, organizationId: context.user.organizationId, deletedAt: null },
      });
      if (!trial)
        throw operationsException(
          HttpStatus.NOT_FOUND,
          OPERATIONS_ERROR_CODES.TRIAL_NOT_FOUND,
          'Trial no encontrado.',
        );
      if (trial.status === TrialStatus.CONVERTED && trial.conversionSaleId)
        return { saleId: trial.conversionSaleId };
      if (trial.status !== TrialStatus.ACTIVE)
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'Solo un trial activo puede convertirse.',
        );
      const snapshot = this.jsonRecord(trial.commercialSnapshot);
      const amount = new Prisma.Decimal(
        typeof snapshot.salePrice === 'string' || typeof snapshot.salePrice === 'number'
          ? String(snapshot.salePrice)
          : '0',
      );
      const currency = typeof snapshot.currency === 'string' ? snapshot.currency : 'USD';
      const sale = await transaction.sale.create({
        data: {
          organizationId: context.user.organizationId,
          saleNumber: await nextSaleNumber(transaction, context.user.organizationId),
          contactId: trial.contactId,
          opportunityId: trial.opportunityId,
          userId: trial.ownerId,
          status: SaleStatus.DRAFT,
          subtotal: amount,
          discountAmount: 0,
          taxAmount: 0,
          total: amount,
          currency,
          note: 'Venta convertida desde trial',
        },
      });
      await transaction.saleItem.create({
        data: {
          organizationId: context.user.organizationId,
          saleId: sale.id,
          productId: trial.productId,
          planId: trial.planId,
          variantId: trial.variantId,
          snapshotVersion: Number(snapshot.snapshotVersion ?? 1),
          productNameSnapshot:
            typeof snapshot.productName === 'string' ? snapshot.productName : 'Producto',
          productSlugSnapshot:
            typeof snapshot.productSlug === 'string' ? snapshot.productSlug : null,
          skuSnapshot: null,
          planNameSnapshot: typeof snapshot.planName === 'string' ? snapshot.planName : null,
          variantNameSnapshot:
            typeof snapshot.variantName === 'string' ? snapshot.variantName : null,
          catalogSnapshot: trial.commercialSnapshot as Prisma.InputJsonValue,
          quantity: 1,
          unitPrice: amount,
          discountAmount: 0,
          taxAmount: 0,
          total: amount,
          currency,
        },
      });
      const updated = await transaction.trial.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { status: TrialStatus.CONVERTED, conversionSaleId: sale.id },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: trial.contactId,
          opportunityId: trial.opportunityId,
          saleId: sale.id,
          type: 'SYSTEM',
          title: 'Trial convertido',
          metadata: safeObject({ trialId: id, saleId: sale.id }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'TRIAL_CONVERTED',
        tableName: 'Trial',
        recordId: id,
        newValue: safeObject({ saleId: sale.id }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.event(transaction, 'TrialConverted', id, context, { saleId: sale.id });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'SaleCreated',
        organizationId: context.user.organizationId,
        aggregateType: 'Sale',
        aggregateId: sale.id,
        actorId: context.user.userId,
        requestId: context.metadata.requestId ?? sale.id,
        payload: safeObject({ saleId: sale.id, source: 'TRIAL_CONVERSION' }),
      });
      return { saleId: updated.conversionSaleId };
    });
    return result;
  }

  private async event(
    transaction: Prisma.TransactionClient,
    eventType: 'TrialCreated' | 'TrialActivated' | 'TrialExpired' | 'TrialConverted',
    id: string,
    context: OperationsRequestContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.outbox.enqueueWithClient(transaction, {
      eventType,
      organizationId: context.user.organizationId,
      aggregateType: 'Trial',
      aggregateId: id,
      actorId: context.user.userId,
      requestId: context.metadata.requestId ?? id,
      payload: safeObject(payload),
    });
  }
  private jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  private map(record: {
    id: string;
    contactId: string;
    opportunityId: string | null;
    productId: string;
    planId: string | null;
    variantId: string | null;
    providerId: string | null;
    fulfillmentId: string | null;
    ownerId: string | null;
    status: TrialStatus;
    startsAt: Date;
    endsAt: Date;
    durationMinutes: number;
    commercialSnapshot: Prisma.JsonValue;
    conversionSaleId: string | null;
    notes: string | null;
    requestId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Record<string, unknown> {
    return {
      id: record.id,
      contactId: record.contactId,
      opportunityId: record.opportunityId,
      productId: record.productId,
      planId: record.planId,
      variantId: record.variantId,
      providerId: record.providerId,
      fulfillmentId: record.fulfillmentId,
      ownerId: record.ownerId,
      status: record.status,
      startsAt: record.startsAt,
      endsAt: record.endsAt,
      durationMinutes: record.durationMinutes,
      snapshot: record.commercialSnapshot,
      conversionSaleId: record.conversionSaleId,
      notes: record.notes,
      requestId: record.requestId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
