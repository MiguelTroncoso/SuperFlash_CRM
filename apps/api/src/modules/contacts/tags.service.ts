import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CONTACT_ERROR_CODES, contactException } from './contacts.errors';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

interface TagContext {
  user: AuthenticatedUser;
  metadata: RequestMetadata;
}

interface PublicTag {
  id: string;
  name: string;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthenticatedUser): Promise<PublicTag[]> {
    const tags = await this.prisma.tag.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true, createdAt: true, updatedAt: true },
    });
    return tags;
  }

  async create(dto: CreateTagDto, context: TagContext): Promise<PublicTag> {
    const name = this.normalizeName(dto.name);
    const color = this.normalizeColor(dto.color);
    await this.assertNameAvailable(context.user.organizationId, name);
    try {
      const tag = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.tag.create({
          data: {
            organizationId: context.user.organizationId,
            name,
            color,
          },
          select: { id: true, name: true, color: true, createdAt: true, updatedAt: true },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'TAG_CREATED',
          tableName: 'Tag',
          recordId: created.id,
          newValue: { name: created.name, color: created.color },
          ip: context.metadata.ipAddress,
        });
        return created;
      });
      return tag;
    } catch (error: unknown) {
      throw this.mapUniqueError(error);
    }
  }

  async update(id: string, dto: UpdateTagDto, context: TagContext): Promise<PublicTag> {
    const current = await this.findTag(context.user.organizationId, id);
    const name = 'name' in dto ? this.normalizeName(dto.name) : current.name;
    const color = 'color' in dto ? this.normalizeColor(dto.color) : current.color;
    if (name !== current.name) {
      await this.assertNameAvailable(context.user.organizationId, name, id);
    }
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.tag.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: { name, color },
          select: { id: true, name: true, color: true, createdAt: true, updatedAt: true },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'TAG_UPDATED',
          tableName: 'Tag',
          recordId: id,
          previousValue: { name: current.name, color: current.color },
          newValue: { name: record.name, color: record.color },
          ip: context.metadata.ipAddress,
        });
        return record;
      });
      return updated;
    } catch (error: unknown) {
      throw this.mapUniqueError(error);
    }
  }

  async archive(id: string, context: TagContext): Promise<PublicTag> {
    const current = await this.findTag(context.user.organizationId, id);
    if (current.deletedAt) return this.publicTag(current);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.tag.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { deletedAt: new Date() },
        select: { id: true, name: true, color: true, createdAt: true, updatedAt: true },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'TAG_ARCHIVED',
        tableName: 'Tag',
        recordId: id,
        previousValue: { deletedAt: null },
        newValue: { deletedAt: new Date().toISOString() },
        ip: context.metadata.ipAddress,
      });
      return record;
    });
    return updated;
  }

  async restore(id: string, context: TagContext): Promise<PublicTag> {
    const current = await this.findTag(context.user.organizationId, id);
    const deletedAt = current.deletedAt;
    if (!deletedAt) return this.publicTag(current);
    await this.assertNameAvailable(context.user.organizationId, current.name, id);
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.tag.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: { deletedAt: null },
          select: { id: true, name: true, color: true, createdAt: true, updatedAt: true },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'TAG_RESTORED',
          tableName: 'Tag',
          recordId: id,
          previousValue: { deletedAt: deletedAt.toISOString() },
          newValue: { deletedAt: null },
          ip: context.metadata.ipAddress,
        });
        return record;
      });
      return updated;
    } catch (error: unknown) {
      throw this.mapUniqueError(error);
    }
  }

  private async findTag(
    organizationId: string,
    id: string,
  ): Promise<{
    id: string;
    name: string;
    color: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const tag = await this.prisma.tag.findFirst({
      where: { organizationId, id },
      select: {
        id: true,
        name: true,
        color: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!tag) {
      throw contactException(
        HttpStatus.NOT_FOUND,
        CONTACT_ERROR_CODES.TAG_NOT_FOUND,
        'Etiqueta no encontrada.',
      );
    }
    return tag;
  }

  private async assertNameAvailable(
    organizationId: string,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.tag.findFirst({
      where: {
        organizationId,
        ...(excludedId ? { id: { not: excludedId } } : {}),
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) {
      throw contactException(
        HttpStatus.CONFLICT,
        CONTACT_ERROR_CODES.TAG_NAME_ALREADY_EXISTS,
        'Ya existe una etiqueta con ese nombre.',
        { existingTagId: existing.id },
      );
    }
  }

  private normalizeName(name: string | null | undefined): string {
    const normalized = name?.trim().replace(/\s+/g, ' ') ?? '';
    if (!normalized) {
      throw contactException(
        HttpStatus.BAD_REQUEST,
        CONTACT_ERROR_CODES.TAG_NAME_ALREADY_EXISTS,
        'El nombre de la etiqueta es obligatorio.',
      );
    }
    return normalized;
  }

  private normalizeColor(color: string | null | undefined): string | null {
    if (color === null || color === undefined || color.trim().length === 0) return null;
    if (!/^#[0-9A-Fa-f]{6}$/.test(color.trim())) {
      throw contactException(
        HttpStatus.BAD_REQUEST,
        CONTACT_ERROR_CODES.TAG_INVALID_COLOR,
        'El color debe tener formato #RRGGBB.',
      );
    }
    return color.trim().toUpperCase();
  }

  private mapUniqueError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return contactException(
        HttpStatus.CONFLICT,
        CONTACT_ERROR_CODES.TAG_NAME_ALREADY_EXISTS,
        'Ya existe una etiqueta con ese nombre.',
      );
    }
    return error instanceof Error
      ? error
      : new Error('La operación de etiquetas no pudo completarse.');
  }

  private publicTag(tag: {
    id: string;
    name: string;
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PublicTag {
    return tag;
  }
}
