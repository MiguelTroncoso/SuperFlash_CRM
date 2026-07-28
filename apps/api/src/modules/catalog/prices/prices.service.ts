import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CatalogAccessPolicy } from '../access/catalog-access.policy';
import { CATALOG_ERROR_CODES, catalogException } from '../catalog.errors';
import {
  CatalogRequestContext,
  decimalString,
  isUniqueConstraint,
  isValidDateRange,
  parseOptionalDate,
} from '../catalog.types';
import { CreatePriceEntryDto, UpdatePriceEntryDto } from '../dto/catalog.dto';

interface PriceEntryValues {
  salePrice: Prisma.Decimal;
  costPrice: Prisma.Decimal | null;
  minimumPrice: Prisma.Decimal | null;
  taxIncluded: boolean;
  active: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
}

@Injectable()
export class PricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: CatalogAccessPolicy,
  ) {}

  async create(
    priceBookId: string,
    dto: CreatePriceEntryDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertPricesManage(context.user);
    const organizationId = context.user.organizationId;
    await this.assertPriceBook(organizationId, priceBookId);
    const relation = await this.assertRelations(
      organizationId,
      dto.productId,
      dto.planId,
      dto.variantId,
    );
    const values = this.values(dto);
    this.validateValues(values);
    try {
      const entry = await this.prisma.$transaction(async (transaction) => {
        await this.lockEntryCombination(
          transaction,
          organizationId,
          priceBookId,
          dto.productId,
          relation.planId,
          relation.variantId,
          values.validFrom,
          values.validUntil,
        );
        await this.assertDuplicate(
          transaction,
          organizationId,
          priceBookId,
          dto.productId,
          relation.planId,
          relation.variantId,
          values.validFrom,
          values.validUntil,
        );
        const created = await transaction.priceBookEntry.create({
          data: {
            organizationId,
            priceBookId,
            productId: dto.productId,
            planId: relation.planId,
            variantId: relation.variantId,
            salePrice: values.salePrice,
            costPrice: values.costPrice,
            minimumPrice: values.minimumPrice,
            taxIncluded: values.taxIncluded,
            active: values.active,
            validFrom: values.validFrom,
            validUntil: values.validUntil,
          },
        });
        await this.createHistory(
          transaction,
          organizationId,
          created.id,
          context.user.userId,
          null,
          created,
          dto.reason,
        );
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'CATALOG_PRICE_ENTRY_CREATED',
          tableName: 'PriceBookEntry',
          recordId: created.id,
          newValue: {
            productId: created.productId,
            planId: created.planId,
            variantId: created.variantId,
            salePrice: created.salePrice.toFixed(2),
          },
          ip: context.metadata.ipAddress,
        });
        return created;
      });
      return this.map(entry, context.user.permissions.includes('catalog.costs.read'));
    } catch (error: unknown) {
      if (isUniqueConstraint(error))
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.PRICE_ENTRY_DUPLICATE,
          'Ya existe un precio activo para esa combinación.',
        );
      throw error;
    }
  }

  async list(
    priceBookId: string,
    includeCosts: boolean | undefined,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>[]> {
    this.access.assertPricesRead(user);
    if (includeCosts) this.access.assertCostsRead(user);
    await this.assertPriceBook(user.organizationId, priceBookId);
    const entries = await this.prisma.priceBookEntry.findMany({
      where: { organizationId: user.organizationId, priceBookId, deletedAt: null },
      orderBy: [{ productId: 'asc' }, { createdAt: 'asc' }],
    });
    return entries.map((entry) =>
      this.map(entry, Boolean(includeCosts && user.permissions.includes('catalog.costs.read'))),
    );
  }

  async findOne(
    priceBookId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.access.assertPricesRead(user);
    await this.assertPriceBook(user.organizationId, priceBookId);
    const entry = await this.prisma.priceBookEntry.findFirst({
      where: { id, priceBookId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!entry) this.notFound();
    return this.map(entry, user.permissions.includes('catalog.costs.read'));
  }

  async update(
    priceBookId: string,
    id: string,
    dto: UpdatePriceEntryDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertPricesManage(context.user);
    await this.assertPriceBook(context.user.organizationId, priceBookId);
    const current = await this.prisma.priceBookEntry.findFirst({
      where: { id, priceBookId, organizationId: context.user.organizationId, deletedAt: null },
    });
    if (!current) this.notFound();
    const values = this.values(dto, current);
    this.validateValues(values);
    const priceChanged =
      !values.salePrice.equals(current.salePrice) ||
      !this.equalsNullable(values.costPrice, current.costPrice) ||
      !this.equalsNullable(values.minimumPrice, current.minimumPrice);
    try {
      const entry = await this.prisma.$transaction(async (transaction) => {
        await this.lockEntryCombination(
          transaction,
          context.user.organizationId,
          priceBookId,
          current.productId,
          current.planId,
          current.variantId,
          values.validFrom,
          values.validUntil,
        );
        if (values.active)
          await this.assertDuplicate(
            transaction,
            context.user.organizationId,
            priceBookId,
            current.productId,
            current.planId,
            current.variantId,
            values.validFrom,
            values.validUntil,
            id,
          );
        const updated = await transaction.priceBookEntry.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: {
            salePrice: values.salePrice,
            costPrice: values.costPrice,
            minimumPrice: values.minimumPrice,
            taxIncluded: values.taxIncluded,
            active: values.active,
            validFrom: values.validFrom,
            validUntil: values.validUntil,
          },
        });
        if (priceChanged)
          await this.createHistory(
            transaction,
            context.user.organizationId,
            id,
            context.user.userId,
            current,
            updated,
            dto.reason,
          );
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'CATALOG_PRICE_ENTRY_UPDATED',
          tableName: 'PriceBookEntry',
          recordId: id,
          previousValue: { salePrice: current.salePrice.toFixed(2) },
          newValue: { salePrice: updated.salePrice.toFixed(2), priceChanged },
          ip: context.metadata.ipAddress,
        });
        return updated;
      });
      return this.map(entry, context.user.permissions.includes('catalog.costs.read'));
    } catch (error: unknown) {
      if (isUniqueConstraint(error))
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.PRICE_ENTRY_DUPLICATE,
          'Ya existe un precio activo para esa combinación.',
        );
      throw error;
    }
  }

  async archive(
    priceBookId: string,
    id: string,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    return this.setArchived(priceBookId, id, true, context);
  }
  async restore(
    priceBookId: string,
    id: string,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    return this.setArchived(priceBookId, id, false, context);
  }

  async history(
    priceBookId: string,
    id: string,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>[]> {
    this.access.assertPricesRead(user);
    await this.assertPriceBook(user.organizationId, priceBookId);
    const entry = await this.prisma.priceBookEntry.findFirst({
      where: { organizationId: user.organizationId, priceBookId, id },
      select: { id: true },
    });
    if (!entry) this.notFound();
    const history = await this.prisma.priceHistory.findMany({
      where: { organizationId: user.organizationId, priceBookEntryId: id },
      orderBy: { changedAt: 'desc' },
      include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    return history.map((record) => ({
      id: record.id,
      changedBy: record.changedBy,
      previousSalePrice: decimalString(record.previousSalePrice),
      newSalePrice: decimalString(record.newSalePrice),
      ...(user.permissions.includes('catalog.costs.read')
        ? {
            previousCostPrice: decimalString(record.previousCostPrice),
            newCostPrice: decimalString(record.newCostPrice),
            previousMinimumPrice: decimalString(record.previousMinimumPrice),
            newMinimumPrice: decimalString(record.newMinimumPrice),
          }
        : {}),
      reason: record.reason,
      changedAt: record.changedAt,
    }));
  }

  private async setArchived(
    priceBookId: string,
    id: string,
    archived: boolean,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertPricesManage(context.user);
    await this.assertPriceBook(context.user.organizationId, priceBookId);
    const current = await this.prisma.priceBookEntry.findFirst({
      where: { id, priceBookId, organizationId: context.user.organizationId },
    });
    if (!current) this.notFound();
    if (Boolean(current.deletedAt) === archived)
      return this.map(current, context.user.permissions.includes('catalog.costs.read'));
    try {
      const entry = await this.prisma.$transaction(async (transaction) => {
        await this.lockEntryCombination(
          transaction,
          context.user.organizationId,
          priceBookId,
          current.productId,
          current.planId,
          current.variantId,
          current.validFrom,
          current.validUntil,
        );
        if (!archived && current.active)
          await this.assertDuplicate(
            transaction,
            context.user.organizationId,
            priceBookId,
            current.productId,
            current.planId,
            current.variantId,
            current.validFrom,
            current.validUntil,
            id,
          );
        const updated = await transaction.priceBookEntry.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: {
            deletedAt: archived ? new Date() : null,
            active: archived ? false : current.active,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: archived ? 'CATALOG_PRICE_ENTRY_ARCHIVED' : 'CATALOG_PRICE_ENTRY_RESTORED',
          tableName: 'PriceBookEntry',
          recordId: id,
          newValue: { archived },
          ip: context.metadata.ipAddress,
        });
        return updated;
      });
      return this.map(entry, context.user.permissions.includes('catalog.costs.read'));
    } catch (error: unknown) {
      if (isUniqueConstraint(error))
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.PRICE_ENTRY_DUPLICATE,
          'Ya existe un precio activo para esa combinación y vigencia.',
        );
      throw error;
    }
  }

  private async assertPriceBook(organizationId: string, id: string): Promise<void> {
    const book = await this.prisma.priceBook.findFirst({
      where: { id, organizationId, deletedAt: null, archivedAt: null },
      select: { id: true },
    });
    if (!book)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PRICE_BOOK_NOT_FOUND,
        'El price book no existe o está archivado.',
      );
  }

  private async assertRelations(
    organizationId: string,
    productId: string,
    planId?: string,
    variantId?: string,
  ): Promise<{ planId: string | null; variantId: string | null }> {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!product)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
        'El producto no existe en la organización.',
      );
    let resolvedPlanId = planId ?? null;
    let variantPlanId: string | null = null;
    if (planId) {
      const plan = await this.prisma.productPlan.findFirst({
        where: { id: planId, productId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!plan)
        throw catalogException(
          HttpStatus.NOT_FOUND,
          CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
          'El plan no pertenece al producto.',
        );
    }
    if (variantId) {
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: variantId, productId, organizationId, deletedAt: null },
        select: { id: true, planId: true },
      });
      if (!variant)
        throw catalogException(
          HttpStatus.NOT_FOUND,
          CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
          'La variante no pertenece al producto.',
        );
      variantPlanId = variant.planId;
      if (variantPlanId && !resolvedPlanId)
        throw catalogException(
          HttpStatus.NOT_FOUND,
          CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
          'La variante requiere un plan asociado.',
        );
      if (resolvedPlanId && variantPlanId && resolvedPlanId !== variantPlanId)
        throw catalogException(
          HttpStatus.BAD_REQUEST,
          CATALOG_ERROR_CODES.PRICE_RELATION_NOT_FOUND,
          'La variante y el plan no coinciden.',
        );
      resolvedPlanId = resolvedPlanId ?? variantPlanId;
    }
    return { planId: resolvedPlanId, variantId: variantId ?? null };
  }

  private async assertDuplicate(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    priceBookId: string,
    productId: string,
    planId: string | null,
    variantId: string | null,
    validFrom: Date | null,
    validUntil: Date | null,
    excludedId?: string,
  ): Promise<void> {
    const found = await transaction.priceBookEntry.findFirst({
      where: {
        organizationId,
        priceBookId,
        productId,
        planId,
        variantId,
        validFrom,
        validUntil,
        active: true,
        deletedAt: null,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });
    if (found)
      throw catalogException(
        HttpStatus.CONFLICT,
        CATALOG_ERROR_CODES.PRICE_ENTRY_DUPLICATE,
        'Ya existe un precio activo para esa combinación.',
      );
  }

  private async lockEntryCombination(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    priceBookId: string,
    productId: string,
    planId: string | null,
    variantId: string | null,
    validFrom: Date | null,
    validUntil: Date | null,
  ): Promise<void> {
    const lockKey = [
      organizationId,
      priceBookId,
      productId,
      planId ?? '<null>',
      variantId ?? '<null>',
      validFrom?.toISOString() ?? '<null>',
      validUntil?.toISOString() ?? '<null>',
    ].join(':');
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext('superflash:catalog-price-entry'),
        hashtext(${lockKey})
      )
    `;
  }

  private values(
    dto: CreatePriceEntryDto | UpdatePriceEntryDto,
    current?: {
      salePrice: Prisma.Decimal;
      costPrice: Prisma.Decimal | null;
      minimumPrice: Prisma.Decimal | null;
      taxIncluded: boolean;
      active: boolean;
      validFrom: Date | null;
      validUntil: Date | null;
    },
  ): PriceEntryValues {
    return {
      salePrice: new Prisma.Decimal(dto.salePrice ?? current?.salePrice ?? 0),
      costPrice:
        dto.costPrice === undefined
          ? (current?.costPrice ?? null)
          : dto.costPrice === null
            ? null
            : new Prisma.Decimal(dto.costPrice),
      minimumPrice:
        dto.minimumPrice === undefined
          ? (current?.minimumPrice ?? null)
          : dto.minimumPrice === null
            ? null
            : new Prisma.Decimal(dto.minimumPrice),
      taxIncluded: dto.taxIncluded ?? current?.taxIncluded ?? false,
      active: dto.active ?? current?.active ?? true,
      validFrom:
        dto.validFrom === undefined
          ? (current?.validFrom ?? null)
          : parseOptionalDate(dto.validFrom),
      validUntil:
        dto.validUntil === undefined
          ? (current?.validUntil ?? null)
          : parseOptionalDate(dto.validUntil),
    };
  }

  private validateValues(values: PriceEntryValues): void {
    if (
      values.salePrice.isNegative() ||
      (values.costPrice?.isNegative() ?? false) ||
      (values.minimumPrice?.isNegative() ?? false) ||
      (values.minimumPrice && values.minimumPrice.greaterThan(values.salePrice)) ||
      !isValidDateRange(values.validFrom, values.validUntil)
    )
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.PRICE_INVALID,
        'Los precios o la vigencia son inválidos.',
      );
  }

  private async createHistory(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    entryId: string,
    userId: string,
    previous: {
      salePrice: Prisma.Decimal;
      costPrice: Prisma.Decimal | null;
      minimumPrice: Prisma.Decimal | null;
    } | null,
    current: {
      salePrice: Prisma.Decimal;
      costPrice: Prisma.Decimal | null;
      minimumPrice: Prisma.Decimal | null;
    },
    reason?: string,
  ): Promise<void> {
    await transaction.priceHistory.create({
      data: {
        organizationId,
        priceBookEntryId: entryId,
        changedByUserId: userId,
        previousSalePrice: previous?.salePrice ?? null,
        newSalePrice: current.salePrice,
        previousCostPrice: previous?.costPrice ?? null,
        newCostPrice: current.costPrice,
        previousMinimumPrice: previous?.minimumPrice ?? null,
        newMinimumPrice: current.minimumPrice,
        reason: reason?.trim() || null,
      },
    });
  }

  private equalsNullable(first: Prisma.Decimal | null, second: Prisma.Decimal | null): boolean {
    return first === null && second === null
      ? true
      : first !== null && second !== null && first.equals(second);
  }

  private map(
    entry: {
      id: string;
      priceBookId: string;
      productId: string;
      planId: string | null;
      variantId: string | null;
      salePrice: Prisma.Decimal;
      costPrice: Prisma.Decimal | null;
      minimumPrice: Prisma.Decimal | null;
      taxIncluded: boolean;
      active: boolean;
      validFrom: Date | null;
      validUntil: Date | null;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
    },
    includeCosts: boolean,
  ): Record<string, unknown> {
    return {
      id: entry.id,
      priceBookId: entry.priceBookId,
      productId: entry.productId,
      planId: entry.planId,
      variantId: entry.variantId,
      salePrice: entry.salePrice.toFixed(2),
      ...(includeCosts
        ? {
            costPrice: decimalString(entry.costPrice),
            minimumPrice: decimalString(entry.minimumPrice),
          }
        : {}),
      taxIncluded: entry.taxIncluded,
      active: entry.active,
      validFrom: entry.validFrom,
      validUntil: entry.validUntil,
      archivedAt: entry.deletedAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  private notFound(): never {
    throw catalogException(
      HttpStatus.NOT_FOUND,
      CATALOG_ERROR_CODES.PRICE_ENTRY_NOT_FOUND,
      'La entrada de precio no existe.',
    );
  }
}
