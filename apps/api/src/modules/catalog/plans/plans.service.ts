import { HttpStatus, Injectable } from '@nestjs/common';
import { BillingPeriodUnit, CustomerSegment, Prisma, ProductType } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CatalogAccessPolicy } from '../access/catalog-access.policy';
import { CATALOG_ERROR_CODES, catalogException } from '../catalog.errors';
import {
  CatalogRequestContext,
  isUniqueConstraint,
  normalizeCode,
  normalizeName,
  toSafeJson,
} from '../catalog.types';
import { CreatePlanDto, ReorderDto, UpdatePlanDto } from '../dto/catalog.dto';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: CatalogAccessPolicy,
  ) {}

  async create(
    productId: string,
    dto: CreatePlanDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    const product = await this.product(context.user.organizationId, productId);
    this.validatePlan(product.type, dto);
    const code = normalizeCode(dto.code);
    if (code) await this.assertCode(context.user.organizationId, productId, code);
    const order =
      dto.order ??
      ((
        await this.prisma.productPlan.aggregate({
          where: { organizationId: context.user.organizationId, productId },
          _max: { order: true },
        })
      )._max.order ?? 0) + 1;
    try {
      const plan = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.productPlan.create({
          data: {
            organizationId: context.user.organizationId,
            productId,
            name: normalizeName(dto.name),
            code,
            description: dto.description?.trim() || null,
            customerSegment: dto.customerSegment,
            billingPeriodUnit: dto.billingPeriodUnit,
            billingPeriodCount: dto.billingPeriodCount ?? 1,
            ...(dto.quantity !== undefined ? { quantity: new Prisma.Decimal(dto.quantity) } : {}),
            ...(dto.deviceLimit !== undefined ? { deviceLimit: dto.deviceLimit } : {}),
            ...(dto.creditAmount !== undefined
              ? { creditAmount: new Prisma.Decimal(dto.creditAmount) }
              : {}),
            active: dto.active ?? true,
            order,
            ...(dto.metadata !== undefined ? { metadata: toSafeJson(dto.metadata) } : {}),
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'CATALOG_PLAN_CREATED',
          tableName: 'ProductPlan',
          recordId: created.id,
          newValue: { productId, name: created.name, code: created.code },
          ip: context.metadata.ipAddress,
        });
        return created;
      });
      return this.map(plan);
    } catch (error: unknown) {
      if (isUniqueConstraint(error)) {
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.PLAN_CODE_ALREADY_EXISTS,
          'Ya existe un plan con ese código.',
        );
      }
      throw error;
    }
  }

  async list(productId: string, user: AuthenticatedUser): Promise<Record<string, unknown>[]> {
    this.access.assertRead(user);
    await this.product(user.organizationId, productId);
    const plans = await this.prisma.productPlan.findMany({
      where: { organizationId: user.organizationId, productId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return plans.map((plan) => this.map(plan));
  }

  async findOne(
    productId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    await this.product(user.organizationId, productId);
    const plan = await this.prisma.productPlan.findFirst({
      where: { id, productId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!plan) this.notFound();
    return this.map(plan);
  }

  async update(
    productId: string,
    id: string,
    dto: UpdatePlanDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertUpdate(context.user);
    const product = await this.product(context.user.organizationId, productId);
    const current = await this.prisma.productPlan.findFirst({
      where: { id, productId, organizationId: context.user.organizationId, deletedAt: null },
    });
    if (!current) this.notFound();
    const code = dto.code === undefined ? undefined : normalizeCode(dto.code);
    if (code && code !== current.code)
      await this.assertCode(context.user.organizationId, productId, code, id);
    const candidate = {
      ...current,
      customerSegment: dto.customerSegment ?? current.customerSegment,
      billingPeriodUnit: dto.billingPeriodUnit ?? current.billingPeriodUnit,
      creditAmount:
        dto.creditAmount === undefined
          ? current.creditAmount
          : new Prisma.Decimal(dto.creditAmount),
    };
    this.validatePlan(product.type, candidate);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.productPlan.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          ...(dto.name !== undefined ? { name: normalizeName(dto.name) } : {}),
          ...(code !== undefined ? { code } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(dto.customerSegment !== undefined ? { customerSegment: dto.customerSegment } : {}),
          ...(dto.billingPeriodUnit !== undefined
            ? { billingPeriodUnit: dto.billingPeriodUnit }
            : {}),
          ...(dto.billingPeriodCount !== undefined
            ? { billingPeriodCount: dto.billingPeriodCount }
            : {}),
          ...(dto.quantity !== undefined ? { quantity: new Prisma.Decimal(dto.quantity) } : {}),
          ...(dto.deviceLimit !== undefined ? { deviceLimit: dto.deviceLimit } : {}),
          ...(dto.creditAmount !== undefined
            ? { creditAmount: new Prisma.Decimal(dto.creditAmount) }
            : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.order !== undefined ? { order: dto.order } : {}),
          ...(dto.metadata !== undefined ? { metadata: toSafeJson(dto.metadata) } : {}),
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CATALOG_PLAN_UPDATED',
        tableName: 'ProductPlan',
        recordId: id,
        previousValue: { name: current.name, code: current.code },
        newValue: { name: record.name, code: record.code },
        ip: context.metadata.ipAddress,
      });
      return record;
    });
    return this.map(updated);
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
        SELECT pg_advisory_xact_lock(hashtext('superflash:product-plans-order'), hashtext(${organizationId || productId}))
      `;
      const current = await transaction.productPlan.findFirst({
        where: { id, productId, organizationId, deletedAt: null },
      });
      if (!current) this.notFound();
      const records = await transaction.productPlan.findMany({
        where: { organizationId, productId, deletedAt: null, active: true },
        orderBy: { order: 'asc' },
      });
      const remaining = records.filter((record) => record.id !== id);
      const target = Math.min(Math.max(dto.order, 1), remaining.length + 1) - 1;
      remaining.splice(target, 0, current);
      for (const [index, record] of remaining.entries()) {
        await transaction.productPlan.update({
          where: { organizationId_id: { organizationId, id: record.id } },
          data: { order: index + 1 },
        });
      }
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'CATALOG_PLAN_REORDERED',
        tableName: 'ProductPlan',
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
    const current = await this.prisma.productPlan.findFirst({
      where: { id, productId, organizationId: context.user.organizationId },
    });
    if (!current) this.notFound();
    if (Boolean(current.deletedAt) === archived) return this.map(current);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.productPlan.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          deletedAt: archived ? new Date() : null,
          active: archived ? false : current.active,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: archived ? 'CATALOG_PLAN_ARCHIVED' : 'CATALOG_PLAN_RESTORED',
        tableName: 'ProductPlan',
        recordId: id,
        newValue: { archived },
        ip: context.metadata.ipAddress,
      });
      return record;
    });
    return this.map(updated);
  }

  private async product(
    organizationId: string,
    id: string,
  ): Promise<{ id: string; type: ProductType }> {
    const product = await this.prisma.product.findFirst({
      where: { organizationId, id, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!product)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PRODUCT_NOT_FOUND,
        'El producto no existe.',
      );
    return product;
  }

  private async assertCode(
    organizationId: string,
    productId: string,
    code: string,
    excludedId?: string,
  ): Promise<void> {
    const found = await this.prisma.productPlan.findFirst({
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
        CATALOG_ERROR_CODES.PLAN_CODE_ALREADY_EXISTS,
        'Ya existe un plan con ese código.',
      );
  }

  private validatePlan(
    type: ProductType,
    dto: {
      billingPeriodUnit: BillingPeriodUnit;
      creditAmount?: string | Prisma.Decimal | null;
      billingPeriodCount?: number;
    },
  ): void {
    if (
      dto.billingPeriodCount !== undefined &&
      (dto.billingPeriodCount < 1 || dto.billingPeriodCount > 120)
    )
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.INVALID_ORDER,
        'El período de facturación debe estar entre 1 y 120.',
      );
    if (type === ProductType.CREDIT_PACKAGE && dto.creditAmount === undefined)
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.PRICE_INVALID,
        'Un paquete de créditos debe definir creditAmount.',
      );
    if (
      type !== ProductType.CREDIT_PACKAGE &&
      dto.creditAmount !== undefined &&
      dto.creditAmount !== null &&
      new Prisma.Decimal(dto.creditAmount).greaterThan(0)
    )
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.PRICE_INVALID,
        'Solo los paquetes de créditos pueden definir creditAmount.',
      );
    if (
      dto.billingPeriodUnit === BillingPeriodUnit.ONE_TIME &&
      dto.billingPeriodCount !== undefined &&
      dto.billingPeriodCount !== 1
    )
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.INVALID_ORDER,
        'ONE_TIME debe tener billingPeriodCount igual a 1.',
      );
  }

  private map(plan: {
    id: string;
    productId: string;
    name: string;
    code: string | null;
    description: string | null;
    customerSegment: CustomerSegment;
    billingPeriodUnit: BillingPeriodUnit;
    billingPeriodCount: number;
    quantity: Prisma.Decimal | null;
    deviceLimit: number | null;
    creditAmount: Prisma.Decimal | null;
    active: boolean;
    order: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): Record<string, unknown> {
    return {
      id: plan.id,
      productId: plan.productId,
      name: plan.name,
      code: plan.code,
      description: plan.description,
      customerSegment: plan.customerSegment,
      billingPeriodUnit: plan.billingPeriodUnit,
      billingPeriodCount: plan.billingPeriodCount,
      quantity: plan.quantity?.toFixed(3) ?? null,
      deviceLimit: plan.deviceLimit,
      creditAmount: plan.creditAmount?.toFixed(3) ?? null,
      active: plan.active,
      order: plan.order,
      archivedAt: plan.deletedAt,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private notFound(): never {
    throw catalogException(
      HttpStatus.NOT_FOUND,
      CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
      'El plan no existe.',
    );
  }
}
