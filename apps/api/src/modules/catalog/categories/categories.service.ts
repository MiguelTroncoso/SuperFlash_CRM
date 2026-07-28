import { HttpStatus, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CatalogAccessPolicy } from '../access/catalog-access.policy';
import { CATALOG_ERROR_CODES, catalogException } from '../catalog.errors';
import {
  CatalogRequestContext,
  isUniqueConstraint,
  normalizeName,
  normalizeSlug,
} from '../catalog.types';
import { CreateCategoryDto, ReorderDto, UpdateCategoryDto } from '../dto/catalog.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: CatalogAccessPolicy,
  ) {}

  async create(
    dto: CreateCategoryDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertCreate(context.user);
    const name = normalizeName(dto.name);
    const slug = normalizeSlug(dto.slug ?? name);
    try {
      const category = await this.prisma.$transaction(async (transaction) => {
        const max = await transaction.productCategory.aggregate({
          where: { organizationId: context.user.organizationId },
          _max: { order: true },
        });
        const created = await transaction.productCategory.create({
          data: {
            organizationId: context.user.organizationId,
            name,
            slug,
            description: dto.description?.trim() || null,
            active: dto.active ?? true,
            order: (max._max.order ?? 0) + 1,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'CATALOG_CATEGORY_CREATED',
          tableName: 'ProductCategory',
          recordId: created.id,
          newValue: { name, slug, active: created.active },
          ip: context.metadata.ipAddress,
        });
        return created;
      });
      return this.map(category);
    } catch (error: unknown) {
      this.rethrowConflict(error, CATALOG_ERROR_CODES.CATEGORY_SLUG_ALREADY_EXISTS);
    }
  }

  async list(user: AuthenticatedUser): Promise<Record<string, unknown>[]> {
    this.access.assertRead(user);
    const categories = await this.prisma.productCategory.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return categories.map((category) => this.map(category));
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.access.assertRead(user);
    const category = await this.prisma.productCategory.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!category) this.notFound(CATALOG_ERROR_CODES.CATEGORY_NOT_FOUND, 'La categoría no existe.');
    return this.map(category);
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertUpdate(context.user);
    const current = await this.prisma.productCategory.findFirst({
      where: { id, organizationId: context.user.organizationId, deletedAt: null },
    });
    if (!current) this.notFound(CATALOG_ERROR_CODES.CATEGORY_NOT_FOUND, 'La categoría no existe.');
    const name = dto.name === undefined ? undefined : normalizeName(dto.name);
    const slug = dto.slug === undefined ? undefined : normalizeSlug(dto.slug);
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.productCategory.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(slug !== undefined ? { slug } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description.trim() || null }
              : {}),
            ...(dto.active !== undefined ? { active: dto.active } : {}),
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'CATALOG_CATEGORY_UPDATED',
          tableName: 'ProductCategory',
          recordId: id,
          previousValue: { name: current.name, slug: current.slug, active: current.active },
          newValue: { name: record.name, slug: record.slug, active: record.active },
          ip: context.metadata.ipAddress,
        });
        return record;
      });
      return this.map(updated);
    } catch (error: unknown) {
      this.rethrowConflict(error, CATALOG_ERROR_CODES.CATEGORY_SLUG_ALREADY_EXISTS);
    }
  }

  async archive(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    this.access.assertDelete(context.user);
    return this.setArchived(id, true, context);
  }

  async restore(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    this.access.assertDelete(context.user);
    return this.setArchived(id, false, context);
  }

  async reorder(
    id: string,
    dto: ReorderDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>[]> {
    this.access.assertUpdate(context.user);
    const organizationId = context.user.organizationId;
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('superflash:catalog-categories-order'), hashtext(${organizationId}))
      `;
      const current = await transaction.productCategory.findFirst({
        where: { id, organizationId, deletedAt: null },
      });
      if (!current)
        this.notFound(CATALOG_ERROR_CODES.CATEGORY_NOT_FOUND, 'La categoría no existe.');
      const active = await transaction.productCategory.findMany({
        where: { organizationId, deletedAt: null, active: true },
        orderBy: { order: 'asc' },
      });
      const remaining = active.filter((category) => category.id !== id);
      const target = Math.min(Math.max(dto.order, 1), remaining.length + 1) - 1;
      remaining.splice(target, 0, current);
      for (const [index, category] of remaining.entries()) {
        await transaction.productCategory.update({
          where: { organizationId_id: { organizationId, id: category.id } },
          data: { order: index + 1 },
        });
      }
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'CATALOG_CATEGORY_REORDERED',
        tableName: 'ProductCategory',
        recordId: id,
        newValue: { order: target + 1 },
        ip: context.metadata.ipAddress,
      });
      return remaining.map((category) =>
        this.map({ ...category, order: remaining.indexOf(category) + 1 }),
      );
    });
  }

  private async setArchived(
    id: string,
    archived: boolean,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    const current = await this.prisma.productCategory.findFirst({
      where: { id, organizationId: context.user.organizationId },
    });
    if (!current) this.notFound(CATALOG_ERROR_CODES.CATEGORY_NOT_FOUND, 'La categoría no existe.');
    if (Boolean(current.deletedAt) === archived) return this.map(current);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.productCategory.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          deletedAt: archived ? new Date() : null,
          active: archived ? false : current.active,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: archived ? 'CATALOG_CATEGORY_ARCHIVED' : 'CATALOG_CATEGORY_RESTORED',
        tableName: 'ProductCategory',
        recordId: id,
        newValue: { archived },
        ip: context.metadata.ipAddress,
      });
      return record;
    });
    return this.map(updated);
  }

  private map(category: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    active: boolean;
    order: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): Record<string, unknown> {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      active: category.active,
      order: category.order,
      archivedAt: category.deletedAt,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private notFound(code: 'CATALOG_CATEGORY_NOT_FOUND', message: string): never {
    throw catalogException(HttpStatus.NOT_FOUND, code, message);
  }

  private rethrowConflict(error: unknown, code: 'CATALOG_CATEGORY_SLUG_ALREADY_EXISTS'): never {
    if (isUniqueConstraint(error)) {
      throw catalogException(HttpStatus.CONFLICT, code, 'Ya existe una categoría con ese slug.');
    }
    throw error;
  }
}
