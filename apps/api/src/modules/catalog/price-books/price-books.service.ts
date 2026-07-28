import { HttpStatus, Injectable } from '@nestjs/common';
import { CustomerSegment, PriceBookStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CatalogAccessPolicy } from '../access/catalog-access.policy';
import { CATALOG_ERROR_CODES, catalogException } from '../catalog.errors';
import {
  CatalogRequestContext,
  isUniqueConstraint,
  isValidDateRange,
  normalizeCurrency,
  normalizeIsoCountry,
  normalizeName,
  parseOptionalDate,
} from '../catalog.types';
import { CreatePriceBookDto, PriceBookListQueryDto, UpdatePriceBookDto } from '../dto/catalog.dto';

@Injectable()
export class PriceBooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: CatalogAccessPolicy,
  ) {}

  async create(
    dto: CreatePriceBookDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertPricesManage(context.user);
    const values = this.normalize(dto);
    this.validate(values);
    const create = async (transaction: Prisma.TransactionClient) => {
      if (values.isDefault)
        await this.clearDefault(
          transaction,
          context.user.organizationId,
          values.customerSegment,
          values.countryCode,
          values.currency,
        );
      const book = await transaction.priceBook.create({
        data: { organizationId: context.user.organizationId, ...values },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CATALOG_PRICEBOOK_CREATED',
        tableName: 'PriceBook',
        recordId: book.id,
        newValue: { name: book.name, status: book.status, isDefault: book.isDefault },
        ip: context.metadata.ipAddress,
      });
      return book;
    };
    try {
      const book = values.isDefault
        ? await this.prisma
            .$transaction(async (transaction) => {
              await this.lockDefault(
                transaction,
                context.user.organizationId,
                values.customerSegment,
                values.countryCode,
                values.currency,
              );
              return create(transaction);
            })
            .then((value) => value)
        : await this.prisma.$transaction(create);
      return this.map(book);
    } catch (error: unknown) {
      if (isUniqueConstraint(error))
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.PRICE_BOOK_DEFAULT_CONFLICT,
          'Ya existe un price book default para este alcance.',
        );
      throw error;
    }
  }

  async list(
    query: PriceBookListQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>[]> {
    this.access.assertPricesRead(user);
    const books = await this.prisma.priceBook.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.customerSegment ? { customerSegment: query.customerSegment } : {}),
        ...(query.countryCode ? { countryCode: query.countryCode } : {}),
        ...(query.currency ? { currency: query.currency } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
    });
    return books.map((book) => this.map(book));
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.access.assertPricesRead(user);
    const book = await this.prisma.priceBook.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: { _count: { select: { entries: true } } },
    });
    if (!book) this.notFound();
    return { ...this.map(book), entryCount: book._count.entries };
  }

  async update(
    id: string,
    dto: UpdatePriceBookDto,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertPricesManage(context.user);
    const current = await this.prisma.priceBook.findFirst({
      where: { id, organizationId: context.user.organizationId, deletedAt: null },
    });
    if (!current) this.notFound();
    const values = this.normalize(dto, current);
    this.validate(values);
    const update = async (transaction: Prisma.TransactionClient) => {
      if (values.isDefault)
        await this.clearDefault(
          transaction,
          context.user.organizationId,
          values.customerSegment,
          values.countryCode,
          values.currency,
          id,
        );
      const book = await transaction.priceBook.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: values,
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CATALOG_PRICEBOOK_UPDATED',
        tableName: 'PriceBook',
        recordId: id,
        previousValue: { status: current.status, isDefault: current.isDefault },
        newValue: { status: book.status, isDefault: book.isDefault },
        ip: context.metadata.ipAddress,
      });
      return book;
    };
    try {
      const book =
        values.isDefault || current.isDefault
          ? await this.prisma.$transaction(async (transaction) => {
              await this.lockDefault(
                transaction,
                context.user.organizationId,
                values.customerSegment,
                values.countryCode,
                values.currency,
              );
              return update(transaction);
            })
          : await this.prisma.$transaction(update);
      return this.map(book);
    } catch (error: unknown) {
      if (isUniqueConstraint(error))
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.PRICE_BOOK_DEFAULT_CONFLICT,
          'Ya existe un price book default para este alcance.',
        );
      throw error;
    }
  }

  activate(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    return this.changeStatus(id, PriceBookStatus.ACTIVE, context);
  }
  deactivate(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    return this.changeStatus(id, PriceBookStatus.INACTIVE, context);
  }

  async archive(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    this.access.assertPricesManage(context.user);
    const current = await this.prisma.priceBook.findFirst({
      where: { id, organizationId: context.user.organizationId, deletedAt: null },
    });
    if (!current) this.notFound();
    if (current.archivedAt) return this.map(current);
    const book = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.priceBook.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { archivedAt: new Date(), status: PriceBookStatus.ARCHIVED, isDefault: false },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CATALOG_PRICEBOOK_ARCHIVED',
        tableName: 'PriceBook',
        recordId: id,
        newValue: { status: updated.status },
        ip: context.metadata.ipAddress,
      });
      return updated;
    });
    return this.map(book);
  }

  async restore(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    this.access.assertPricesManage(context.user);
    const current = await this.prisma.priceBook.findFirst({
      where: { id, organizationId: context.user.organizationId },
    });
    if (!current) this.notFound();
    if (!current.archivedAt) return this.map(current);
    const book = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.priceBook.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { archivedAt: null, status: PriceBookStatus.INACTIVE, isDefault: false },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'CATALOG_PRICEBOOK_RESTORED',
        tableName: 'PriceBook',
        recordId: id,
        newValue: { status: updated.status },
        ip: context.metadata.ipAddress,
      });
      return updated;
    });
    return this.map(book);
  }

  async setDefault(id: string, context: CatalogRequestContext): Promise<Record<string, unknown>> {
    this.access.assertPricesManage(context.user);
    const organizationId = context.user.organizationId;
    try {
      const book = await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.priceBook.findFirst({
          where: { id, organizationId, deletedAt: null, archivedAt: null },
        });
        if (!current) this.notFound();
        if (current.status !== PriceBookStatus.ACTIVE)
          throw catalogException(
            HttpStatus.BAD_REQUEST,
            CATALOG_ERROR_CODES.PRICE_BOOK_INVALID,
            'Solo un price book activo puede ser default.',
          );
        await this.lockDefault(
          transaction,
          organizationId,
          current.customerSegment,
          current.countryCode,
          current.currency,
        );
        await this.clearDefault(
          transaction,
          organizationId,
          current.customerSegment,
          current.countryCode,
          current.currency,
          id,
        );
        const updated = await transaction.priceBook.update({
          where: { organizationId_id: { organizationId, id } },
          data: { isDefault: true },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'CATALOG_PRICEBOOK_DEFAULT_CHANGED',
          tableName: 'PriceBook',
          recordId: id,
          newValue: { isDefault: true },
          ip: context.metadata.ipAddress,
        });
        return updated;
      });
      return this.map(book);
    } catch (error: unknown) {
      if (isUniqueConstraint(error))
        throw catalogException(
          HttpStatus.CONFLICT,
          CATALOG_ERROR_CODES.PRICE_BOOK_DEFAULT_CONFLICT,
          'Ya existe un price book default para este alcance.',
        );
      throw error;
    }
  }

  private async changeStatus(
    id: string,
    status: PriceBookStatus,
    context: CatalogRequestContext,
  ): Promise<Record<string, unknown>> {
    this.access.assertPricesManage(context.user);
    const current = await this.prisma.priceBook.findFirst({
      where: { id, organizationId: context.user.organizationId, deletedAt: null, archivedAt: null },
    });
    if (!current) this.notFound();
    const book = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.priceBook.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { status, ...(status !== PriceBookStatus.ACTIVE ? { isDefault: false } : {}) },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action:
          status === PriceBookStatus.ACTIVE
            ? 'CATALOG_PRICEBOOK_ACTIVATED'
            : 'CATALOG_PRICEBOOK_DEACTIVATED',
        tableName: 'PriceBook',
        recordId: id,
        previousValue: { status: current.status },
        newValue: { status },
        ip: context.metadata.ipAddress,
      });
      return updated;
    });
    return this.map(book);
  }

  private normalize(
    dto: CreatePriceBookDto | UpdatePriceBookDto,
    current?: {
      name: string;
      description: string | null;
      status: PriceBookStatus;
      customerSegment: CustomerSegment;
      countryCode: string | null;
      currency: string;
      validFrom: Date | null;
      validUntil: Date | null;
      isDefault: boolean;
      priority: number;
    },
  ): {
    name: string;
    description: string | null;
    status: PriceBookStatus;
    customerSegment: CustomerSegment;
    countryCode: string | null;
    currency: string;
    validFrom: Date | null;
    validUntil: Date | null;
    isDefault: boolean;
    priority: number;
  } {
    return {
      name: normalizeName(dto.name ?? current?.name ?? ''),
      description:
        dto.description === undefined
          ? (current?.description ?? null)
          : dto.description.trim() || null,
      status: dto.status ?? current?.status ?? PriceBookStatus.DRAFT,
      customerSegment: dto.customerSegment ?? current?.customerSegment ?? CustomerSegment.ANY,
      countryCode: normalizeIsoCountry(dto.countryCode ?? current?.countryCode ?? undefined),
      currency: normalizeCurrency(dto.currency ?? current?.currency ?? ''),
      validFrom:
        dto.validFrom === undefined
          ? (current?.validFrom ?? null)
          : parseOptionalDate(dto.validFrom),
      validUntil:
        dto.validUntil === undefined
          ? (current?.validUntil ?? null)
          : parseOptionalDate(dto.validUntil),
      isDefault: dto.isDefault ?? current?.isDefault ?? false,
      priority: dto.priority ?? current?.priority ?? 0,
    };
  }

  private validate(values: {
    name: string;
    status: PriceBookStatus;
    countryCode: string | null;
    currency: string;
    validFrom: Date | null;
    validUntil: Date | null;
    isDefault: boolean;
    priority: number;
  }): void {
    if (
      !values.name ||
      !/^[A-Z]{3}$/.test(values.currency) ||
      (values.countryCode !== null && !/^[A-Z]{2}$/.test(values.countryCode)) ||
      !isValidDateRange(values.validFrom, values.validUntil)
    )
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.PRICE_BOOK_INVALID,
        'El price book tiene país, moneda o vigencia inválidos.',
      );
    if (values.isDefault && values.status !== PriceBookStatus.ACTIVE)
      throw catalogException(
        HttpStatus.BAD_REQUEST,
        CATALOG_ERROR_CODES.PRICE_BOOK_INVALID,
        'Solo un price book activo puede ser default.',
      );
  }

  private async clearDefault(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    segment: CustomerSegment,
    country: string | null,
    currency: string,
    excludedId?: string,
  ): Promise<void> {
    await transaction.priceBook.updateMany({
      where: {
        organizationId,
        customerSegment: segment,
        countryCode: country,
        currency,
        status: PriceBookStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        isDefault: true,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  private async lockDefault(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    segment: CustomerSegment,
    country: string | null,
    currency: string,
  ): Promise<void> {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext('superflash:catalog-pricebook-default'), hashtext(${organizationId || `${segment}:${country ?? ''}:${currency}`}))
    `;
  }

  private map(book: {
    id: string;
    name: string;
    description: string | null;
    status: PriceBookStatus;
    customerSegment: CustomerSegment;
    countryCode: string | null;
    currency: string;
    validFrom: Date | null;
    validUntil: Date | null;
    isDefault: boolean;
    priority: number;
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
    deletedAt: Date | null;
  }): Record<string, unknown> {
    return {
      id: book.id,
      name: book.name,
      description: book.description,
      status: book.status,
      customerSegment: book.customerSegment,
      countryCode: book.countryCode,
      currency: book.currency,
      validFrom: book.validFrom,
      validUntil: book.validUntil,
      isDefault: book.isDefault,
      priority: book.priority,
      archivedAt: book.archivedAt,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    };
  }

  private notFound(): never {
    throw catalogException(
      HttpStatus.NOT_FOUND,
      CATALOG_ERROR_CODES.PRICE_BOOK_NOT_FOUND,
      'El price book no existe.',
    );
  }
}
