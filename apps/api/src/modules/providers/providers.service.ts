import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ProviderFulfillmentMode, ProviderStatus } from '@prisma/client';

import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { operationsException, OPERATIONS_ERROR_CODES } from '../operations/operations.errors';
import {
  assertNoSecrets,
  OperationsRequestContext,
  safeObject,
} from '../operations/operations.types';
import {
  CreateProviderDto,
  CreateProviderMappingDto,
  ListProviderMappingsQueryDto,
  ListProvidersQueryDto,
  ProviderStatusDto,
  UpdateProviderDto,
  UpdateProviderMappingDto,
} from './dto/providers.dto';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function mappingKey(
  dto: Pick<CreateProviderMappingDto, 'providerId' | 'productId' | 'planId' | 'variantId'>,
): string {
  return [dto.providerId, dto.productId, dto.planId ?? '-', dto.variantId ?? '-'].join(':');
}

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    dto: CreateProviderDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    assertNoSecrets(dto.metadata);
    const organizationId = context.user.organizationId;
    const name = dto.name.trim();
    const slug = slugify(dto.slug ?? name);
    try {
      const provider = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.provider.create({
          data: {
            organizationId,
            name,
            slug,
            type: dto.type,
            status: dto.status ?? ProviderStatus.ACTIVE,
            fulfillmentMode: dto.fulfillmentMode ?? ProviderFulfillmentMode.MANUAL,
            apiBaseUrl: dto.apiBaseUrl?.trim() ?? null,
            ...(dto.metadata ? { metadata: safeObject(dto.metadata) } : {}),
            notes: dto.notes?.trim() ?? null,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'PROVIDER_CREATED',
          tableName: 'Provider',
          recordId: created.id,
          newValue: safeObject({ name: created.name, slug: created.slug, type: created.type }),
          ip: context.metadata.ipAddress,
          requestId: context.metadata.requestId,
        });
        await this.outbox.enqueueWithClient(transaction, {
          eventType: 'ProviderCreated',
          organizationId,
          aggregateType: 'Provider',
          aggregateId: created.id,
          actorId: context.user.userId,
          requestId: context.metadata.requestId ?? created.id,
          payload: safeObject({
            providerId: created.id,
            status: created.status,
            type: created.type,
          }),
        });
        return created;
      });
      return this.mapProvider(provider);
    } catch (error: unknown) {
      if (isUnique(error)) {
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.PROVIDER_SLUG_EXISTS,
          'El slug del proveedor ya existe.',
        );
      }
      throw error;
    }
  }

  async list(
    query: ListProvidersQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const where: Prisma.ProviderWhereInput = {
      organizationId: user.organizationId,
      ...(query.archived ? { deletedAt: { not: null } } : { deletedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search.toLowerCase(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.provider.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.provider.count({ where }),
    ]);
    return {
      data: data.map((item) => this.mapProvider(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const provider = await this.prisma.provider.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!provider)
      throw operationsException(
        HttpStatus.NOT_FOUND,
        OPERATIONS_ERROR_CODES.PROVIDER_NOT_FOUND,
        'Proveedor no encontrado.',
      );
    return this.mapProvider(provider);
  }

  async update(
    id: string,
    dto: UpdateProviderDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    assertNoSecrets(dto.metadata);
    const organizationId = context.user.organizationId;
    const current = await this.prisma.provider.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!current)
      throw operationsException(
        HttpStatus.NOT_FOUND,
        OPERATIONS_ERROR_CODES.PROVIDER_NOT_FOUND,
        'Proveedor no encontrado.',
      );
    try {
      const provider = await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.provider.update({
          where: { organizationId_id: { organizationId, id } },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.slug !== undefined ? { slug: slugify(dto.slug) } : {}),
            ...(dto.type !== undefined ? { type: dto.type } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.fulfillmentMode !== undefined ? { fulfillmentMode: dto.fulfillmentMode } : {}),
            ...(dto.apiBaseUrl !== undefined ? { apiBaseUrl: dto.apiBaseUrl?.trim() ?? null } : {}),
            ...(dto.metadata !== undefined ? { metadata: safeObject(dto.metadata) } : {}),
            ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'PROVIDER_UPDATED',
          tableName: 'Provider',
          recordId: id,
          previousValue: safeObject({ status: current.status }),
          newValue: safeObject({ status: updated.status }),
          ip: context.metadata.ipAddress,
          requestId: context.metadata.requestId,
        });
        if (dto.status !== undefined && dto.status !== current.status) {
          await this.outbox.enqueueWithClient(transaction, {
            eventType: 'ProviderStatusChanged',
            organizationId,
            aggregateType: 'Provider',
            aggregateId: id,
            actorId: context.user.userId,
            requestId: context.metadata.requestId ?? id,
            payload: safeObject({ providerId: id, status: dto.status }),
          });
        }
        return updated;
      });
      return this.mapProvider(provider);
    } catch (error: unknown) {
      if (isUnique(error))
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.PROVIDER_SLUG_EXISTS,
          'El slug del proveedor ya existe.',
        );
      throw error;
    }
  }

  async archive(id: string, context: OperationsRequestContext): Promise<void> {
    const organizationId = context.user.organizationId;
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.provider.updateMany({
        where: { id, organizationId, deletedAt: null },
        data: { deletedAt: new Date(), status: ProviderStatus.INACTIVE },
      });
      if (result.count === 0) return;
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'PROVIDER_ARCHIVED',
        tableName: 'Provider',
        recordId: id,
        newValue: safeObject({ status: ProviderStatus.INACTIVE }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'ProviderStatusChanged',
        organizationId,
        aggregateType: 'Provider',
        aggregateId: id,
        actorId: context.user.userId,
        requestId: context.metadata.requestId ?? id,
        payload: safeObject({ providerId: id, status: ProviderStatus.INACTIVE }),
      });
    });
  }

  async restore(id: string, context: OperationsRequestContext): Promise<void> {
    const organizationId = context.user.organizationId;
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.provider.updateMany({
        where: { id, organizationId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (result.count === 0) return;
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'PROVIDER_RESTORED',
        tableName: 'Provider',
        recordId: id,
        newValue: safeObject({ deletedAt: null }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
    });
  }

  async changeStatus(
    id: string,
    dto: ProviderStatusDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    return this.update(id, { status: dto.status }, context);
  }

  async createMapping(
    dto: CreateProviderMappingDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    assertNoSecrets(dto.metadata);
    const organizationId = context.user.organizationId;
    await this.assertMappingRelations(dto, organizationId);
    try {
      const mapping = await this.prisma.providerProductMapping.create({
        data: {
          organizationId,
          providerId: dto.providerId,
          productId: dto.productId,
          planId: dto.planId ?? null,
          variantId: dto.variantId ?? null,
          externalProductId: dto.externalProductId ?? null,
          externalPlanId: dto.externalPlanId ?? null,
          externalVariantId: dto.externalVariantId ?? null,
          mappingKey: mappingKey(dto),
          priority: dto.priority,
          active: dto.active,
          ...(dto.metadata ? { metadata: safeObject(dto.metadata) } : {}),
        },
      });
      await this.audit.record({
        organizationId,
        userId: context.user.userId,
        action: 'PROVIDER_MAPPING_CREATED',
        tableName: 'ProviderProductMapping',
        recordId: mapping.id,
        newValue: safeObject({
          providerId: dto.providerId,
          productId: dto.productId,
          priority: dto.priority,
        }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      return this.mapMapping(mapping);
    } catch (error: unknown) {
      if (isUnique(error))
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.MAPPING_INVALID,
          'El mapping del proveedor ya existe.',
        );
      throw error;
    }
  }

  async listMappings(
    query: ListProviderMappingsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const records = await this.prisma.providerProductMapping.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.providerId ? { providerId: query.providerId } : {}),
        ...(query.active === undefined ? {} : { active: query.active }),
      },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    });
    return { data: records.map((item) => this.mapMapping(item)) };
  }

  async updateMapping(
    id: string,
    dto: UpdateProviderMappingDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    assertNoSecrets(dto.metadata);
    const mapping = await this.prisma.providerProductMapping.findFirst({
      where: { id, organizationId: context.user.organizationId, deletedAt: null },
    });
    if (!mapping)
      throw operationsException(
        HttpStatus.NOT_FOUND,
        OPERATIONS_ERROR_CODES.MAPPING_NOT_FOUND,
        'Mapping no encontrado.',
      );
    const updated = await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.providerProductMapping.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          ...(dto.externalProductId !== undefined
            ? { externalProductId: dto.externalProductId }
            : {}),
          ...(dto.externalPlanId !== undefined ? { externalPlanId: dto.externalPlanId } : {}),
          ...(dto.externalVariantId !== undefined
            ? { externalVariantId: dto.externalVariantId }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.metadata !== undefined ? { metadata: safeObject(dto.metadata) } : {}),
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'PROVIDER_MAPPING_UPDATED',
        tableName: 'ProviderProductMapping',
        recordId: id,
        previousValue: safeObject({ priority: mapping.priority, active: mapping.active }),
        newValue: safeObject({ priority: changed.priority, active: changed.active }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      return changed;
    });
    return this.mapMapping(updated);
  }

  async archiveMapping(id: string, context: OperationsRequestContext): Promise<void> {
    const organizationId = context.user.organizationId;
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.providerProductMapping.updateMany({
        where: { id, organizationId, deletedAt: null },
        data: { deletedAt: new Date(), active: false },
      });
      if (result.count === 0) return;
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'PROVIDER_MAPPING_ARCHIVED',
        tableName: 'ProviderProductMapping',
        recordId: id,
        newValue: safeObject({ active: false }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
    });
  }

  async restoreMapping(id: string, context: OperationsRequestContext): Promise<void> {
    const organizationId = context.user.organizationId;
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.providerProductMapping.updateMany({
        where: { id, organizationId, deletedAt: { not: null } },
        data: { deletedAt: null, active: false },
      });
      if (result.count === 0) return;
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'PROVIDER_MAPPING_RESTORED',
        tableName: 'ProviderProductMapping',
        recordId: id,
        newValue: safeObject({ deletedAt: null, active: false }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
    });
  }

  async resolveMapping(
    organizationId: string,
    productId: string,
    planId: string | null,
    variantId: string | null,
  ): Promise<{ providerId: string } | null> {
    const mapping = await this.prisma.providerProductMapping.findFirst({
      where: {
        organizationId,
        productId,
        planId,
        variantId,
        active: true,
        deletedAt: null,
        provider: { status: ProviderStatus.ACTIVE, deletedAt: null },
      },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
      select: { providerId: true },
    });
    return mapping;
  }

  private async assertMappingRelations(
    dto: CreateProviderMappingDto,
    organizationId: string,
  ): Promise<void> {
    const provider = await this.prisma.provider.findFirst({
      where: { id: dto.providerId, organizationId, deletedAt: null },
    });
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, organizationId, deletedAt: null },
    });
    if (!provider || !product)
      throw operationsException(
        HttpStatus.NOT_FOUND,
        OPERATIONS_ERROR_CODES.MAPPING_INVALID,
        'Las relaciones del mapping no son válidas.',
      );
    if (
      dto.active &&
      (provider.status !== ProviderStatus.ACTIVE || !product.active || product.status !== 'ACTIVE')
    )
      throw operationsException(
        HttpStatus.CONFLICT,
        OPERATIONS_ERROR_CODES.MAPPING_INVALID,
        'Solo productos y proveedores activos pueden tener mappings activos.',
      );
    if (dto.planId) {
      const plan = await this.prisma.productPlan.findFirst({
        where: { id: dto.planId, organizationId, productId: dto.productId, deletedAt: null },
      });
      if (!plan || (dto.active && !plan.active))
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.MAPPING_INVALID,
          'El plan no pertenece al producto o está inactivo.',
        );
    }
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, organizationId, productId: dto.productId, deletedAt: null },
      });
      if (!variant || (dto.active && !variant.active))
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.MAPPING_INVALID,
          'La variante no pertenece al producto o está inactiva.',
        );
    }
  }

  private mapProvider(provider: Record<string, unknown>): Record<string, unknown> {
    return {
      id: provider.id,
      name: provider.name,
      slug: provider.slug,
      type: provider.type,
      status: provider.status,
      fulfillmentMode: provider.fulfillmentMode,
      apiBaseUrl: provider.apiBaseUrl,
      metadata: provider.metadata,
      notes: provider.notes,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private mapMapping(mapping: Record<string, unknown>): Record<string, unknown> {
    return {
      id: mapping.id,
      providerId: mapping.providerId,
      productId: mapping.productId,
      planId: mapping.planId,
      variantId: mapping.variantId,
      externalProductId: mapping.externalProductId,
      externalPlanId: mapping.externalPlanId,
      externalVariantId: mapping.externalVariantId,
      priority: mapping.priority,
      active: mapping.active,
      metadata: mapping.metadata,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    };
  }
}
