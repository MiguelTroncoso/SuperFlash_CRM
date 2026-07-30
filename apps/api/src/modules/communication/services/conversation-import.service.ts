import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CommunicationSyncStatus } from '@prisma/client';

import { OutboxService } from '../../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../../auth/auth.types';
import { WhatsAppProcessor } from '../../whatsapp/whatsapp.processor';
import { CommunicationMetricsService } from './communication-metrics.service';
import { WhatsAppReadOnlyProvider } from '../providers/whatsapp-readonly/whatsapp-readonly.provider';
import { ReadOnlyCursor } from '../providers/whatsapp-readonly/whatsapp-readonly.types';

const CHANNEL = 'WHATSAPP_READ_ONLY' as const;
const STALE_RUN_MS = 10 * 60 * 1_000;

interface SyncContext {
  readonly organizationId: string;
  readonly userId?: string;
  readonly metadata?: RequestMetadata;
}

@Injectable()
export class ConversationImportService implements OnModuleInit {
  private readonly logger = new Logger(ConversationImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: WhatsAppReadOnlyProvider,
    private readonly processor: WhatsAppProcessor,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly metrics: CommunicationMetricsService,
  ) {}

  onModuleInit(): void {
    const recovery = setTimeout(() => void this.recoverFailedSynchronizations(), 0);
    recovery.unref();
  }

  async synchronize(
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ): Promise<Record<string, unknown>> {
    return this.run({
      organizationId: user.organizationId,
      userId: user.userId,
      ...(metadata ? { metadata } : {}),
    });
  }

  async reindex(
    user: AuthenticatedUser,
    metadata?: RequestMetadata,
  ): Promise<Record<string, unknown>> {
    const context: SyncContext = {
      organizationId: user.organizationId,
      userId: user.userId,
      ...(metadata ? { metadata } : {}),
    };
    await this.acquire(context);
    const startedAt = Date.now();
    try {
      const conversations = await this.provider.readConversationSnapshot(context.organizationId);
      let contactsUpdated = 0;
      for (const conversation of conversations) {
        const latest = await this.prisma.whatsAppMessage.findFirst({
          where: {
            organizationId: context.organizationId,
            conversationId: conversation.id,
            deletedAt: null,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { createdAt: true },
        });
        if (!latest) continue;
        const result = await this.prisma.contact.updateMany({
          where: {
            organizationId: context.organizationId,
            id: conversation.contactId,
            deletedAt: null,
            OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: latest.createdAt } }],
          },
          data: { lastActivityAt: latest.createdAt },
        });
        contactsUpdated += result.count;
      }
      const totals = await this.totals(context.organizationId);
      const checkpoint = await this.complete(context, {
        cursor: await this.lastCursor(context.organizationId),
        messagesImported: totals.messages,
        conversationsImported: conversations.length,
        contactsImported: contactsUpdated,
        duplicatesAvoided: 0,
      });
      this.metrics.increment('readonly_reindex_runs');
      this.metrics.add('readonly_contacts_updated', contactsUpdated);
      this.metrics.recordDuration('readonly_sync_duration_ms', Date.now() - startedAt);
      await this.audit.record({
        organizationId: context.organizationId,
        userId: context.userId,
        action: 'WHATSAPP_READ_ONLY_REINDEX_COMPLETED',
        tableName: 'CommunicationSyncCheckpoint',
        recordId: checkpoint.id,
        newValue: { conversations: conversations.length, contactsUpdated },
        ip: context.metadata?.ipAddress,
        requestId: context.metadata?.requestId,
      });
      return this.publicResult(checkpoint);
    } catch (error: unknown) {
      await this.fail(context, error);
      throw error;
    }
  }

  async status(organizationId: string): Promise<Record<string, unknown>> {
    const checkpoint = await this.ensureCheckpoint(organizationId);
    return this.publicResult(checkpoint);
  }

  private async run(context: SyncContext): Promise<Record<string, unknown>> {
    await this.acquire(context);
    const startedAt = Date.now();
    const initial = await this.ensureCheckpoint(context.organizationId);
    let cursor: ReadOnlyCursor = { at: initial.cursorAt, id: initial.cursorId };
    let messagesImported = 0;
    let conversationsImported = 0;
    let contactsImported = 0;
    const duplicatesAvoided = 0;
    const conversationIds = new Set<string>();
    const contactIds = new Set<string>();

    try {
      await this.processor.processAvailable();
      while (true) {
        const changes = await this.provider.readMessagesAfter(context.organizationId, cursor);
        if (changes.length === 0) break;
        for (const change of changes) {
          conversationIds.add(change.conversationId);
          contactIds.add(change.contactId);
          await this.prisma.contact.updateMany({
            where: {
              organizationId: context.organizationId,
              id: change.contactId,
              deletedAt: null,
              OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: change.createdAt } }],
            },
            data: { lastActivityAt: change.createdAt },
          });
        }
        messagesImported += changes.length;
        cursor = {
          at: changes[changes.length - 1]?.createdAt ?? cursor.at,
          id: changes[changes.length - 1]?.id ?? cursor.id,
        };
        if (changes.length < 500) break;
      }
      conversationsImported = conversationIds.size;
      contactsImported = contactIds.size;
      const checkpoint = await this.complete(context, {
        cursor,
        messagesImported,
        conversationsImported,
        contactsImported,
        duplicatesAvoided,
      });
      this.metrics.increment('readonly_sync_runs');
      this.metrics.add('readonly_messages_imported', messagesImported);
      this.metrics.add('readonly_conversations_imported', conversationsImported);
      this.metrics.add('readonly_contacts_imported', contactsImported);
      this.metrics.add('readonly_duplicates_avoided', duplicatesAvoided);
      this.metrics.recordDuration('readonly_sync_duration_ms', Date.now() - startedAt);
      await this.audit.record({
        organizationId: context.organizationId,
        userId: context.userId,
        action: 'WHATSAPP_READ_ONLY_SYNC_COMPLETED',
        tableName: 'CommunicationSyncCheckpoint',
        recordId: checkpoint.id,
        newValue: { messagesImported, conversationsImported, contactsImported, duplicatesAvoided },
        ip: context.metadata?.ipAddress,
        requestId: context.metadata?.requestId,
      });
      await this.outbox.enqueue({
        eventType: 'WhatsAppReadOnlySyncCompleted',
        organizationId: context.organizationId,
        aggregateType: 'CommunicationSyncCheckpoint',
        aggregateId: checkpoint.id,
        ...(context.userId ? { actorId: context.userId } : {}),
        requestId: context.metadata?.requestId ?? randomUUID(),
        payload: { messagesImported, conversationsImported, contactsImported },
      });
      return this.publicResult(checkpoint);
    } catch (error: unknown) {
      await this.fail(context, error);
      throw error;
    }
  }

  private async recoverFailedSynchronizations(): Promise<void> {
    try {
      const checkpoints = await this.prisma.communicationSyncCheckpoint.findMany({
        where: {
          channel: CHANNEL,
          status: CommunicationSyncStatus.FAILED,
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        },
        select: { organizationId: true },
        take: 25,
      });
      for (const checkpoint of checkpoints) {
        void this.run({ organizationId: checkpoint.organizationId }).catch((error: unknown) => {
          this.logger.warn(
            `Read-only synchronization recovery failed for ${checkpoint.organizationId}`,
          );
          this.logger.debug(error instanceof Error ? error.message : 'Unknown recovery error');
        });
      }
    } catch (error: unknown) {
      this.logger.warn('Read-only synchronization recovery could not start');
      this.logger.debug(error instanceof Error ? error.message : 'Unknown recovery error');
    }
  }

  private async ensureCheckpoint(organizationId: string) {
    return this.prisma.communicationSyncCheckpoint.upsert({
      where: { organizationId_channel: { organizationId, channel: CHANNEL } },
      create: { organizationId, channel: CHANNEL },
      update: {},
    });
  }

  private async acquire(context: SyncContext): Promise<void> {
    const checkpoint = await this.ensureCheckpoint(context.organizationId);
    const staleAt = new Date(Date.now() - STALE_RUN_MS);
    const claimed = await this.prisma.communicationSyncCheckpoint.updateMany({
      where: {
        organizationId: context.organizationId,
        channel: CHANNEL,
        OR: [
          { status: { not: CommunicationSyncStatus.RUNNING } },
          { status: CommunicationSyncStatus.RUNNING, updatedAt: { lt: staleAt } },
        ],
      },
      data: {
        status: CommunicationSyncStatus.RUNNING,
        lastError: null,
        nextRetryAt: null,
        attemptCount: { increment: 1 },
      },
    });
    if (claimed.count === 0) {
      throw new Error(`La sincronización ya está en ejecución para ${context.organizationId}.`);
    }
    if (checkpoint.status === CommunicationSyncStatus.RUNNING && checkpoint.updatedAt >= staleAt) {
      throw new Error(`La sincronización ya está en ejecución para ${context.organizationId}.`);
    }
  }

  private async complete(
    context: SyncContext,
    values: {
      cursor: ReadOnlyCursor;
      messagesImported: number;
      conversationsImported: number;
      contactsImported: number;
      duplicatesAvoided: number;
    },
  ) {
    return this.prisma.communicationSyncCheckpoint.update({
      where: {
        organizationId_channel: { organizationId: context.organizationId, channel: CHANNEL },
      },
      data: {
        status: CommunicationSyncStatus.SUCCEEDED,
        cursorAt: values.cursor.at,
        cursorId: values.cursor.id,
        lastSynchronizedAt: new Date(),
        lastSuccessfulAt: new Date(),
        messagesImported: { increment: values.messagesImported },
        conversationsImported: { increment: values.conversationsImported },
        contactsImported: { increment: values.contactsImported },
        duplicatesAvoided: { increment: values.duplicatesAvoided },
        nextRetryAt: null,
        lastError: null,
      },
    });
  }

  private async fail(context: SyncContext, error: unknown): Promise<void> {
    const checkpoint = await this.ensureCheckpoint(context.organizationId);
    const delaySeconds = Math.min(300, 2 ** Math.min(8, checkpoint.attemptCount));
    const message =
      error instanceof Error ? error.message.slice(0, 500) : 'Error de sincronización';
    await this.prisma.communicationSyncCheckpoint.update({
      where: {
        organizationId_channel: { organizationId: context.organizationId, channel: CHANNEL },
      },
      data: {
        status: CommunicationSyncStatus.FAILED,
        errorCount: { increment: 1 },
        nextRetryAt: new Date(Date.now() + delaySeconds * 1_000),
        lastError: message,
      },
    });
    this.metrics.increment('readonly_sync_failures');
    await this.audit.record({
      organizationId: context.organizationId,
      userId: context.userId,
      action: 'WHATSAPP_READ_ONLY_SYNC_FAILED',
      tableName: 'CommunicationSyncCheckpoint',
      recordId: checkpoint.id,
      newValue: { error: message, retryInSeconds: delaySeconds },
      ip: context.metadata?.ipAddress,
      requestId: context.metadata?.requestId,
    });
  }

  private async lastCursor(organizationId: string): Promise<ReadOnlyCursor> {
    const row = await this.prisma.whatsAppMessage.findFirst({
      where: { organizationId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true, id: true },
    });
    return { at: row?.createdAt ?? null, id: row?.id ?? null };
  }

  private async totals(organizationId: string): Promise<{ messages: number }> {
    return {
      messages: await this.prisma.whatsAppMessage.count({
        where: { organizationId, deletedAt: null },
      }),
    };
  }

  private publicResult(checkpoint: {
    id: string;
    status: CommunicationSyncStatus;
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
  }): Record<string, unknown> {
    return {
      id: checkpoint.id,
      status: checkpoint.status,
      checkpoint: { at: checkpoint.cursorAt, id: checkpoint.cursorId },
      lastSynchronizedAt: checkpoint.lastSynchronizedAt,
      lastSuccessfulAt: checkpoint.lastSuccessfulAt,
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
