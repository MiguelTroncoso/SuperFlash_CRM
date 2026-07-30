import { Injectable } from '@nestjs/common';
import { WhatsAppMessageDirection } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { CommunicationMetricsService } from '../../services/communication-metrics.service';
import { ReadOnlySyncSummary } from './whatsapp-readonly.types';

@Injectable()
export class WhatsAppReadOnlyHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: CommunicationMetricsService,
  ) {}

  async get(organizationId: string): Promise<Record<string, unknown>> {
    const checkpoint = await this.prisma.communicationSyncCheckpoint.findUnique({
      where: {
        organizationId_channel: { organizationId, channel: 'WHATSAPP_READ_ONLY' },
      },
    });
    const [messages, conversations, lastWebhook] = await Promise.all([
      this.prisma.whatsAppMessage.count({
        where: { organizationId, direction: WhatsAppMessageDirection.INBOUND, deletedAt: null },
      }),
      this.prisma.whatsAppConversation.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.whatsAppWebhookEvent.findFirst({
        where: { organizationId },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
    ]);
    const configured = messages > 0 || conversations > 0 || lastWebhook !== null;
    return {
      channel: 'WHATSAPP_READ_ONLY',
      provider: 'PERSISTED_WEBHOOK_READ_MODEL',
      status: configured ? 'CONNECTED' : 'PENDING_CONFIGURATION',
      readOnly: true,
      externalWriteEnabled: false,
      externalRequestMade: false,
      source: 'LOCAL_WHATSAPP_READ_MODEL',
      lastWebhookReceivedAt: lastWebhook?.receivedAt ?? null,
      checkpoint: this.mapCheckpoint(checkpoint),
      totals: { messages, conversations },
      metrics: this.metrics.snapshot().counters,
    };
  }

  private mapCheckpoint(
    checkpoint: {
      status: string;
      cursorAt: Date | null;
      cursorId: string | null;
      lastSynchronizedAt: Date | null;
      lastSuccessfulAt: Date | null;
      messagesImported: number;
      conversationsImported: number;
      contactsImported: number;
      duplicatesAvoided: number;
      errorCount: number;
      nextRetryAt: Date | null;
      lastError: string | null;
    } | null,
  ): ReadOnlySyncSummary | null {
    if (!checkpoint) return null;
    return {
      status: checkpoint.status as ReadOnlySyncSummary['status'],
      lastSynchronizedAt: checkpoint.lastSynchronizedAt,
      lastSuccessfulAt: checkpoint.lastSuccessfulAt,
      checkpoint: { at: checkpoint.cursorAt, id: checkpoint.cursorId },
      messagesImported: checkpoint.messagesImported,
      conversationsImported: checkpoint.conversationsImported,
      contactsImported: checkpoint.contactsImported,
      duplicatesAvoided: checkpoint.duplicatesAvoided,
      errors: checkpoint.errorCount,
      nextRetryAt: checkpoint.nextRetryAt,
      lastError: checkpoint.lastError,
      readOnly: true,
      externalWriteEnabled: false,
    };
  }
}
