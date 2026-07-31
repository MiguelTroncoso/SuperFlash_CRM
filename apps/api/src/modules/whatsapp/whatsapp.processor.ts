import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ActivityType,
  WhatsAppMessageDeliveryStatus,
  WhatsAppMessageType,
  WhatsAppWebhookEventStatus,
} from '@prisma/client';

import {
  ApplicationEventBus,
  CommercialEvent,
} from '../../infrastructure/events/application-event-bus';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PhoneNormalizerService } from '../contacts/phone/phone-normalizer.service';
import {
  JsonRecord,
  isRecord,
  messageTimestamp,
  recordValue,
  sanitizePayload,
  stringValue,
  toInputJson,
  whatsappMessageType,
} from './whatsapp.types';

@Injectable()
export class WhatsAppProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppProcessor.name);
  private interval: NodeJS.Timeout | undefined;
  private running = false;
  private webhookHandler: ((event: CommercialEvent) => void) | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ApplicationEventBus,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly phoneNormalizer: PhoneNormalizerService,
  ) {}

  onModuleInit(): void {
    this.webhookHandler = (event: CommercialEvent) => {
      void this.processWebhookEvent(String(event.payload.webhookEventId ?? '')).catch(
        (error: unknown) => {
          this.logger.error(
            error instanceof Error ? error.message : 'WhatsApp webhook processing failed',
          );
        },
      );
    };
    this.events.on('WhatsAppWebhookReceived', this.webhookHandler);
    void this.processAvailable();
    this.interval = setInterval(() => void this.processAvailable(), 1_000);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    if (this.webhookHandler) this.events.off('WhatsAppWebhookReceived', this.webhookHandler);
    this.webhookHandler = undefined;
  }

  async processAvailable(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const webhooks = await this.claimWebhookEvents();
      for (const webhook of webhooks) await this.processWebhookEvent(webhook.id);
    } catch (error: unknown) {
      this.logger.error(error instanceof Error ? error.message : 'WhatsApp processing failed');
    } finally {
      this.running = false;
    }
  }

  private async claimWebhookEvents(): Promise<Array<{ id: string }>> {
    const now = new Date();
    const staleAt = new Date(now.getTime() - 5 * 60 * 1_000);
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.whatsAppWebhookEvent.findMany({
        where: {
          OR: [
            {
              status: {
                in: [WhatsAppWebhookEventStatus.PENDING, WhatsAppWebhookEventStatus.FAILED],
              },
              availableAt: { lte: now },
            },
            { status: WhatsAppWebhookEventStatus.PROCESSING, processingAt: { lt: staleAt } },
          ],
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      if (rows.length)
        await transaction.whatsAppWebhookEvent.updateMany({
          where: {
            id: { in: rows.map((row) => row.id) },
            status: { not: WhatsAppWebhookEventStatus.PROCESSED },
          },
          data: {
            status: WhatsAppWebhookEventStatus.PROCESSING,
            processingAt: now,
            attempts: { increment: 1 },
          },
        });
      return rows;
    });
  }

  private async processWebhookEvent(id: string): Promise<void> {
    if (!id) return;
    const event = await this.prisma.whatsAppWebhookEvent.findFirst({
      where: { id, status: WhatsAppWebhookEventStatus.PROCESSING },
    });
    if (!event) return;
    try {
      const payload = isRecord(event.payload) ? event.payload : {};
      await this.processPayload(event.organizationId, event.connectionId, event.requestId, payload);
      await this.prisma.whatsAppWebhookEvent.update({
        where: { organizationId_id: { organizationId: event.organizationId, id: event.id } },
        data: {
          status: WhatsAppWebhookEventStatus.PROCESSED,
          processingAt: null,
          processedAt: new Date(),
          lastError: null,
        },
      });
    } catch (error: unknown) {
      const delay = Math.min(300, 2 ** Math.min(8, event.attempts));
      await this.prisma.whatsAppWebhookEvent.update({
        where: { organizationId_id: { organizationId: event.organizationId, id: event.id } },
        data: {
          status: WhatsAppWebhookEventStatus.FAILED,
          processingAt: null,
          availableAt: new Date(Date.now() + delay * 1000),
          lastError: this.safeError(error),
        },
      });
      this.logger.error(`WhatsApp webhook ${event.id} failed`);
    }
  }

  private async processPayload(
    organizationId: string,
    connectionId: string,
    requestId: string,
    payload: JsonRecord,
  ): Promise<void> {
    for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
      const entryRecord = recordValue(entry);
      for (const change of Array.isArray(entryRecord?.changes) ? entryRecord.changes : []) {
        const value = recordValue(recordValue(change)?.value);
        if (!value) continue;
        const metadata = recordValue(value.metadata);
        const phoneNumberId = stringValue(metadata?.phone_number_id);
        if (!phoneNumberId) continue;
        const phone = await this.prisma.whatsAppPhoneNumber.findFirst({
          where: { organizationId, connectionId, phoneNumberId, active: true, deletedAt: null },
        });
        if (!phone) continue;
        for (const message of Array.isArray(value.messages) ? value.messages : [])
          await this.processInboundMessage(
            organizationId,
            connectionId,
            phone.id,
            requestId,
            value,
            message,
          );
        for (const status of Array.isArray(value.statuses) ? value.statuses : [])
          await this.processStatus(organizationId, requestId, status);
      }
    }
  }

  private async processInboundMessage(
    organizationId: string,
    connectionId: string,
    phoneNumberId: string,
    requestId: string,
    value: JsonRecord,
    rawMessage: unknown,
  ): Promise<void> {
    const message = recordValue(rawMessage);
    const externalMessageId = stringValue(message?.id);
    const from = stringValue(message?.from);
    if (!externalMessageId || !from) return;
    const existing = await this.prisma.whatsAppMessage.findFirst({
      where: { organizationId, externalMessageId },
    });
    if (existing) return;
    const normalized = this.phoneNormalizer.normalize(
      from.startsWith('+') ? from : `+${from}`,
      null,
    );
    if (!normalized) return;
    const profile = Array.isArray(value.contacts) ? recordValue(value.contacts[0]) : null;
    const profileName = stringValue(recordValue(profile?.profile)?.name);
    const type = whatsappMessageType(message?.type);
    const text = stringValue(recordValue(message?.text)?.body);
    const media = recordValue(message?.[String(message?.type ?? '')]);
    const timestamp = messageTimestamp(message?.timestamp);
    const sanitized = sanitizePayload(message);
    await this.prisma.$transaction(async (transaction) => {
      const alreadyCreated = await transaction.whatsAppMessage.findFirst({
        where: { organizationId, externalMessageId },
      });
      if (alreadyCreated) return;
      let contact = await transaction.contact.findFirst({
        where: { organizationId, phoneNormalized: normalized.phoneNormalized, deletedAt: null },
      });
      if (!contact) {
        contact = await transaction.contact.create({
          data: {
            organizationId,
            phone: normalized.phone,
            phoneNormalized: normalized.phoneNormalized,
            firstName: profileName,
            source: 'WHATSAPP',
            lastActivityAt: timestamp,
          },
        });
      } else {
        await transaction.contact.update({
          where: { organizationId_id: { organizationId, id: contact.id } },
          data: { lastActivityAt: timestamp },
        });
      }
      const conversation = await transaction.whatsAppConversation.findFirst({
        where: {
          organizationId,
          phoneNumberId,
          externalContactPhoneNormalized: normalized.phoneNormalized,
          deletedAt: null,
        },
      });
      const conversationCreated = conversation === null;
      const windowExpiresAt = new Date(timestamp.getTime() + 24 * 60 * 60 * 1000);
      const currentConversation = conversation
        ? await transaction.whatsAppConversation.update({
            where: { organizationId_id: { organizationId, id: conversation.id } },
            data: {
              contactId: contact.id,
              externalContactPhone: normalized.phone,
              externalContactName: profileName ?? conversation.externalContactName,
              status: 'OPEN',
              windowStartedAt: conversation.windowStartedAt ?? timestamp,
              windowExpiresAt,
              lastMessageAt: timestamp,
              lastInboundAt: timestamp,
              unreadCount: { increment: 1 },
            },
          })
        : await transaction.whatsAppConversation.create({
            data: {
              organizationId,
              connectionId,
              phoneNumberId,
              contactId: contact.id,
              externalContactPhone: normalized.phone,
              externalContactPhoneNormalized: normalized.phoneNormalized,
              externalContactName: profileName,
              status: 'OPEN',
              windowStartedAt: timestamp,
              windowExpiresAt,
              lastMessageAt: timestamp,
              lastInboundAt: timestamp,
              unreadCount: 1,
            },
          });
      const createdMessage = await transaction.whatsAppMessage.create({
        data: {
          organizationId,
          conversationId: currentConversation.id,
          connectionId,
          phoneNumberId,
          contactId: contact.id,
          externalMessageId,
          direction: 'INBOUND',
          type,
          status: WhatsAppMessageDeliveryStatus.DELIVERED,
          ...(text ? { text } : {}),
          ...(media
            ? {
                mediaId: stringValue(media.id),
                mediaMimeType: stringValue(media.mime_type),
                mediaFilename: stringValue(media.filename),
                caption: stringValue(media.caption),
              }
            : {}),
          ...(type === WhatsAppMessageType.LOCATION
            ? { location: toInputJson(message?.location ?? {}) }
            : {}),
          ...(type === WhatsAppMessageType.CONTACTS
            ? { contactsPayload: toInputJson(message?.contacts ?? []) }
            : {}),
          sanitizedPayload: sanitized,
          requestId,
        },
      });
      await transaction.activity.create({
        data: {
          organizationId,
          contactId: contact.id,
          type: ActivityType.MESSAGE,
          title: 'Mensaje de WhatsApp recibido',
          description: text ?? `Mensaje ${String(type).toLowerCase()}`,
          occurredAt: timestamp,
          metadata: toInputJson({
            channel: 'WHATSAPP',
            messageId: externalMessageId,
            conversationId: currentConversation.id,
          }),
          requestId,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        action: 'WHATSAPP_INBOUND_MESSAGE_RECEIVED',
        tableName: 'WhatsAppMessage',
        recordId: externalMessageId,
        newValue: toInputJson({ type, conversationId: currentConversation.id }),
        requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: conversationCreated ? 'ConversationCreated' : 'ConversationUpdated',
        organizationId,
        aggregateType: 'WhatsAppConversation',
        aggregateId: currentConversation.id,
        requestId,
        deduplicationKey: `${conversationCreated ? 'ConversationCreated' : 'ConversationUpdated'}:${currentConversation.id}:${createdMessage.id}`,
        payload: {
          conversationId: currentConversation.id,
          contactId: contact.id,
          messageId: createdMessage.id,
        },
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'MessageReceived',
        organizationId,
        aggregateType: 'WhatsAppMessage',
        aggregateId: createdMessage.id,
        requestId,
        deduplicationKey: `MessageReceived:${createdMessage.id}`,
        payload: {
          messageId: createdMessage.id,
          conversationId: currentConversation.id,
          contactId: contact.id,
        },
      });
    });
  }

  private async processStatus(
    organizationId: string,
    requestId: string,
    rawStatus: unknown,
  ): Promise<void> {
    const status = recordValue(rawStatus);
    const externalMessageId = stringValue(status?.id);
    const state = stringValue(status?.status)?.toUpperCase();
    if (!externalMessageId || !state) return;
    const mapped =
      state === 'SENT'
        ? WhatsAppMessageDeliveryStatus.SENT
        : state === 'DELIVERED'
          ? WhatsAppMessageDeliveryStatus.DELIVERED
          : state === 'READ'
            ? WhatsAppMessageDeliveryStatus.READ
            : state === 'FAILED'
              ? WhatsAppMessageDeliveryStatus.FAILED
              : null;
    if (!mapped) return;
    const timestamp = messageTimestamp(status?.timestamp);
    await this.prisma.$transaction(async (transaction) => {
      const message = await transaction.whatsAppMessage.findFirst({
        where: { organizationId, externalMessageId },
      });
      const error = Array.isArray(status?.errors) ? recordValue(status.errors[0]) : null;
      await transaction.whatsAppMessageStatus.upsert({
        where: {
          organizationId_externalMessageId_status: {
            organizationId,
            externalMessageId,
            status: mapped,
          },
        },
        create: {
          organizationId,
          messageId: message?.id ?? null,
          externalMessageId,
          status: mapped,
          recipientPhone: stringValue(status?.recipient_id),
          timestamp,
          errorCode: stringValue(error?.code),
          errorMessage: stringValue(error?.title) ?? stringValue(error?.message),
          sanitizedPayload: sanitizePayload(status),
        },
        update: {
          messageId: message?.id ?? null,
          recipientPhone: stringValue(status?.recipient_id),
          timestamp,
          errorCode: stringValue(error?.code),
          errorMessage: stringValue(error?.title) ?? stringValue(error?.message),
          sanitizedPayload: sanitizePayload(status),
        },
      });
      if (!message) return;
      await transaction.whatsAppMessage.update({
        where: { organizationId_id: { organizationId, id: message.id } },
        data: {
          status: mapped,
          ...(mapped === WhatsAppMessageDeliveryStatus.SENT ? { sentAt: timestamp } : {}),
          ...(mapped === WhatsAppMessageDeliveryStatus.DELIVERED ? { deliveredAt: timestamp } : {}),
          ...(mapped === WhatsAppMessageDeliveryStatus.READ ? { readAt: timestamp } : {}),
          ...(mapped === WhatsAppMessageDeliveryStatus.FAILED
            ? {
                failedAt: timestamp,
                errorCode: stringValue(error?.code),
                errorMessage: stringValue(error?.title) ?? stringValue(error?.message),
              }
            : {}),
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        action: 'WHATSAPP_MESSAGE_STATUS_UPDATED',
        tableName: 'WhatsAppMessage',
        recordId: message.id,
        newValue: toInputJson({ status: mapped }),
        requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'WhatsAppMessageStatusUpdated',
        organizationId,
        aggregateType: 'WhatsAppMessage',
        aggregateId: message?.id ?? externalMessageId,
        requestId,
        payload: { externalMessageId, status: mapped },
      });
    });
  }

  private safeError(error: unknown): string {
    if (error instanceof Error) return error.message.slice(0, 500);
    return 'Error desconocido';
  }
}
