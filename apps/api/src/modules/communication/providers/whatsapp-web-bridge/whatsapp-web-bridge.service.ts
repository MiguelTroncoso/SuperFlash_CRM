import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityType,
  Prisma,
  WhatsAppConnectionStatus,
  WhatsAppMessageDeliveryStatus,
  WhatsAppMessageDirection,
  WhatsAppWebBridgeStatus,
} from '@prisma/client';

import { AppConfiguration } from '../../../../config/configuration';
import { OutboxService } from '../../../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../../../auth/auth.types';
import { PhoneNormalizerService } from '../../../contacts/phone/phone-normalizer.service';
import { SmartInboxEventsService } from '../../../smart-inbox/smart-inbox.events';
import { CommunicationMetricsService } from '../../services/communication-metrics.service';
import { WhatsAppWebBridgeSecurity } from './whatsapp-web-bridge.security';
import {
  BridgeQrState,
  mapBridgeMessageType,
  WhatsAppWebBridgeHeartbeatInput,
  WhatsAppWebBridgeMessageInput,
  WhatsAppWebBridgeMessageType,
  WhatsAppWebBridgeQrInput,
  WhatsAppWebBridgeStatusInput,
} from './whatsapp-web-bridge.types';

const BRIDGE_PHONE_PREFIX = 'web-bridge:';
const MAX_QR_LENGTH = 4096;
const BRIDGE_STATUSES = [
  'PAIRING',
  'CONNECTED',
  'DISCONNECTED',
  'AUTHENTICATION_ERROR',
  'ERROR',
] as const;
const BRIDGE_MESSAGE_TYPES = [
  'TEXT',
  'IMAGE',
  'AUDIO',
  'VIDEO',
  'DOCUMENT',
  'LOCATION',
  'CONTACTS',
  'STICKER',
  'UNKNOWN',
] as const;

function safeDate(value: unknown, label: string): Date | undefined {
  if (!value) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${label} no es válido.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} no es válido.`);
  return date;
}

function isBridgeStatus(value: unknown): value is (typeof BRIDGE_STATUSES)[number] {
  return (
    typeof value === 'string' && BRIDGE_STATUSES.includes(value as (typeof BRIDGE_STATUSES)[number])
  );
}

function isBridgeMessageType(value: unknown): value is WhatsAppWebBridgeMessageType {
  return (
    typeof value === 'string' &&
    BRIDGE_MESSAGE_TYPES.includes(value as (typeof BRIDGE_MESSAGE_TYPES)[number])
  );
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function displayName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter((value): value is string => Boolean(value)).join(' ');
}

function opportunityTitle(
  firstName: string | null,
  lastName: string | null,
  phone: string,
): string {
  const name = displayName(firstName, lastName);
  return name ? `Interés de ${name}` : `Lead ${phone}`;
}

@Injectable()
export class WhatsAppWebBridgeService {
  private readonly logger = new Logger(WhatsAppWebBridgeService.name);
  private readonly configuration: AppConfiguration['whatsappWebBridge'];
  private readonly qrByChannel = new Map<string, BridgeQrState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly phoneNormalizer: PhoneNormalizerService,
    private readonly events: SmartInboxEventsService,
    private readonly metrics: CommunicationMetricsService,
    private readonly security: WhatsAppWebBridgeSecurity,
    config: ConfigService,
  ) {
    this.configuration = config.getOrThrow<AppConfiguration>('app').whatsappWebBridge;
  }

  async status(user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const channel = await this.ensureChannel(user.organizationId);
    return this.publicStatus(channel, user.permissions.includes('whatsapp.manage'));
  }

  async health(organizationId: string): Promise<Record<string, unknown>> {
    return this.publicStatus(await this.ensureChannel(organizationId), false);
  }

  async enable(
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ): Promise<Record<string, unknown>> {
    const channel = await this.requireConfiguredChannel(user.organizationId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.whatsAppWebBridgeChannel.update({
        where: { organizationId_id: { organizationId: user.organizationId, id: channel.id } },
        data: { enabled: true, status: WhatsAppWebBridgeStatus.DISCONNECTED, lastError: null },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'WHATSAPP_WEB_BRIDGE_ENABLED',
        tableName: 'WhatsAppWebBridgeChannel',
        recordId: row.id,
        newValue: toJson({ enabled: true }),
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
      return row;
    });
    return this.publicStatus(updated, true);
  }

  async disable(
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ): Promise<Record<string, unknown>> {
    const channel = await this.ensureChannel(user.organizationId);
    if (!channel) return { configured: false, enabled: false, readOnly: true };
    this.qrByChannel.delete(channel.id);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.whatsAppWebBridgeChannel.update({
        where: { organizationId_id: { organizationId: user.organizationId, id: channel.id } },
        data: { enabled: false, status: WhatsAppWebBridgeStatus.DISABLED, lastError: null },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'WHATSAPP_WEB_BRIDGE_DISABLED',
        tableName: 'WhatsAppWebBridgeChannel',
        recordId: row.id,
        newValue: toJson({ enabled: false }),
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
      return row;
    });
    await this.callBridge('/cancel', metadata.requestId ?? channel.id).catch((error: unknown) => {
      this.logger.warn(
        error instanceof Error ? error.message : 'No fue posible detener el bridge.',
      );
    });
    return this.publicStatus(updated, true);
  }

  async control(
    user: AuthenticatedUser,
    metadata: RequestMetadata,
    action: 'pair' | 'reconnect' | 'cancel' | 'unlink',
  ): Promise<Record<string, unknown>> {
    const channel = await this.requireConfiguredChannel(user.organizationId);
    if (!channel.enabled) return { requested: false, reason: 'BRIDGE_DISABLED', readOnly: true };
    const response = await this.callBridge(`/${action}`, metadata.requestId ?? channel.id);
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: `WHATSAPP_WEB_BRIDGE_${action.toUpperCase()}_REQUESTED`,
      tableName: 'WhatsAppWebBridgeChannel',
      recordId: channel.id,
      requestId: metadata.requestId,
      ip: metadata.ipAddress,
    });
    return { requested: true, readOnly: true, ...response };
  }

  async claimInternalRequest(
    channelKey: string,
    requestId: string,
    signature: string,
  ): Promise<{ id: string; organizationId: string; enabled: boolean }> {
    const channel = await this.prisma.whatsAppWebBridgeChannel.findUnique({
      where: { channelKey },
      select: { id: true, organizationId: true, enabled: true, deletedAt: true },
    });
    if (!channel || channel.deletedAt || !channel.enabled)
      throw new ConflictException('El canal WhatsApp Web no está habilitado.');
    try {
      await this.prisma.whatsAppWebBridgeRequest.create({
        data: {
          organizationId: channel.organizationId,
          channelId: channel.id,
          requestId,
          signature,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Solicitud del bridge repetida.');
      }
      throw error;
    }
    return channel;
  }

  async receiveQr(
    channel: { id: string; organizationId: string },
    input: WhatsAppWebBridgeQrInput,
  ): Promise<void> {
    const expiresAt = safeDate(input.expiresAt, 'expiresAt') ?? new Date(Date.now() + 120_000);
    if (
      typeof input.qr !== 'string' ||
      input.qr.trim().length === 0 ||
      input.qr.length > MAX_QR_LENGTH
    )
      throw new BadRequestException('El QR del bridge no es válido.');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.whatsAppWebBridgeChannel.update({
        where: { organizationId_id: { organizationId: channel.organizationId, id: channel.id } },
        data: { status: WhatsAppWebBridgeStatus.PAIRING, lastError: null },
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'ChannelQrUpdated',
        organizationId: channel.organizationId,
        aggregateType: 'WhatsAppWebBridgeChannel',
        aggregateId: channel.id,
        requestId: input.requestId,
        payload: toJson({ channel: 'WHATSAPP_WEB_BRIDGE', expiresAt: expiresAt.toISOString() }),
      });
    });
    this.qrByChannel.set(channel.id, { value: input.qr, expiresAt });
  }

  async receiveStatus(
    channel: { id: string; organizationId: string },
    input: WhatsAppWebBridgeStatusInput,
  ): Promise<void> {
    if (!isBridgeStatus(input.status))
      throw new BadRequestException('El estado del bridge no es válido.');
    const now = safeDate(input.connectedAt, 'connectedAt') ?? new Date();
    const connected = input.status === 'CONNECTED';
    if (connected) this.qrByChannel.delete(channel.id);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.whatsAppWebBridgeChannel.update({
        where: { organizationId_id: { organizationId: channel.organizationId, id: channel.id } },
        data: {
          status: this.mapStatus(input.status),
          lastHeartbeatAt: new Date(),
          ...(connected
            ? {
                lastConnectedAt: now,
                lastDisconnectedAt: null,
                phoneNumberMasked: this.maskedNumber(input.phoneNumber),
              }
            : {
                lastDisconnectedAt: new Date(),
                ...(input.phoneNumber
                  ? { phoneNumberMasked: this.maskedNumber(input.phoneNumber) }
                  : {}),
              }),
          ...(input.reconnectCount !== undefined ? { reconnectCount: input.reconnectCount } : {}),
          ...(input.historicalDiscarded !== undefined
            ? { historicalDiscarded: input.historicalDiscarded }
            : {}),
          lastError: input.error?.slice(0, 500) ?? null,
        },
      });
      if (connected) {
        await transaction.whatsAppWebBridgeChannel.updateMany({
          where: {
            organizationId: channel.organizationId,
            id: channel.id,
            ingestionStartedAt: null,
          },
          data: { ingestionStartedAt: now },
        });
      }
      await this.outbox.enqueueWithClient(transaction, {
        eventType:
          input.status === 'CONNECTED'
            ? 'ChannelConnected'
            : input.status === 'AUTHENTICATION_ERROR'
              ? 'ChannelAuthenticationFailed'
              : 'ChannelDisconnected',
        organizationId: channel.organizationId,
        aggregateType: 'WhatsAppWebBridgeChannel',
        aggregateId: channel.id,
        requestId: input.requestId,
        payload: toJson({ channel: 'WHATSAPP_WEB_BRIDGE', status: input.status }),
      });
    });
    if (input.status === 'AUTHENTICATION_ERROR') this.metrics.increment('authentication_errors');
  }

  async receiveHeartbeat(
    channel: { id: string; organizationId: string },
    input: WhatsAppWebBridgeHeartbeatInput,
  ): Promise<void> {
    if (input.status !== undefined && !isBridgeStatus(input.status))
      throw new BadRequestException('El estado del bridge no es válido.');
    await this.prisma.whatsAppWebBridgeChannel.update({
      where: { organizationId_id: { organizationId: channel.organizationId, id: channel.id } },
      data: {
        lastHeartbeatAt: new Date(),
        ...(input.status ? { status: this.mapStatus(input.status) } : {}),
      },
    });
  }

  async receiveMessage(
    channel: { id: string; organizationId: string },
    input: WhatsAppWebBridgeMessageInput,
  ): Promise<{ accepted: boolean; duplicate: boolean; historical: boolean; messageId?: string }> {
    if (
      typeof input.externalMessageId !== 'string' ||
      input.externalMessageId.trim().length === 0 ||
      input.externalMessageId.length > 255
    )
      throw new BadRequestException('externalMessageId no es válido.');
    if (typeof input.phone !== 'string' || input.phone.trim().length === 0)
      throw new BadRequestException('El mensaje no tiene teléfono válido.');
    if (!isBridgeMessageType(input.type) || input.type === 'UNKNOWN')
      throw new BadRequestException('El tipo de mensaje del bridge no es compatible.');
    if (
      input.country !== undefined &&
      (typeof input.country !== 'string' || !/^[A-Za-z]{2}$/.test(input.country.trim()))
    )
      throw new BadRequestException('country no es válido.');
    const occurredAt = safeDate(input.occurredAt, 'occurredAt');
    if (!occurredAt) throw new BadRequestException('occurredAt es obligatorio.');
    const existing = await this.prisma.whatsAppMessage.findFirst({
      where: { organizationId: channel.organizationId, externalMessageId: input.externalMessageId },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.whatsAppWebBridgeChannel.update({
        where: { organizationId_id: { organizationId: channel.organizationId, id: channel.id } },
        data: { duplicatesAvoided: { increment: 1 }, lastHeartbeatAt: new Date() },
      });
      this.metrics.increment('readonly_duplicates_avoided');
      return { accepted: false, duplicate: true, historical: false, messageId: existing.id };
    }

    const normalized = this.phoneNormalizer.normalize(input.phone, input.country ?? null);
    if (!normalized) throw new BadRequestException('El mensaje no tiene teléfono válido.');
    if (input.phoneNormalized && input.phoneNormalized !== normalized.phoneNormalized)
      throw new BadRequestException('phoneNormalized no coincide con el teléfono recibido.');
    const channelRecord = await this.prisma.whatsAppWebBridgeChannel.findUniqueOrThrow({
      where: { organizationId_id: { organizationId: channel.organizationId, id: channel.id } },
      select: { ingestionStartedAt: true },
    });
    if (channelRecord.ingestionStartedAt && occurredAt < channelRecord.ingestionStartedAt) {
      await this.prisma.whatsAppWebBridgeChannel.update({
        where: { organizationId_id: { organizationId: channel.organizationId, id: channel.id } },
        data: { historicalDiscarded: { increment: 1 } },
      });
      return { accepted: false, duplicate: false, historical: true };
    }

    try {
      const result = await this.runInboundTransaction(async (transaction) => {
        const phoneNumberId = `${BRIDGE_PHONE_PREFIX}${channel.id}`;
        const connection = await transaction.whatsAppConnection.upsert({
          where: {
            organizationId_phoneNumberId: {
              organizationId: channel.organizationId,
              phoneNumberId,
            },
          },
          create: {
            organizationId: channel.organizationId,
            wabaId: 'WHATSAPP_WEB_BRIDGE',
            phoneNumberId,
            businessPhoneNumber: 'WHATSAPP_WEB_BRIDGE',
            accessTokenEncrypted: 'NOT_APPLICABLE',
            appSecretEncrypted: 'NOT_APPLICABLE',
            webhookVerifyTokenEncrypted: 'NOT_APPLICABLE',
            status: WhatsAppConnectionStatus.CONNECTED,
          },
          update: { status: WhatsAppConnectionStatus.CONNECTED, deletedAt: null },
        });
        const phoneNumber = await transaction.whatsAppPhoneNumber.upsert({
          where: {
            organizationId_phoneNumberId: {
              organizationId: channel.organizationId,
              phoneNumberId,
            },
          },
          create: {
            organizationId: channel.organizationId,
            connectionId: connection.id,
            phoneNumberId,
            displayPhoneNumber: 'WHATSAPP_WEB_BRIDGE',
          },
          update: { connectionId: connection.id, active: true, deletedAt: null },
        });
        let contact = await transaction.contact.findFirst({
          where: {
            organizationId: channel.organizationId,
            phoneNormalized: normalized.phoneNormalized,
            deletedAt: null,
          },
        });
        if (!contact) {
          contact = await transaction.contact.create({
            data: {
              organizationId: channel.organizationId,
              firstName: input.contactName?.trim() || null,
              phone: normalized.phone,
              phoneNormalized: normalized.phoneNormalized,
              country: input.country?.trim().toUpperCase() || null,
              source: 'WHATSAPP',
              lastActivityAt: occurredAt,
            },
          });
        } else {
          contact = await transaction.contact.update({
            where: {
              organizationId_id: { organizationId: channel.organizationId, id: contact.id },
            },
            data: {
              lastActivityAt: occurredAt,
              ...(contact.firstName
                ? {}
                : input.contactName?.trim()
                  ? { firstName: input.contactName.trim() }
                  : {}),
              ...(contact.country
                ? {}
                : input.country?.trim()
                  ? { country: input.country.trim().toUpperCase() }
                  : {}),
            },
          });
        }
        let opportunity = await transaction.opportunity.findFirst({
          where: {
            organizationId: channel.organizationId,
            contactId: contact.id,
            deletedAt: null,
            pipelineStage: { category: 'OPEN', active: true, deletedAt: null },
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, pipelineStageId: true },
        });
        if (!opportunity) {
          const stage = await transaction.pipelineStage.findFirst({
            where: {
              organizationId: channel.organizationId,
              category: 'OPEN',
              active: true,
              deletedAt: null,
            },
            orderBy: { order: 'asc' },
            select: { id: true },
          });
          if (!stage) throw new ConflictException('No existe una etapa abierta para el lead.');
          opportunity = await transaction.opportunity.create({
            data: {
              organizationId: channel.organizationId,
              contactId: contact.id,
              pipelineStageId: stage.id,
              userId: contact.userId,
              title: opportunityTitle(
                contact.firstName,
                contact.lastName,
                normalized.phoneNormalized,
              ),
              lastStageChangedAt: occurredAt,
            },
            select: { id: true, pipelineStageId: true },
          });
          await transaction.opportunityStageHistory.create({
            data: {
              organizationId: channel.organizationId,
              opportunityId: opportunity.id,
              toStageId: stage.id,
              reason: 'Lead recibido por WhatsApp Web Bridge',
              changedAt: occurredAt,
            },
          });
        }
        const conversationWhere = {
          organizationId_phoneNumberId_externalContactPhoneNormalized: {
            organizationId: channel.organizationId,
            phoneNumberId: phoneNumber.id,
            externalContactPhoneNormalized: normalized.phoneNormalized,
          },
        } as const;
        const existingConversation = await transaction.whatsAppConversation.findUnique({
          where: conversationWhere,
          select: { id: true },
        });
        const conversation = await transaction.whatsAppConversation.upsert({
          where: {
            ...conversationWhere,
          },
          create: {
            organizationId: channel.organizationId,
            connectionId: connection.id,
            phoneNumberId: phoneNumber.id,
            contactId: contact.id,
            externalContactPhone: normalized.phone,
            externalContactPhoneNormalized: normalized.phoneNormalized,
            externalContactName: input.contactName?.trim() || null,
            status: 'OPEN',
            windowStartedAt: occurredAt,
            windowExpiresAt: new Date(occurredAt.getTime() + 86_400_000),
            lastMessageAt: occurredAt,
            lastInboundAt: occurredAt,
            unreadCount: 1,
          },
          update: {
            contactId: contact.id,
            externalContactPhone: normalized.phone,
            ...(input.contactName?.trim() ? { externalContactName: input.contactName.trim() } : {}),
            status: 'OPEN',
            windowStartedAt: { set: occurredAt },
            windowExpiresAt: { set: new Date(occurredAt.getTime() + 86_400_000) },
            lastMessageAt: occurredAt,
            lastInboundAt: occurredAt,
            unreadCount: { increment: 1 },
          },
        });
        const created = await transaction.whatsAppMessage.create({
          data: {
            organizationId: channel.organizationId,
            conversationId: conversation.id,
            connectionId: connection.id,
            phoneNumberId: phoneNumber.id,
            contactId: contact.id,
            externalMessageId: input.externalMessageId,
            idempotencyKey: `web-bridge:${input.externalMessageId}`,
            direction: WhatsAppMessageDirection.INBOUND,
            type: mapBridgeMessageType(input.type),
            status: WhatsAppMessageDeliveryStatus.DELIVERED,
            text: input.text?.slice(0, 10_000) ?? null,
            mediaMimeType: input.mediaMimeType?.slice(0, 160) ?? null,
            mediaFilename: input.mediaFilename?.slice(0, 240) ?? null,
            caption: input.caption?.slice(0, 2_000) ?? null,
            location: input.location ? (input.location as Prisma.InputJsonValue) : Prisma.JsonNull,
            sanitizedPayload: toJson({
              provider: 'BAILEYS_WHATSAPP_WEB_BRIDGE',
              type: input.type,
              ...(input.quotedMessageId ? { quotedMessageId: input.quotedMessageId } : {}),
            }),
            requestId: input.requestId,
            createdAt: occurredAt,
          },
        });
        await transaction.activity.create({
          data: {
            organizationId: channel.organizationId,
            contactId: contact.id,
            opportunityId: opportunity.id,
            type: ActivityType.MESSAGE,
            title: 'Mensaje de WhatsApp Web recibido',
            description: input.text?.slice(0, 500) || 'Mensaje multimedia recibido.',
            occurredAt,
            metadata: toJson({ channel: 'WHATSAPP_WEB_BRIDGE', messageId: created.id }),
            requestId: input.requestId,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: channel.organizationId,
          action: 'WHATSAPP_WEB_BRIDGE_MESSAGE_RECEIVED',
          tableName: 'WhatsAppMessage',
          recordId: created.id,
          newValue: toJson({
            conversationId: conversation.id,
            opportunityId: opportunity.id,
            type: input.type,
          }),
          requestId: input.requestId,
        });
        await this.outbox.enqueueWithClient(transaction, {
          eventType: existingConversation ? 'ConversationUpdated' : 'ConversationCreated',
          organizationId: channel.organizationId,
          aggregateType: 'WhatsAppConversation',
          aggregateId: conversation.id,
          requestId: input.requestId,
          deduplicationKey: `WhatsAppWebBridge:${existingConversation ? 'ConversationUpdated' : 'ConversationCreated'}:${conversation.id}:${created.id}`,
          payload: toJson({
            conversationId: conversation.id,
            contactId: contact.id,
            messageId: created.id,
          }),
        });
        await this.outbox.enqueueWithClient(transaction, {
          eventType: 'MessageReceived',
          organizationId: channel.organizationId,
          aggregateType: 'WhatsAppMessage',
          aggregateId: created.id,
          requestId: input.requestId,
          deduplicationKey: `WhatsAppWebBridge:MessageReceived:${created.id}`,
          payload: toJson({
            conversationId: conversation.id,
            contactId: contact.id,
            messageId: created.id,
          }),
        });
        return { messageId: created.id, conversationId: conversation.id, contactId: contact.id };
      });
      await this.prisma.whatsAppWebBridgeChannel.update({
        where: { organizationId_id: { organizationId: channel.organizationId, id: channel.id } },
        data: { lastMessageAt: occurredAt, lastHeartbeatAt: new Date() },
      });
      await this.prisma.whatsAppWebBridgeChannel.updateMany({
        where: { organizationId: channel.organizationId, id: channel.id, firstAcceptedAt: null },
        data: { firstAcceptedAt: occurredAt },
      });
      this.metrics.increment('messages_received');
      this.events.publish({
        type: 'message.received',
        organizationId: channel.organizationId,
        conversationId: result.conversationId,
        requestId: input.requestId,
        occurredAt: occurredAt.toISOString(),
        payload: { messageId: result.messageId, channel: 'WHATSAPP_WEB_BRIDGE' },
      });
      return { accepted: true, duplicate: false, historical: false, messageId: result.messageId };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.whatsAppMessage.findFirst({
          where: {
            organizationId: channel.organizationId,
            externalMessageId: input.externalMessageId,
          },
          select: { id: true },
        });
        if (winner)
          return { accepted: false, duplicate: true, historical: false, messageId: winner.id };
      }
      this.metrics.increment('events_failed');
      throw error;
    }
  }

  private async ensureChannel(organizationId: string) {
    if (!this.configuration.channelKey) return null;
    return this.prisma.whatsAppWebBridgeChannel.upsert({
      where: { organizationId },
      create: {
        organizationId,
        channelKey: this.configuration.channelKey,
        status: WhatsAppWebBridgeStatus.DISABLED,
      },
      update: {},
    });
  }

  private async requireConfiguredChannel(organizationId: string) {
    if (!this.configuration.enabled || !this.configuration.channelKey) {
      throw new ConflictException('El bridge WhatsApp Web está deshabilitado o incompleto.');
    }
    const channel = await this.ensureChannel(organizationId);
    if (!channel) throw new ConflictException('Canal WhatsApp Web no configurado.');
    return channel;
  }

  private async runInboundTransaction<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        lastError = error;
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2002' || error.code === 'P2034');
        if (!retryable || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('La transacción del bridge falló.');
  }

  private async callBridge(path: string, requestId: string): Promise<Record<string, unknown>> {
    const body = JSON.stringify({ requestId });
    const response = await fetch(`${this.configuration.apiUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: this.security.headers(body, requestId),
      body,
    });
    if (!response.ok) throw new ConflictException('El bridge WhatsApp Web no aceptó la operación.');
    const value: unknown = await response.json().catch(() => ({}));
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private publicStatus(
    channel: {
      id: string;
      enabled: boolean;
      status: WhatsAppWebBridgeStatus;
      phoneNumberMasked: string | null;
      lastConnectedAt: Date | null;
      lastDisconnectedAt: Date | null;
      lastMessageAt: Date | null;
      lastHeartbeatAt: Date | null;
      ingestionStartedAt: Date | null;
      firstAcceptedAt: Date | null;
      reconnectCount: number;
      historicalDiscarded: number;
      duplicatesAvoided: number;
      errorCount: number;
      lastError: string | null;
    } | null,
    canManage: boolean,
  ): Record<string, unknown> {
    const qr = channel ? this.qrByChannel.get(channel.id) : undefined;
    const visibleQr = canManage && qr && qr.expiresAt > new Date() ? qr : null;
    if (qr && !visibleQr) this.qrByChannel.delete(channel?.id ?? '');
    return {
      channel: 'WHATSAPP_WEB_BRIDGE',
      provider: 'BAILEYS_WHATSAPP_WEB_BRIDGE',
      configured:
        this.configuration.enabled &&
        Boolean(this.configuration.channelKey) &&
        this.configuration.sessionEncryptionKeyConfigured,
      enabled: channel?.enabled ?? false,
      status: channel?.status ?? WhatsAppWebBridgeStatus.DISABLED,
      readOnly: true,
      externalWriteEnabled: false,
      number: channel?.phoneNumberMasked ?? null,
      qr: visibleQr?.value ?? null,
      qrExpiresAt: visibleQr?.expiresAt ?? null,
      connectedAt: channel?.lastConnectedAt ?? null,
      disconnectedAt: channel?.lastDisconnectedAt ?? null,
      lastMessageAt: channel?.lastMessageAt ?? null,
      lastHeartbeatAt: channel?.lastHeartbeatAt ?? null,
      ingestionStartedAt: channel?.ingestionStartedAt ?? null,
      firstAcceptedAt: channel?.firstAcceptedAt ?? null,
      reconnects: channel?.reconnectCount ?? 0,
      historicalDiscarded: channel?.historicalDiscarded ?? 0,
      duplicatesAvoided: channel?.duplicatesAvoided ?? 0,
      errorCount: channel?.errorCount ?? 0,
      lastError: channel?.lastError ?? null,
      missingConfiguration: this.configuration.missing,
    };
  }

  private mapStatus(status: string): WhatsAppWebBridgeStatus {
    if (status === 'PAIRING') return WhatsAppWebBridgeStatus.PAIRING;
    if (status === 'CONNECTED') return WhatsAppWebBridgeStatus.CONNECTED;
    if (status === 'AUTHENTICATION_ERROR') return WhatsAppWebBridgeStatus.AUTHENTICATION_ERROR;
    if (status === 'ERROR') return WhatsAppWebBridgeStatus.ERROR;
    return WhatsAppWebBridgeStatus.DISCONNECTED;
  }

  private maskedNumber(value: string | undefined): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    return digits.length < 4 ? '••••' : `••••${digits.slice(-4)}`;
  }
}
