import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WhatsAppMessageDeliveryStatus, WhatsAppMessageDirection } from '@prisma/client';

import { OutboxService } from '../../../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { AppConfiguration } from '../../../../config/configuration';
import { AuditService } from '../../../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../../../auth/auth.types';
import {
  WhatsAppWebMessageInput,
  WhatsAppWebQrInput,
  WhatsAppWebStatusInput,
} from './whatsapp-web-readonly.types';

const CHANNEL = 'WHATSAPP_WEB_READ_ONLY' as const;
const WEB_PHONE_ID_PREFIX = 'web-read-only:';

function safeDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function maskedNumber(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length < 4 ? '••••' : `••••${digits.slice(-4)}`;
}

@Injectable()
export class WhatsAppWebReadOnlyService {
  private readonly logger = new Logger(WhatsAppWebReadOnlyService.name);
  private readonly configuration: AppConfiguration['whatsappReader'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    config: ConfigService,
  ) {
    this.configuration = config.getOrThrow<AppConfiguration>('app').whatsappReader;
  }

  async status(organizationId: string): Promise<Record<string, unknown>> {
    const checkpoint = await this.ensureCheckpoint(organizationId);
    const publicCheckpoint = this.publicCheckpoint(checkpoint);
    return {
      channel: CHANNEL,
      provider: 'BAILEYS_WHATSAPP_WEB',
      configured: this.isEnabledForOrganization(organizationId),
      missingConfiguration: this.isEnabledForOrganization(organizationId)
        ? []
        : this.configuration.missing,
      ...publicCheckpoint,
    };
  }

  async requestPairing(user: AuthenticatedUser, metadata: RequestMetadata) {
    const checkpoint = await this.ensureCheckpoint(user.organizationId);
    if (!this.isEnabledForOrganization(user.organizationId)) {
      return {
        ...this.publicCheckpoint(checkpoint),
        requested: false,
        reason: 'READER_NOT_CONFIGURED',
        missingConfiguration: this.configuration.missing,
        readOnly: true,
      };
    }
    await this.prisma.communicationSyncCheckpoint.update({
      where: { id: checkpoint.id },
      data: {
        readerStatus: 'PAIRING',
        readerQr: null,
        readerQrExpiresAt: null,
        lastError: null,
        status: 'IDLE',
      },
    });
    try {
      const response = await fetch(`${this.configuration.serviceUrl.replace(/\/$/, '')}/pair`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.configuration.serviceToken ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: user.organizationId,
          requestId: metadata.requestId,
        }),
      });
      if (!response.ok) throw new Error(`Reader respondió HTTP ${response.status}.`);
    } catch (error: unknown) {
      await this.prisma.communicationSyncCheckpoint.update({
        where: { id: checkpoint.id },
        data: { readerStatus: 'ERROR', lastError: 'No fue posible iniciar el pairing.' },
      });
      this.logger.warn(
        error instanceof Error ? error.message : 'No fue posible iniciar el pairing.',
      );
      return { requested: false, reason: 'READER_UNAVAILABLE', readOnly: true };
    }
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'WHATSAPP_WEB_PAIRING_REQUESTED',
      tableName: 'CommunicationSyncCheckpoint',
      recordId: checkpoint.id,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return { ...(await this.status(user.organizationId)), requested: true };
  }

  async reconnect(user: AuthenticatedUser, metadata: RequestMetadata) {
    return this.control(user, metadata, 'reconnect');
  }

  async cancelPairing(user: AuthenticatedUser, metadata: RequestMetadata) {
    return this.control(user, metadata, 'cancel');
  }

  async unlink(user: AuthenticatedUser, metadata: RequestMetadata) {
    const checkpoint = await this.ensureCheckpoint(user.organizationId);
    await this.prisma.communicationSyncCheckpoint.update({
      where: { id: checkpoint.id },
      data: {
        readerStatus: 'DISCONNECTED',
        readerQr: null,
        readerQrExpiresAt: null,
        readerDisconnectedAt: new Date(),
        lastError: null,
      },
    });
    await this.control(user, metadata, 'unlink');
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'WHATSAPP_WEB_UNLINKED',
      tableName: 'CommunicationSyncCheckpoint',
      recordId: checkpoint.id,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return this.status(user.organizationId);
  }

  async receiveQr(organizationId: string, input: WhatsAppWebQrInput): Promise<void> {
    const checkpoint = await this.ensureCheckpoint(organizationId);
    if (checkpoint.readerStatus === 'CONNECTED') return;
    await this.prisma.communicationSyncCheckpoint.update({
      where: { id: checkpoint.id },
      data: {
        readerStatus: 'PAIRING',
        readerQr: input.qr.slice(0, 4096),
        readerQrExpiresAt: safeDate(input.expiresAt) ?? new Date(Date.now() + 120_000),
        lastError: null,
      },
    });
  }

  async receiveStatus(organizationId: string, input: WhatsAppWebStatusInput): Promise<void> {
    const checkpoint = await this.ensureCheckpoint(organizationId);
    const connected = input.status === 'CONNECTED';
    const now = safeDate(input.connectedAt) ?? new Date();
    const started =
      connected && !checkpoint.readerIngestionStartedAt ? now : checkpoint.readerIngestionStartedAt;
    await this.prisma.communicationSyncCheckpoint.update({
      where: { id: checkpoint.id },
      data: {
        readerStatus: input.status,
        ...(connected ? { readerQr: null, readerQrExpiresAt: null } : {}),
        readerConnectedAt: connected ? now : checkpoint.readerConnectedAt,
        readerDisconnectedAt: connected ? null : new Date(),
        readerNumberMasked: maskedNumber(input.phoneNumber),
        readerReconnectCount: input.reconnectCount ?? checkpoint.readerReconnectCount,
        readerIngestionStartedAt: started,
        readerLastSyncAt: new Date(),
        ...(input.historicalDiscarded !== undefined
          ? { historicalDiscarded: input.historicalDiscarded }
          : {}),
        lastError: input.error?.slice(0, 500) ?? null,
      },
    });
  }

  async receiveMessage(
    organizationId: string,
    input: WhatsAppWebMessageInput,
  ): Promise<{ accepted: boolean; duplicate: boolean; historical: boolean }> {
    const checkpoint = await this.ensureCheckpoint(organizationId);
    const occurredAt = safeDate(input.occurredAt) ?? new Date();
    if (checkpoint.readerIngestionStartedAt && occurredAt < checkpoint.readerIngestionStartedAt) {
      await this.prisma.communicationSyncCheckpoint.update({
        where: { id: checkpoint.id },
        data: { historicalDiscarded: { increment: 1 } },
      });
      return { accepted: false, duplicate: false, historical: true };
    }
    const existing = await this.prisma.whatsAppMessage.findFirst({
      where: { organizationId, externalMessageId: input.externalMessageId },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.communicationSyncCheckpoint.update({
        where: { id: checkpoint.id },
        data: { duplicatesAvoided: { increment: 1 } },
      });
      return { accepted: false, duplicate: true, historical: false };
    }
    const phone = input.phone.trim();
    const normalized = input.phoneNormalized.trim();
    if (!phone || !normalized)
      throw new ConflictException('El mensaje del reader no tiene teléfono normalizado.');
    const phoneNumberId = `${WEB_PHONE_ID_PREFIX}${organizationId}`;
    const result = await this.prisma.$transaction(async (transaction) => {
      let connection = await transaction.whatsAppConnection.findFirst({
        where: { organizationId, phoneNumberId },
      });
      if (!connection) {
        connection = await transaction.whatsAppConnection.create({
          data: {
            organizationId,
            wabaId: 'WHATSAPP_WEB_READ_ONLY',
            phoneNumberId,
            businessPhoneNumber: 'READ_ONLY',
            accessTokenEncrypted: 'READ_ONLY',
            appSecretEncrypted: 'READ_ONLY',
            webhookVerifyTokenEncrypted: 'READ_ONLY',
            status: 'CONNECTED',
          },
        });
      }
      let phoneNumber = await transaction.whatsAppPhoneNumber.findFirst({
        where: { organizationId, phoneNumberId },
      });
      if (!phoneNumber)
        phoneNumber = await transaction.whatsAppPhoneNumber.create({
          data: {
            organizationId,
            connectionId: connection.id,
            phoneNumberId,
            displayPhoneNumber: 'READ_ONLY',
          },
        });
      let contact = await transaction.contact.findFirst({
        where: { organizationId, phoneNormalized: normalized, deletedAt: null },
        select: { id: true },
      });
      if (!contact)
        contact = await transaction.contact.create({
          data: {
            organizationId,
            phone,
            phoneNormalized: normalized,
            firstName: input.contactName?.trim() ?? null,
            source: 'WHATSAPP_WEB',
          },
          select: { id: true },
        });
      await transaction.contact.updateMany({
        where: { organizationId, id: contact.id, deletedAt: null },
        data: { lastActivityAt: occurredAt },
      });
      let conversation = await transaction.whatsAppConversation.findFirst({
        where: {
          organizationId,
          phoneNumberId: phoneNumber.id,
          externalContactPhoneNormalized: normalized,
          deletedAt: null,
        },
      });
      if (!conversation)
        conversation = await transaction.whatsAppConversation.create({
          data: {
            organizationId,
            connectionId: connection.id,
            phoneNumberId: phoneNumber.id,
            contactId: contact.id,
            externalContactPhone: phone,
            externalContactPhoneNormalized: normalized,
            externalContactName: input.contactName?.trim() ?? null,
            windowStartedAt: occurredAt,
            lastMessageAt: occurredAt,
            lastInboundAt: occurredAt,
            unreadCount: 1,
          },
        });
      else
        conversation = await transaction.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: occurredAt,
            lastInboundAt: occurredAt,
            unreadCount: { increment: 1 },
            externalContactPhone: phone,
            ...(input.contactName ? { externalContactName: input.contactName.trim() } : {}),
          },
        });
      const messageData: Prisma.WhatsAppMessageUncheckedCreateInput = {
        organizationId,
        conversationId: conversation.id,
        connectionId: connection.id,
        phoneNumberId: phoneNumber.id,
        contactId: contact.id,
        externalMessageId: input.externalMessageId,
        idempotencyKey: `web:${input.externalMessageId}`,
        direction: WhatsAppMessageDirection.INBOUND,
        type: input.type,
        status: WhatsAppMessageDeliveryStatus.DELIVERED,
        text: input.text?.slice(0, 10_000) ?? null,
        mediaMimeType: input.mediaMimeType?.slice(0, 160) ?? null,
        mediaFilename: input.mediaFilename?.slice(0, 240) ?? null,
        caption: input.caption?.slice(0, 2_000) ?? null,
        location: input.location ? (input.location as Prisma.InputJsonValue) : Prisma.JsonNull,
        sanitizedPayload: { provider: 'BAILEYS_WHATSAPP_WEB', readOnly: true, type: input.type },
        requestId: input.requestId,
        createdAt: occurredAt,
      };
      const message = await transaction.whatsAppMessage.create({ data: messageData });
      await transaction.activity.create({
        data: {
          organizationId,
          contactId: contact.id,
          type: 'MESSAGE',
          title: 'Nuevo mensaje de WhatsApp',
          description: input.text?.slice(0, 500) || 'Mensaje multimedia recibido.',
          occurredAt,
          metadata: { channel: 'WHATSAPP_WEB_READ_ONLY', messageId: message.id },
          requestId: input.requestId,
        },
      });
      return { message, checkpointId: checkpoint.id };
    });
    await this.prisma.communicationSyncCheckpoint.update({
      where: { id: result.checkpointId },
      data: {
        readerLastMessageAt: occurredAt,
        readerLastSyncAt: new Date(),
        ...(checkpoint.readerFirstAcceptedAt ? {} : { readerFirstAcceptedAt: occurredAt }),
        messagesImported: { increment: 1 },
      },
    });
    await this.outbox.enqueue({
      eventType: 'MessageReceived',
      organizationId,
      aggregateType: 'WhatsAppMessage',
      aggregateId: result.message.id,
      requestId: input.requestId,
      payload: {
        messageId: result.message.id,
        conversationId: result.message.conversationId,
        readOnly: true,
        channel: 'WHATSAPP_WEB',
      },
    });
    return { accepted: true, duplicate: false, historical: false };
  }

  private async control(
    user: AuthenticatedUser,
    metadata: RequestMetadata,
    action: 'reconnect' | 'cancel' | 'unlink',
  ) {
    if (!this.isEnabledForOrganization(user.organizationId))
      return { requested: false, reason: 'READER_NOT_CONFIGURED', readOnly: true };
    const response = await fetch(`${this.configuration.serviceUrl.replace(/\/$/, '')}/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.configuration.serviceToken ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organizationId: user.organizationId, requestId: metadata.requestId }),
    });
    if (!response.ok) throw new ConflictException('El reader no aceptó la operación.');
    return { requested: true, action, readOnly: true };
  }

  private async ensureCheckpoint(organizationId: string) {
    return this.prisma.communicationSyncCheckpoint.upsert({
      where: { organizationId_channel: { organizationId, channel: CHANNEL } },
      create: { organizationId, channel: CHANNEL, readerStatus: 'DISCONNECTED' },
      update: {},
    });
  }

  private isEnabledForOrganization(organizationId: string): boolean {
    return this.configuration.enabled && this.configuration.organizationId === organizationId;
  }

  private publicCheckpoint(checkpoint: {
    id: string;
    readerStatus: string | null;
    readerQr: string | null;
    readerQrExpiresAt: Date | null;
    readerConnectedAt: Date | null;
    readerDisconnectedAt: Date | null;
    readerLastMessageAt: Date | null;
    readerLastSyncAt: Date | null;
    readerNumberMasked: string | null;
    historicalDiscarded: number;
    duplicatesAvoided: number;
    readerReconnectCount: number;
    readerIngestionStartedAt: Date | null;
    readerFirstAcceptedAt: Date | null;
    lastError: string | null;
  }) {
    const qrVisible =
      checkpoint.readerStatus === 'PAIRING' &&
      checkpoint.readerQrExpiresAt !== null &&
      checkpoint.readerQrExpiresAt > new Date();
    return {
      status: checkpoint.readerStatus ?? 'DISCONNECTED',
      qr: qrVisible ? checkpoint.readerQr : null,
      qrExpiresAt: qrVisible ? checkpoint.readerQrExpiresAt : null,
      connectedAt: checkpoint.readerConnectedAt,
      disconnectedAt: checkpoint.readerDisconnectedAt,
      lastMessageAt: checkpoint.readerLastMessageAt,
      lastSynchronizationAt: checkpoint.readerLastSyncAt,
      number: checkpoint.readerNumberMasked,
      historicalDiscarded: checkpoint.historicalDiscarded,
      duplicatesAvoided: checkpoint.duplicatesAvoided,
      reconnects: checkpoint.readerReconnectCount,
      ingestionStartedAt: checkpoint.readerIngestionStartedAt,
      firstAcceptedAt: checkpoint.readerFirstAcceptedAt,
      lastError: checkpoint.lastError,
      readOnly: true,
      externalWriteEnabled: false,
    };
  }
}
