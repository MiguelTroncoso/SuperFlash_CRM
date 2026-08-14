import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';

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
  normalizeSlug,
  toSafeJson,
} from '../catalog.types';
import {
  AdjustStockDto,
  CreateProductDto,
  ProductListQueryDto,
  StockMovementListQueryDto,
  UpdateProductDto,
} from '../dto/catalog.dto';

const productInclude = Prisma.validator<Prisma.ProductInclude>()({
  productCategory: { select: { id: true, name: true, slug: true, active: true } },
  plans: {
    where: { deletedAt: null },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      code: true,
      customerSegment: true,
      billingPeriodUnit: true,
      billingPeriodCount: true,
      quantity: true,
      deviceLimit: true,
      creditAmount: true,
      active: true,
      order: true,
    },
  },
  variants: {
    where: { deletedAt: null },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      code: true,
      planId: true,
      attributes: true,
      active: true,
      order: true,
    },
  },
});

type ProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: CatalogAccessPolicy,
  ) {}

  async create(
    dto: CreateProductDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    return this.createRecord(dto, context);
  }

  async createQuick(
    dto: CreateProductDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertQuickCreate(context.user);
    return this.createRecord(dto, context);
  }

  private async createRecord(
    dto: CreateProductDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    const organizationId = context.user.organizationId;
    const name = normalizeName(dto.name);
    const slug = normalizeSlug(dto.slug ?? name);
    const sku = normalizeCode(dto.sku);
    this.assertDemo(dto.allowsDemo ?? false, dto.demoDurationHours);
    if (dto.metadata !== undefined) this.assertMetadata(dto.metadata);
    if (dto.categoryId) await this.assertCategory(organizationId, dto.categoryId);
    await this.assertProductUnique(organizationId, slug, sku);

    const status = dto.status ?? (dto.active ? ProductStatus.ACTIVE : ProductStatus.DRAFT);
    const active = dto.active ?? status === ProductStatus.ACTIVE;
    try {
      const product = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.product.create({
          data: {
            organizationId,
            categoryId: dto.categoryId ?? null,
            name,
            slug,
            sku,
            description: dto.description?.trim() || null,
            currency: dto.currency?.trim().toUpperCase() ?? 'USD',
            imageUrl: dto.imageUrl?.trim() || null,
            type: dto.type,
            fulfillmentMode: dto.fulfillmentMode,
            status,
            active,
            requiresSubscription: dto.requiresSubscription ?? false,
            allowsDemo: dto.allowsDemo ?? false,
            demoDurationHours: dto.allowsDemo ? (dto.demoDurationHours ?? null) : null,
            requiresCustomerEmail: dto.requiresCustomerEmail ?? false,
            requiresCustomerPhone: dto.requiresCustomerPhone ?? false,
            requiresManualReview: dto.requiresManualReview ?? false,
            publicVisible: dto.publicVisible ?? false,
            displayOrder: dto.displayOrder ?? 0,
            stockTrackingEnabled: dto.stockTrackingEnabled ?? false,
            stockQuantity: dto.stockQuantity ?? 0,
            stockMinimum: dto.stockMinimum ?? 0,
            ...(dto.metadata !== undefined ? { metadata: toSafeJson(dto.metadata) } : {}),
          },
          include: productInclude,
        });
        if (created.stockQuantity > 0) {
          await transaction.productStockMovement.create({
            data: {
              organizationId,
              productId: created.id,
              userId: context.user.userId,
              quantityBefore: 0,
              quantityDelta: created.stockQuantity,
              quantityAfter: created.stockQuantity,
              movementType: 'ENTRY',
              reason: 'Stock inicial',
            },
          });
        }
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'CATALOG_PRODUCT_CREATED',
          tableName: 'Product',
          recordId: created.id,
          newValue: { name, slug, sku, type: created.type, status: created.status },
          ip: context.metadata.ipAddress,
        });
        return created;
      });
      return this.map(product);
    } catch (error: unknown) {
      if (isUniqueConstraint(error)) {
        throw catalogException(
          HttpStatus.CONFLICT,
          sku
            ? CATALOG_ERROR_CODES.PRODUCT_SKU_ALREADY_EXISTS
            : CATALOG_ERROR_CODES.PRODUCT_SLUG_ALREADY_EXISTS,
          'El producto ya existe con ese identificador.',
        );
      }
      throw error;
    }
  }

  async list(
    query: ProductListQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const archived = query.archived === true;
    const where: Prisma.ProductWhereInput = {
      organizationId: user.organizationId,
      ...(archived ? { deletedAt: { not: null } } : { deletedAt: null }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.fulfillmentMode ? { fulfillmentMode: query.fulfillmentMode } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.allowsDemo !== undefined ? { allowsDemo: query.allowsDemo } : {}),
      ...(query.requiresSubscription !== undefined
        ? { requiresSubscription: query.requiresSubscription }
        : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.customerSegment
        ? { plans: { some: { deletedAt: null, customerSegment: query.customerSegment } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search.toLowerCase(), mode: 'insensitive' } },
              { sku: { contains: query.search.toUpperCase(), mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [query.sortBy]: query.sortOrder,
    };
    const [records, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [orderBy, { id: query.sortOrder }],
        skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
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
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: productInclude,
    });
    if (!product) this.notFound();
    return this.map(product);
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertUpdate(context.user);
    const organizationId = context.user.organizationId;
    const current = await this.prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!current) this.notFound();
    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    const slug = dto.slug === undefined ? undefined : normalizeSlug(dto.slug);
    const sku = dto.sku === undefined ? undefined : normalizeCode(dto.sku);
    const allowsDemo = dto.allowsDemo ?? current.allowsDemo;
    this.assertDemo(
      allowsDemo,
      dto.demoDurationHours === undefined
        ? (current.demoDurationHours ?? undefined)
        : dto.demoDurationHours,
    );
    if (dto.metadata !== undefined) this.assertMetadata(dto.metadata);
    if (dto.categoryId !== undefined && dto.categoryId !== null)
      await this.assertCategory(organizationId, dto.categoryId);
    if (slug !== undefined || sku !== undefined)
      await this.assertProductUnique(organizationId, slug ?? current.slug, sku ?? current.sku, id);
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.product.update({
          where: { organizationId_id: { organizationId, id } },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(slug !== undefined ? { slug } : {}),
            ...(sku !== undefined ? { sku } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description.trim() || null }
              : {}),
            ...(dto.currency !== undefined ? { currency: dto.currency.trim().toUpperCase() } : {}),
            ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl?.trim() || null } : {}),
            ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
            ...(dto.type !== undefined ? { type: dto.type } : {}),
            ...(dto.fulfillmentMode !== undefined ? { fulfillmentMode: dto.fulfillmentMode } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.active !== undefined ? { active: dto.active } : {}),
            ...(dto.requiresSubscription !== undefined
              ? { requiresSubscription: dto.requiresSubscription }
              : {}),
            ...(dto.allowsDemo !== undefined
              ? {
                  allowsDemo: dto.allowsDemo,
                  demoDurationHours: dto.allowsDemo
                    ? (dto.demoDurationHours ?? current.demoDurationHours)
                    : null,
                }
              : {}),
            ...(dto.demoDurationHours !== undefined && dto.allowsDemo !== false
              ? { demoDurationHours: dto.demoDurationHours }
              : {}),
            ...(dto.requiresCustomerEmail !== undefined
              ? { requiresCustomerEmail: dto.requiresCustomerEmail }
              : {}),
            ...(dto.requiresCustomerPhone !== undefined
              ? { requiresCustomerPhone: dto.requiresCustomerPhone }
              : {}),
            ...(dto.requiresManualReview !== undefined
              ? { requiresManualReview: dto.requiresManualReview }
              : {}),
            ...(dto.publicVisible !== undefined ? { publicVisible: dto.publicVisible } : {}),
            ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
            ...(dto.stockTrackingEnabled !== undefined
              ? { stockTrackingEnabled: dto.stockTrackingEnabled }
              : {}),
            ...(dto.stockMinimum !== undefined ? { stockMinimum: dto.stockMinimum } : {}),
            ...(dto.metadata !== undefined ? { metadata: toSafeJson(dto.metadata) } : {}),
          },
          include: productInclude,
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'CATALOG_PRODUCT_UPDATED',
          tableName: 'Product',
          recordId: id,
          previousValue: {
            name: current.name,
            slug: current.slug,
            sku: current.sku,
            status: current.status,
          },
          newValue: {
            name: record.name,
            slug: record.slug,
            sku: record.sku,
            status: record.status,
          },
          ip: context.metadata.ipAddress,
        });
        return record;
      });
      return this.map(updated);
    } catch (error: unknown) {
      if (isUniqueConstraint(error)) {
        throw catalogException(
          HttpStatus.CONFLICT,
          sku
            ? CATALOG_ERROR_CODES.PRODUCT_SKU_ALREADY_EXISTS
            : CATALOG_ERROR_CODES.PRODUCT_SLUG_ALREADY_EXISTS,
          'El producto ya existe con ese identificador.',
        );
      }
      throw error;
    }
  }

  activate(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    return this.changeStatus(id, ProductStatus.ACTIVE, true, context);
  }

  deactivate(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    return this.changeStatus(id, ProductStatus.INACTIVE, false, context);
  }

  archive(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    this.access.assertDelete(context.user);
    return this.setArchived(id, true, context);
  }

  restore(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    this.access.assertDelete(context.user);
    return this.setArchived(id, false, context);
  }

  async getStock(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: {
        id: true,
        stockTrackingEnabled: true,
        stockQuantity: true,
        stockReserved: true,
        stockMinimum: true,
      },
    });
    if (!product) this.notFound();
    return this.stockMap(product);
  }

  async adjustStock(
    id: string,
    dto: AdjustStockDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertUpdate(context.user);
    const organizationId = context.user.organizationId;
    const stock = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT id FROM "Product"
        WHERE "organizationId" = ${organizationId}::uuid AND id = ${id}::uuid
        FOR UPDATE
      `;
      const current = await transaction.product.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true, stockQuantity: true, stockReserved: true },
      });
      if (!current) this.notFound();
      const quantityAfter = current.stockQuantity + dto.delta;
      if (quantityAfter < current.stockReserved) {
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.STOCK_INVALID_ADJUSTMENT,
          'El stock disponible no puede quedar por debajo del stock reservado.',
        );
      }
      const updated = await transaction.product.update({
        where: { organizationId_id: { organizationId, id } },
        data: { stockQuantity: quantityAfter },
        select: {
          id: true,
          stockTrackingEnabled: true,
          stockQuantity: true,
          stockReserved: true,
          stockMinimum: true,
        },
      });
      await transaction.productStockMovement.create({
        data: {
          organizationId,
          productId: id,
          userId: context.user.userId,
          quantityBefore: current.stockQuantity,
          quantityDelta: dto.delta,
          quantityAfter,
          movementType:
            dto.movementType ?? (dto.delta > 0 ? 'ENTRY' : dto.delta < 0 ? 'EXIT' : 'ADJUSTMENT'),
          reason: dto.reason.trim(),
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'CATALOG_STOCK_ADJUSTED',
        tableName: 'Product',
        recordId: id,
        previousValue: { stockQuantity: current.stockQuantity },
        newValue: { stockQuantity: quantityAfter, delta: dto.delta, reason: dto.reason.trim() },
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      return updated;
    });
    return this.stockMap(stock);
  }

  async listStockMovements(
    id: string,
    query: StockMovementListQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!product) this.notFound();
    const where = { organizationId: user.organizationId, productId: id };
    const [data, total] = await Promise.all([
      this.prisma.productStockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { changedBy: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.productStockMovement.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private async changeStatus(
    id: string,
    status: ProductStatus,
    active: boolean,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertUpdate(context.user);
    const current = await this.prisma.product.findFirst({
      where: { id, organizationId: context.user.organizationId, deletedAt: null },
    });
    if (!current) this.notFound();
    if (status === ProductStatus.ACTIVE && current.categoryId)
      await this.assertCategory(context.user.organizationId, current.categoryId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.product.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { status, active },
        include: productInclude,
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: active ? 'CATALOG_PRODUCT_ACTIVATED' : 'CATALOG_PRODUCT_DEACTIVATED',
        tableName: 'Product',
        recordId: id,
        previousValue: { status: current.status, active: current.active },
        newValue: { status, active },
        ip: context.metadata.ipAddress,
      });
      return record;
    });
    return this.map(updated);
  }

  private async setArchived(
    id: string,
    archived: boolean,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    const current = await this.prisma.product.findFirst({
      where: { id, organizationId: context.user.organizationId },
    });
    if (!current) this.notFound();
    if (Boolean(current.deletedAt) === archived) return this.map(current);
    if (!archived && current.categoryId)
      await this.assertCategory(context.user.organizationId, current.categoryId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.product.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: archived
          ? { deletedAt: new Date(), active: false, status: ProductStatus.INACTIVE }
          : { deletedAt: null, active: false, status: ProductStatus.INACTIVE },
        include: productInclude,
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: archived ? 'CATALOG_PRODUCT_ARCHIVED' : 'CATALOG_PRODUCT_RESTORED',
        tableName: 'Product',
        recordId: id,
        newValue: { archived, active: record.active, status: record.status },
        ip: context.metadata.ipAddress,
      });
      return record;
    });
    return this.map(updated);
  }

  private async assertCategory(organizationId: string, id: string): Promise<void> {
    const category = await this.prisma.productCategory.findFirst({
      where: { id, organizationId, deletedAt: null, active: true },
      select: { id: true },
    });
    if (!category)
      throw catalogException(
        HttpStatus.NOT_FOUND,
        CATALOG_ERROR_CODES.CATEGORY_NOT_FOUND,
        'La categoría no existe o no está activa.',
      );
  }

  private async assertProductUnique(
    organizationId: string,
    slug: string,
    sku: string | null,
    excludedId?: string,
  ): Promise<void> {
    const slugRecord = await this.prisma.product.findFirst({
      where: {
        organizationId,
        slug,
        active: true,
        deletedAt: null,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });
    if (slugRecord)
      throw catalogException(
        HttpStatus.CONFLICT,
        CATALOG_ERROR_CODES.PRODUCT_SLUG_ALREADY_EXISTS,
        'Ya existe un producto con ese slug.',
      );
    if (sku) {
      const skuRecord = await this.prisma.product.findFirst({
        where: {
          organizationId,
          sku,
          active: true,
          deletedAt: null,
          ...(excludedId ? { id: { not: excludedId } } : {}),
        },
        select: { id: true },
      });
      if (skuRecord)
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.PRODUCT_SKU_ALREADY_EXISTS,
          'Ya existe un producto con ese SKU.',
        );
    }
  }

  private assertDemo(allowsDemo: boolean, duration: number | undefined): void {
    if (
      (!allowsDemo && duration !== undefined) ||
      (allowsDemo && (duration === undefined || duration < 1 || duration > 168))
    ) {
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.PRODUCT_INVALID_DEMO,
        'La duración de demo debe ser nula o estar entre 1 y 168 horas.',
      );
    }
  }

  private assertMetadata(value: Record<string, unknown>): void {
    try {
      toSafeJson(value);
    } catch {
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.INVALID_METADATA,
        'metadata debe ser un objeto JSON sin secretos.',
      );
    }
  }

  private map(product: ProductRecord | Prisma.ProductGetPayload<object>): Record<string, unknown> {
    const record = product as ProductRecord;
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      sku: record.sku,
      description: record.description,
      currency: record.currency ?? 'USD',
      category: record.productCategory ?? null,
      type: record.type,
      fulfillmentMode: record.fulfillmentMode,
      status: record.status,
      active: record.active,
      requiresSubscription: record.requiresSubscription,
      allowsDemo: record.allowsDemo,
      demoDurationHours: record.demoDurationHours,
      requiresCustomerEmail: record.requiresCustomerEmail,
      requiresCustomerPhone: record.requiresCustomerPhone,
      requiresManualReview: record.requiresManualReview,
      imageUrl: record.imageUrl,
      publicVisible: record.publicVisible,
      displayOrder: record.displayOrder,
      stock: this.stockMap(record),
      plans:
        'plans' in record
          ? record.plans.map((plan) => ({
              ...plan,
              quantity: plan.quantity?.toFixed(3) ?? null,
              creditAmount: plan.creditAmount?.toFixed(3) ?? null,
            }))
          : [],
      variants: 'variants' in record ? record.variants : [],
      archivedAt: record.deletedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private notFound(): never {
    throw catalogException(
      HttpStatus.NOT_FOUND,
      CATALOG_ERROR_CODES.PRODUCT_NOT_FOUND,
      'El producto no existe.',
    );
  }

  private stockMap(product: {
    id: string;
    stockTrackingEnabled: boolean;
    stockQuantity: number;
    stockReserved: number;
    stockMinimum: number;
  }): Record<string, unknown> {
    return {
      productId: product.id,
      trackingEnabled: product.stockTrackingEnabled,
      quantity: product.stockQuantity,
      reserved: product.stockReserved,
      available: product.stockQuantity - product.stockReserved,
      minimum: product.stockMinimum,
    };
  }
}
