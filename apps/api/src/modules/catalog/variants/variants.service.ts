import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CatalogAccessPolicy } from '../access/catalog-access.policy';
import { CATALOG_ERROR_CODES, catalogException } from '../catalog.errors';
import {
  CatalogRequestContext,
  isUniqueConstraint,
  isJsonObject,
  normalizeCode,
  normalizeName,
  toSafeJson,
} from '../catalog.types';
import { CreateVariantDto, ReorderDto, UpdateVariantDto } from '../dto/catalog.dto';

@Injectable()
export class VariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: CatalogAccessPolicy,
  ) {}

  async create(
    productId: string,
    dto: CreateVariantDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    await this.assertProduct(context.user.organizationId, productId);
    const planId = dto.planId ?? null;
    if (planId) await this.assertPlan(context.user.organizationId, productId, planId);
    this.assertAttributes(dto.attributes);
    const code = normalizeCode(dto.code);
    if (code) await this.assertCode(context.user.organizationId, productId, code);
    const order =
      dto.order ??
      ((
        await this.prisma.productVariant.aggregate({
          where: { organizationId: context.user.organizationId, productId },
          _max: { order: true },
        })
      )._max.order ?? 0) + 1;
    try {
      const variant = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.productVariant.create({
          data: {
            organizationId: context.user.organizationId,
            productId,
            planId,
            name: normalizeName(dto.name),
            code,
            attributes: toSafeJson(dto.attributes),
            active: dto.active ?? true,
            order,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'CATALOG_VARIANT_CREATED',
          tableName: 'ProductVariant',
          recordId: created.id,
          newValue: { productId, planId, name: created.name, code: created.code },
          ip: context.metadata.ipAddress,
        });
        return created;
      });
      return this.map(variant);
    } catch (error: unknown) {
      if (isUniqueConstraint(error))
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.VARIANT_CODE_ALREADY_EXISTS,
          'Ya existe una variante con ese código.',
        );
      throw error;
    }
  }

  async list(productId: string, user: AuthenticatedUser): Promise<Record<string, unknown>[]> {
    this.access.assertRead(user);
    await this.assertProduct(user.organizationId, productId);
    const variants = await this.prisma.productVariant.findMany({
      where: { organizationId: user.organizationId, productId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return variants.map((variant) => this.map(variant));
  }

  async findOne(
    productId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    await this.assertProduct(user.organizationId, productId);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, productId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!variant) this.notFound();
    return this.map(variant);
  }

  async update(
    productId: string,
    id: string,
    dto: UpdateVariantDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertUpdate(context.user);
    await this.assertProduct(context.user.organizationId, productId);
    const current = await this.prisma.productVariant.findFirst({
      where: { id, productId, organizationId: context.user.organizationId, deletedAt: null },
    });
    if (!current) this.notFound();
    const code = dto.code === undefined ? undefined : normalizeCode(dto.code);
    if (code && code !== current.code)
      await this.assertCode(context.user.organizationId, productId, code, id);
    if (dto.planId !== undefined && dto.planId !== null)
      await this.assertPlan(context.user.organizationId, productId, dto.planId);
    if (dto.attributes !== undefined) this.assertAttributes(dto.attributes);
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.productVariant.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: {
            ...(dto.name !== undefined ? { name: normalizeName(dto.name) } : {}),
            ...(code !== undefined ? { code } : {}),
            ...(dto.planId !== undefined ? { planId: dto.planId } : {}),
            ...(dto.attributes !== undefined ? { attributes: toSafeJson(dto.attributes) } : {}),
            ...(dto.active !== undefined ? { active: dto.active } : {}),
            ...(dto.order !== undefined ? { order: dto.order } : {}),
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'CATALOG_VARIANT_UPDATED',
          tableName: 'ProductVariant',
          recordId: id,
          previousValue: { name: current.name, code: current.code, planId: current.planId },
          newValue: { name: record.name, code: record.code, planId: record.planId },
          ip: context.metadata.ipAddress,
        });
        return record;
      });
      return this.map(updated);
    } catch (error: unknown) {
      if (isUniqueConstraint(error))
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.VARIANT_CODE_ALREADY_EXISTS,
          'Ya existe una variante con ese código.',
        );
      throw error;
    }
  }

  archive(
    productId: string,
    id: string,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertDelete(context.user);
    return this.setArchived(productId, id, true, context);
  }
  restore(
    productId: string,
    id: string,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertDelete(context.user);
    return this.setArchived(productId, id, false, context);
  }

  async reorder(
    productId: string,
    id: string,
    dto: ReorderDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>[]> {
    this.access.assertUpdate(context.user);
    const organizationId = context.user.organizationId;
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('superflash:product-variants-order'), hashtext(${organizationId || productId}))
      `;
      const current = await transaction.productVariant.findFirst({
        where: { id, productId, organizationId, deletedAt: null },
      });
      if (!current) this.notFound();
      const records = await transaction.productVariant.findMany({
        where: { organizationId, productId, deletedAt: null, active: true },
        orderBy: { order: 'asc' },
      });
      const remaining = records.filter((record) => record.id !== id);
      const target = Math.min(Math.max(dto.order, 1), remaining.length + 1) - 1;
      remaining.splice(target, 0, current);
      for (const [index, record] of remaining.entries())
        await transaction.productVariant.update({
          where: { organizationId_id: { organizationId, id: record.id } },
          data: { order: index + 1 },
        });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'CATALOG_VARIANT_REORDERED',
        tableName: 'ProductVariant',
        recordId: id,
        newValue: { order: target + 1 },
        ip: context.metadata.ipAddress,
      });
      return remaining.map((record, index) => this.map({ ...record, order: index + 1 }));
    });
  }

  private async setArchived(
    productId: string,
    id: string,
    archived: boolean,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    const current = await this.prisma.productVariant.findFirst({
      where: { id, productId, organizationId: context.user.organizationId },
    });
    if (!current) this.notFound();
    if (Boolean(current.deletedAt) === archived) return this.map(current);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.productVariant.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          deletedAt: archived ? new Date() : null,
          active: archived ? false : current.active,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: archived ? 'CATALOG_VARIANT_ARCHIVED' : 'CATALOG_VARIANT_RESTORED',
        tableName: 'ProductVariant',
        recordId: id,
        newValue: { archived },
        ip: context.metadata.ipAddress,
      });
      return record;
    });
    return this.map(updated);
  }

  private async assertProduct(organizationId: string, id: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!product)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PRODUCT_NOT_FOUND,
        'El producto no existe.',
      );
  }

  private async assertPlan(organizationId: string, productId: string, id: string): Promise<void> {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id, productId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!plan)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
        'El plan no existe para este producto.',
      );
  }

  private async assertCode(
    organizationId: string,
    productId: string,
    code: string,
    excludedId?: string,
  ): Promise<void> {
    const found = await this.prisma.productVariant.findFirst({
      where: {
        organizationId,
        productId,
        code,
        active: true,
        deletedAt: null,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });
    if (found)
      throw catalogException(
        HttpStatus.CONFLICT,
        CATALOG_ERROR_CODES.VARIANT_CODE_ALREADY_EXISTS,
        'Ya existe una variante con ese código.',
      );
  }

  private assertAttributes(value: Record<string, unknown>): void {
    if (!isJsonObject(value))
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.INVALID_ATTRIBUTES,
        'attributes debe ser un objeto JSON raíz.',
      );
    try {
      toSafeJson(value);
    } catch {
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.INVALID_ATTRIBUTES,
        'attributes debe ser un objeto JSON sin secretos.',
      );
    }
  }

  private map(variant: {
    id: string;
    productId: string;
    planId: string | null;
    name: string;
    code: string | null;
    attributes: Prisma.JsonValue;
    active: boolean;
    order: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): Record<string, unknown> {
    return {
      id: variant.id,
      productId: variant.productId,
      planId: variant.planId,
      name: variant.name,
      code: variant.code,
      attributes: variant.attributes,
      active: variant.active,
      order: variant.order,
      archivedAt: variant.deletedAt,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    };
  }

  private notFound(): never {
    throw catalogException(
      HttpStatus.NOT_FOUND,
      CATALOG_ERROR_CODES.VARIANT_NOT_FOUND,
      'La variante no existe.',
    );
  }
}
