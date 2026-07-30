import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  UserStatus,
  WhatsAppConnectionStatus,
  WhatsAppConversationStatus,
  WhatsAppMessageDeliveryStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageType,
} from '@prisma/client';

import { AppConfiguration } from '../../config/configuration';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CredentialEncryptionService } from '../credentials/credential-encryption.service';
import { WhatsAppGraphApiClient } from './whatsapp.graph-api.client';
import { WHATSAPP_ERROR_CODES, whatsappException } from './whatsapp.errors';
import {
  AssignWhatsAppConversationDto,
  ListWhatsAppConversationsQueryDto,
  ListWhatsAppMessagesQueryDto,
  SendWhatsAppMessageDto,
  UpsertWhatsAppConnectionDto,
  WhatsAppOutboundType,
  WhatsAppTemplateQueryDto,
} from './dto/whatsapp.dto';
import { displayName, toInputJson } from './whatsapp.types';

export interface WhatsAppContext {
  user: AuthenticatedUser;
  metadata: RequestMetadata;
}

const MASKED_SECRET = '••••••••';

@Injectable()
export class WhatsAppService {
  private readonly defaultGraphApiVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly encryption: CredentialEncryptionService,
    private readonly graphApi: WhatsAppGraphApiClient,
    config: ConfigService,
  ) {
    this.defaultGraphApiVersion =
      config.getOrThrow<AppConfiguration>('app').whatsappGraphApiVersion;
  }

  async getConnection(user: AuthenticatedUser): Promise<Record<string, unknown> | null> {
    const connection = await this.prisma.whatsAppConnection.findFirst({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { phoneNumbers: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
    });
    return connection ? this.mapConnection(connection) : null;
  }

  async upsertConnection(
    dto: UpsertWhatsAppConnectionDto,
    context: WhatsAppContext,
  ): Promise<Record<string, unknown>> {
    const organizationId = context.user.organizationId;
    const current = await this.prisma.whatsAppConnection.findFirst({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const accessToken =
      dto.accessToken?.trim() ||
      (current ? this.encryption.decrypt(current.accessTokenEncrypted) : null);
    const appSecret =
      dto.appSecret?.trim() ||
      (current ? this.encryption.decrypt(current.appSecretEncrypted) : null);
    const verifyToken =
      dto.webhookVerifyToken?.trim() ||
      (current ? this.encryption.decrypt(current.webhookVerifyTokenEncrypted) : null);
    if (!accessToken || !appSecret || !verifyToken) {
      throw whatsappException(
        HttpStatus.BAD_REQUEST,
        WHATSAPP_ERROR_CODES.CONNECTION_INVALID,
        'La conexión requiere sus tres secretos.',
      );
    }
    const graphApiVersion =
      dto.graphApiVersion?.trim() || current?.graphApiVersion || this.defaultGraphApiVersion;
    const saved = await this.prisma.$transaction(async (transaction) => {
      const data = {
        wabaId: dto.wabaId.trim(),
        phoneNumberId: dto.phoneNumberId.trim(),
        businessPhoneNumber: dto.businessPhoneNumber.trim(),
        accessTokenEncrypted: this.encryption.encrypt(accessToken),
        appSecretEncrypted: this.encryption.encrypt(appSecret),
        webhookVerifyTokenEncrypted: this.encryption.encrypt(verifyToken),
        graphApiVersion,
        status: WhatsAppConnectionStatus.DISCONNECTED,
        deletedAt: null,
      } as const;
      const connection = current
        ? await transaction.whatsAppConnection.update({
            where: { organizationId_id: { organizationId, id: current.id } },
            data,
          })
        : await transaction.whatsAppConnection.create({ data: { organizationId, ...data } });
      await transaction.whatsAppPhoneNumber.upsert({
        where: {
          organizationId_phoneNumberId: { organizationId, phoneNumberId: dto.phoneNumberId.trim() },
        },
        create: {
          organizationId,
          connectionId: connection.id,
          phoneNumberId: dto.phoneNumberId.trim(),
          displayPhoneNumber: dto.businessPhoneNumber.trim(),
        },
        update: {
          connectionId: connection.id,
          displayPhoneNumber: dto.businessPhoneNumber.trim(),
          active: true,
          deletedAt: null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'WHATSAPP_CONNECTION_UPDATED',
        tableName: 'WhatsAppConnection',
        recordId: connection.id,
        newValue: toInputJson({
          wabaId: connection.wabaId,
          phoneNumberId: connection.phoneNumberId,
          graphApiVersion,
        }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      return connection;
    });
    return this.mapConnection(saved);
  }

  async testConnection(context: WhatsAppContext): Promise<Record<string, unknown>> {
    const connection = await this.requireConnection(context.user.organizationId, true);
    try {
      const result = await this.graphApi.testConnection({
        graphApiVersion: connection.graphApiVersion,
        phoneNumberId: connection.phoneNumberId,
        accessToken: this.encryption.decrypt(connection.accessTokenEncrypted),
      });
      const updated = await this.prisma.$transaction(async (transaction) => {
        const value = await transaction.whatsAppConnection.update({
          where: {
            organizationId_id: { organizationId: connection.organizationId, id: connection.id },
          },
          data: {
            status: WhatsAppConnectionStatus.CONNECTED,
            lastHealthcheckAt: new Date(),
            lastHealthcheckError: null,
          },
        });
        await transaction.whatsAppPhoneNumber.updateMany({
          where: {
            organizationId: connection.organizationId,
            connectionId: connection.id,
            phoneNumberId: connection.phoneNumberId,
          },
          data: {
            displayPhoneNumber: result.displayPhoneNumber || connection.businessPhoneNumber,
            verifiedName: result.verifiedName,
            qualityRating: result.qualityRating,
            active: true,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: connection.organizationId,
          userId: context.user.userId,
          action: 'WHATSAPP_CONNECTION_HEALTHCHECK_SUCCEEDED',
          tableName: 'WhatsAppConnection',
          recordId: connection.id,
          newValue: toInputJson({ status: value.status }),
          ip: context.metadata.ipAddress,
          requestId: context.metadata.requestId,
        });
        return value;
      });
      return this.mapConnection(updated);
    } catch (error: unknown) {
      await this.prisma.whatsAppConnection.update({
        where: {
          organizationId_id: { organizationId: connection.organizationId, id: connection.id },
        },
        data: {
          status: WhatsAppConnectionStatus.ERROR,
          lastHealthcheckAt: new Date(),
          lastHealthcheckError: this.safeError(error),
        },
      });
      throw whatsappException(
        HttpStatus.BAD_GATEWAY,
        WHATSAPP_ERROR_CODES.CONNECTION_TEST_FAILED,
        'No fue posible validar la conexión de WhatsApp.',
      );
    }
  }

  async disconnect(context: WhatsAppContext): Promise<void> {
    const connection = await this.requireConnection(context.user.organizationId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.whatsAppConnection.update({
        where: {
          organizationId_id: { organizationId: connection.organizationId, id: connection.id },
        },
        data: { status: WhatsAppConnectionStatus.DISCONNECTED },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: connection.organizationId,
        userId: context.user.userId,
        action: 'WHATSAPP_CONNECTION_DISCONNECTED',
        tableName: 'WhatsAppConnection',
        recordId: connection.id,
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
    });
  }

  async listConversations(
    query: ListWhatsAppConversationsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const where: Prisma.WhatsAppConversationWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { externalContactPhoneNormalized: { contains: query.search.trim() } },
              { externalContactName: { contains: query.search.trim(), mode: 'insensitive' } },
              { contact: { firstName: { contains: query.search.trim(), mode: 'insensitive' } } },
              { contact: { lastName: { contains: query.search.trim(), mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.whatsAppConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
          assignedUser: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.whatsAppConversation.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.mapConversation(row)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async listMessages(
    conversationId: string,
    query: ListWhatsAppMessagesQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const conversation = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!conversation)
      throw whatsappException(
        HttpStatus.NOT_FOUND,
        WHATSAPP_ERROR_CODES.CONVERSATION_NOT_FOUND,
        'Conversación no encontrada.',
      );
    const where = { organizationId: user.organizationId, conversationId, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.mapMessage(row)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async sendMessage(
    conversationId: string,
    dto: SendWhatsAppMessageDto,
    context: WhatsAppContext,
  ): Promise<Record<string, unknown>> {
    const organizationId = context.user.organizationId;
    const conversation = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId, deletedAt: null },
      include: { connection: true, phoneNumber: true },
    });
    if (!conversation)
      throw whatsappException(
        HttpStatus.NOT_FOUND,
        WHATSAPP_ERROR_CODES.CONVERSATION_NOT_FOUND,
        'Conversación no encontrada.',
      );
    if (dto.idempotencyKey) {
      const existing = await this.prisma.whatsAppMessage.findFirst({
        where: { organizationId, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return this.mapMessage(existing);
    }
    const now = new Date();
    if (dto.type === WhatsAppOutboundType.TEXT && (!dto.text || dto.text.trim().length === 0)) {
      throw whatsappException(
        HttpStatus.BAD_REQUEST,
        WHATSAPP_ERROR_CODES.MESSAGE_INVALID,
        'El mensaje de texto no puede estar vacío.',
      );
    }
    if (
      dto.type === WhatsAppOutboundType.TEXT &&
      (!conversation.windowExpiresAt || conversation.windowExpiresAt <= now)
    ) {
      throw whatsappException(
        HttpStatus.BAD_REQUEST,
        WHATSAPP_ERROR_CODES.MESSAGE_INVALID,
        'La ventana de conversación expiró; debes usar una plantilla aprobada.',
      );
    }
    let template: {
      name: string;
      language: string;
      components: Prisma.InputJsonValue | null;
    } | null = null;
    if (dto.type === WhatsAppOutboundType.TEMPLATE) {
      if (!dto.templateName || !dto.templateLanguage)
        throw whatsappException(
          HttpStatus.BAD_REQUEST,
          WHATSAPP_ERROR_CODES.MESSAGE_INVALID,
          'La plantilla requiere nombre e idioma.',
        );
      const stored = await this.prisma.messageTemplate.findFirst({
        where: {
          organizationId,
          channel: 'WHATSAPP',
          whatsappName: dto.templateName,
          whatsappLanguage: dto.templateLanguage,
          whatsappStatus: 'APPROVED',
          deletedAt: null,
        },
      });
      if (!stored)
        throw whatsappException(
          HttpStatus.BAD_REQUEST,
          WHATSAPP_ERROR_CODES.TEMPLATE_NOT_APPROVED,
          'Solo se pueden enviar plantillas de WhatsApp aprobadas.',
        );
      template = {
        name: dto.templateName,
        language: dto.templateLanguage,
        components: dto.templateComponents ? toInputJson(dto.templateComponents) : null,
      };
    }
    const message = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.whatsAppMessage.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          connectionId: conversation.connectionId,
          phoneNumberId: conversation.phoneNumberId,
          contactId: conversation.contactId,
          ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey } : {}),
          direction: WhatsAppMessageDirection.OUTBOUND,
          type:
            dto.type === WhatsAppOutboundType.TEXT
              ? WhatsAppMessageType.TEXT
              : WhatsAppMessageType.TEMPLATE,
          status: WhatsAppMessageDeliveryStatus.QUEUED,
          ...(dto.text ? { text: dto.text.trim() } : {}),
          ...(template
            ? {
                templateName: template.name,
                templateLanguage: template.language,
                ...(template.components !== null
                  ? { templateComponents: template.components }
                  : {}),
              }
            : {}),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await transaction.whatsAppConversation.update({
        where: { organizationId_id: { organizationId, id: conversation.id } },
        data: { lastMessageAt: now, lastOutboundAt: now },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'WHATSAPP_MESSAGE_QUEUED',
        tableName: 'WhatsAppMessage',
        recordId: created.id,
        newValue: toInputJson({ type: created.type, conversationId }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'WhatsAppMessageQueued',
        organizationId,
        aggregateType: 'WhatsAppMessage',
        aggregateId: created.id,
        actorId: context.user.userId,
        requestId: context.metadata.requestId ?? created.id,
        payload: { messageId: created.id, conversationId },
      });
      return created;
    });
    return this.mapMessage(message);
  }

  async assignConversation(
    conversationId: string,
    dto: AssignWhatsAppConversationDto,
    context: WhatsAppContext,
  ): Promise<Record<string, unknown>> {
    const organizationId = context.user.organizationId;
    if (dto.assignedUserId) {
      const assignee = await this.prisma.user.findFirst({
        where: {
          id: dto.assignedUserId,
          organizationId,
          status: UserStatus.ACTIVE,
          deletedAt: null,
          role: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!assignee)
        throw whatsappException(
          HttpStatus.NOT_FOUND,
          WHATSAPP_ERROR_CODES.ASSIGNEE_NOT_FOUND,
          'El responsable no existe o no está activo.',
        );
    }
    const conversation = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.whatsAppConversation.updateMany({
        where: { id: conversationId, organizationId, deletedAt: null },
        data: { assignedUserId: dto.assignedUserId ?? null },
      });
      if (updated.count === 0)
        throw whatsappException(
          HttpStatus.NOT_FOUND,
          WHATSAPP_ERROR_CODES.CONVERSATION_NOT_FOUND,
          'Conversación no encontrada.',
        );
      const row = await transaction.whatsAppConversation.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id: conversationId } },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
          assignedUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'WHATSAPP_CONVERSATION_ASSIGNED',
        tableName: 'WhatsAppConversation',
        recordId: conversationId,
        newValue: toInputJson({ assignedUserId: dto.assignedUserId ?? null }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'ConversationAssigned',
        organizationId,
        aggregateType: 'WhatsAppConversation',
        aggregateId: conversationId,
        actorId: context.user.userId,
        requestId: context.metadata.requestId ?? conversationId,
        payload: {
          conversationId,
          assignedUserId: dto.assignedUserId ?? null,
        },
      });
      return row;
    });
    return this.mapConversation(conversation);
  }

  async listTemplates(
    query: WhatsAppTemplateQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const rows = await this.prisma.messageTemplate.findMany({
      where: {
        organizationId: user.organizationId,
        channel: 'WHATSAPP',
        deletedAt: null,
        ...(query.search
          ? { whatsappName: { contains: query.search.trim(), mode: 'insensitive' } }
          : {}),
      },
      orderBy: [{ whatsappName: 'asc' }, { whatsappLanguage: 'asc' }],
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.whatsappName ?? row.name,
        language: row.whatsappLanguage,
        category: row.whatsappCategory,
        status: row.whatsappStatus ?? row.status,
        components: row.whatsappComponents ?? null,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async syncTemplates(context: WhatsAppContext): Promise<Record<string, unknown>> {
    const connection = await this.requireConnection(context.user.organizationId);
    const templates = await this.graphApi.listTemplates({
      graphApiVersion: connection.graphApiVersion,
      wabaId: connection.wabaId,
      accessToken: this.encryption.decrypt(connection.accessTokenEncrypted),
    });
    const synced = await this.prisma.$transaction(async (transaction) => {
      for (const template of templates) {
        const slug = `whatsapp-${template.name}-${template.language}`
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .slice(0, 180);
        await transaction.messageTemplate.upsert({
          where: { organizationId_slug: { organizationId: connection.organizationId, slug } },
          create: {
            organizationId: connection.organizationId,
            name: template.name,
            slug,
            channel: 'WHATSAPP',
            status: 'ACTIVE',
            body: template.name,
            whatsappExternalId: template.externalId,
            whatsappName: template.name,
            whatsappLanguage: template.language,
            whatsappCategory: template.category,
            whatsappStatus: template.status,
            ...(template.components
              ? { whatsappComponents: toInputJson(template.components) }
              : {}),
            createdByUserId: context.user.userId,
          },
          update: {
            whatsappExternalId: template.externalId,
            whatsappLanguage: template.language,
            whatsappCategory: template.category,
            whatsappStatus: template.status,
            ...(template.components
              ? { whatsappComponents: toInputJson(template.components) }
              : {}),
            deletedAt: null,
          },
        });
      }
      await this.audit.recordWithClient(transaction, {
        organizationId: connection.organizationId,
        userId: context.user.userId,
        action: 'WHATSAPP_TEMPLATES_SYNCED',
        tableName: 'MessageTemplate',
        recordId: connection.id,
        newValue: toInputJson({ count: templates.length }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      return templates.length;
    });
    return { synced };
  }

  async requireConnection(organizationId: string, allowDisconnected = false) {
    const connection = await this.prisma.whatsAppConnection.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        ...(allowDisconnected ? {} : { status: { not: WhatsAppConnectionStatus.DISCONNECTED } }),
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!connection)
      throw whatsappException(
        HttpStatus.NOT_FOUND,
        WHATSAPP_ERROR_CODES.CONNECTION_NOT_FOUND,
        'No hay una conexión de WhatsApp configurada.',
      );
    return connection;
  }

  mapConnection(connection: {
    id: string;
    wabaId: string;
    phoneNumberId: string;
    businessPhoneNumber: string;
    graphApiVersion: string;
    status: WhatsAppConnectionStatus;
    lastHealthcheckAt: Date | null;
    lastHealthcheckError: string | null;
    lastWebhookReceivedAt: Date | null;
    phoneNumbers?: Array<{
      id: string;
      phoneNumberId: string;
      displayPhoneNumber: string;
      verifiedName: string | null;
      qualityRating: string | null;
      active: boolean;
    }>;
  }): Record<string, unknown> {
    return {
      id: connection.id,
      wabaId: connection.wabaId,
      phoneNumberId: connection.phoneNumberId,
      businessPhoneNumber: connection.businessPhoneNumber,
      graphApiVersion: connection.graphApiVersion,
      status: connection.status,
      accessToken: MASKED_SECRET,
      appSecret: MASKED_SECRET,
      webhookVerifyToken: MASKED_SECRET,
      lastHealthcheckAt: connection.lastHealthcheckAt,
      lastHealthcheckError: connection.lastHealthcheckError,
      lastWebhookReceivedAt: connection.lastWebhookReceivedAt,
      phoneNumbers:
        connection.phoneNumbers?.map((phone) => ({
          id: phone.id,
          phoneNumberId: phone.phoneNumberId,
          displayPhoneNumber: phone.displayPhoneNumber,
          verifiedName: phone.verifiedName,
          qualityRating: phone.qualityRating,
          active: phone.active,
        })) ?? [],
    };
  }

  mapConversation(row: {
    id: string;
    externalContactPhone: string;
    externalContactPhoneNormalized: string;
    externalContactName: string | null;
    status: WhatsAppConversationStatus;
    windowStartedAt: Date | null;
    windowExpiresAt: Date | null;
    lastMessageAt: Date | null;
    unreadCount: number;
    contact?: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
    };
    assignedUser?: { id: string; firstName: string; lastName: string | null } | null;
  }): Record<string, unknown> {
    return {
      id: row.id,
      externalContactPhone: row.externalContactPhone,
      externalContactPhoneNormalized: row.externalContactPhoneNormalized,
      externalContactName: row.externalContactName,
      status: row.status,
      windowStartedAt: row.windowStartedAt,
      windowExpiresAt: row.windowExpiresAt,
      lastMessageAt: row.lastMessageAt,
      unreadCount: row.unreadCount,
      contact: row.contact
        ? {
            id: row.contact.id,
            name: displayName(row.contact.firstName, row.contact.lastName),
            phone: row.contact.phone,
          }
        : null,
      assignedTo: row.assignedUser
        ? {
            id: row.assignedUser.id,
            firstName: row.assignedUser.firstName,
            lastName: row.assignedUser.lastName,
          }
        : null,
    };
  }

  mapMessage(row: {
    id: string;
    externalMessageId: string | null;
    direction: WhatsAppMessageDirection;
    type: WhatsAppMessageType;
    status: WhatsAppMessageDeliveryStatus;
    text: string | null;
    templateName: string | null;
    templateLanguage: string | null;
    mediaMimeType: string | null;
    mediaFilename: string | null;
    caption: string | null;
    location: Prisma.JsonValue;
    errorCode: string | null;
    errorMessage: string | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    readAt: Date | null;
    failedAt: Date | null;
    createdAt: Date;
  }): Record<string, unknown> {
    return {
      id: row.id,
      externalMessageId: row.externalMessageId,
      direction: row.direction,
      type: row.type,
      status: row.status,
      text: row.text,
      templateName: row.templateName,
      templateLanguage: row.templateLanguage,
      mediaMimeType: row.mediaMimeType,
      mediaFilename: row.mediaFilename,
      caption: row.caption,
      location: row.location,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      sentAt: row.sentAt,
      deliveredAt: row.deliveredAt,
      readAt: row.readAt,
      failedAt: row.failedAt,
      createdAt: row.createdAt,
    };
  }

  private safeError(error: unknown): string {
    if (error instanceof Error) return error.message.slice(0, 500);
    return 'Error desconocido';
  }
}
