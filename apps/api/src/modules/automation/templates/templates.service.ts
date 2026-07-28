import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  MessageTemplate,
  MessageTemplateChannel,
  MessageTemplateStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { ListTemplatesQueryDto } from '../dto/list-templates-query.dto';
import { TemplatePreviewDto } from '../dto/template-preview.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { asInputJson } from '../automation.types';
import { TemplateRendererService } from './template-renderer.service';

export const TEMPLATE_ERROR_CODES = {
  NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  SLUG_ALREADY_EXISTS: 'TEMPLATE_SLUG_ALREADY_EXISTS',
  PREVIEW_CONTENT_REQUIRED: 'TEMPLATE_PREVIEW_CONTENT_REQUIRED',
} as const;

function templateError(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}

export interface PublicTemplate {
  id: string;
  name: string;
  slug: string;
  channel: MessageTemplateChannel;
  status: MessageTemplateStatus;
  subject: string | null;
  body: string;
  variables: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly renderer: TemplateRendererService,
  ) {}

  async list(
    query: ListTemplatesQueryDto,
    user: AuthenticatedUser,
  ): Promise<{ data: PublicTemplate[]; pagination: Record<string, number> }> {
    const where: Prisma.MessageTemplateWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [records, total] = await Promise.all([
      this.prisma.messageTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.messageTemplate.count({ where }),
    ]);
    return {
      data: records.map((record) => this.toPublic(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<PublicTemplate> {
    const record = await this.prisma.messageTemplate.findFirst({
      where: { organizationId: user.organizationId, id, deletedAt: null },
    });
    if (!record)
      throw templateError(
        HttpStatus.NOT_FOUND,
        TEMPLATE_ERROR_CODES.NOT_FOUND,
        'La plantilla no existe.',
      );
    return this.toPublic(record);
  }

  async create(
    dto: CreateTemplateDto,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<PublicTemplate> {
    const variables =
      dto.variables ?? this.renderer.extractVariables(`${dto.subject ?? ''}\n${dto.body}`);
    try {
      const record = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.messageTemplate.create({
          data: {
            organizationId: user.organizationId,
            createdByUserId: user.userId,
            name: dto.name.trim(),
            slug: dto.slug.trim().toLowerCase(),
            channel: dto.channel,
            subject: dto.subject?.trim() || null,
            body: dto.body,
            variables: asInputJson(variables),
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: user.organizationId,
          userId: user.userId,
          action: 'TEMPLATE_CREATED',
          tableName: 'MessageTemplate',
          recordId: created.id,
          newValue: asInputJson({
            name: created.name,
            slug: created.slug,
            channel: created.channel,
            variables,
          }),
          requestId,
        });
        return created;
      });
      return this.toPublic(record);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw templateError(
          HttpStatus.CONFLICT,
          TEMPLATE_ERROR_CODES.SLUG_ALREADY_EXISTS,
          'Ya existe una plantilla con ese slug.',
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateTemplateDto,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<PublicTemplate> {
    const current = await this.prisma.messageTemplate.findFirst({
      where: { organizationId: user.organizationId, id, deletedAt: null },
    });
    if (!current)
      throw templateError(
        HttpStatus.NOT_FOUND,
        TEMPLATE_ERROR_CODES.NOT_FOUND,
        'La plantilla no existe.',
      );
    const subject = dto.subject === undefined ? current.subject : dto.subject;
    const body = dto.body === undefined ? current.body : dto.body;
    const variables = dto.variables ?? this.renderer.extractVariables(`${subject ?? ''}\n${body}`);
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const record = await transaction.messageTemplate.update({
          where: { organizationId_id: { organizationId: user.organizationId, id } },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.slug !== undefined ? { slug: dto.slug.trim().toLowerCase() } : {}),
            ...(dto.channel !== undefined ? { channel: dto.channel } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.subject !== undefined ? { subject: dto.subject?.trim() || null } : {}),
            ...(dto.body !== undefined ? { body: dto.body } : {}),
            variables: asInputJson(variables),
            version: { increment: 1 },
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: user.organizationId,
          userId: user.userId,
          action: 'TEMPLATE_UPDATED',
          tableName: 'MessageTemplate',
          recordId: id,
          previousValue: asInputJson({
            version: current.version,
            name: current.name,
            status: current.status,
          }),
          newValue: asInputJson({
            version: record.version,
            name: record.name,
            status: record.status,
          }),
          requestId,
        });
        return record;
      });
      return this.toPublic(updated);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw templateError(
          HttpStatus.CONFLICT,
          TEMPLATE_ERROR_CODES.SLUG_ALREADY_EXISTS,
          'Ya existe una plantilla con ese slug.',
        );
      }
      throw error;
    }
  }

  async archive(id: string, user: AuthenticatedUser, requestId?: string): Promise<void> {
    const updated = await this.prisma.messageTemplate.updateMany({
      where: { organizationId: user.organizationId, id, deletedAt: null },
      data: { deletedAt: new Date(), status: MessageTemplateStatus.ARCHIVED },
    });
    if (updated.count === 0)
      throw templateError(
        HttpStatus.NOT_FOUND,
        TEMPLATE_ERROR_CODES.NOT_FOUND,
        'La plantilla no existe.',
      );
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'TEMPLATE_ARCHIVED',
      tableName: 'MessageTemplate',
      recordId: id,
      requestId,
    });
  }

  async preview(
    dto: TemplatePreviewDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    let subject = dto.subject ?? null;
    let body = dto.body;
    if (dto.templateId) {
      const template = await this.findOne(dto.templateId, user);
      subject = dto.subject ?? template.subject;
      body = dto.body ?? template.body;
    }
    if (!body)
      throw templateError(
        HttpStatus.BAD_REQUEST,
        TEMPLATE_ERROR_CODES.PREVIEW_CONTENT_REQUIRED,
        'Debes indicar el cuerpo o una plantilla.',
      );
    const rendered = this.renderer.renderMessage(subject, body, dto.context);
    return {
      subject: rendered.subject?.value ?? null,
      body: rendered.body.value,
      variables: [...new Set([...(rendered.subject?.variables ?? []), ...rendered.body.variables])],
      missingVariables: [
        ...new Set([
          ...(rendered.subject?.missingVariables ?? []),
          ...rendered.body.missingVariables,
        ]),
      ],
    };
  }

  private toPublic(record: MessageTemplate): PublicTemplate {
    const variables = Array.isArray(record.variables)
      ? record.variables.filter((value): value is string => typeof value === 'string')
      : this.renderer.extractVariables(`${record.subject ?? ''}\n${record.body}`);
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      channel: record.channel,
      status: record.status,
      subject: record.subject,
      body: record.body,
      variables,
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
