import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WhatsAppMessageDeliveryStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageType,
} from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/prisma/prisma.service';
import { CommunicationMetricsService } from '../../services/communication-metrics.service';
import {
  ReadOnlyConversationSnapshot,
  ReadOnlyCursor,
  ReadOnlyMessageChange,
} from './whatsapp-readonly.types';

@Injectable()
export class WhatsAppReadOnlyProvider {
  readonly channel = 'WHATSAPP_READ_ONLY' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: CommunicationMetricsService,
  ) {}

  async readMessagesAfter(
    organizationId: string,
    cursor: ReadOnlyCursor,
    limit = 500,
  ): Promise<readonly ReadOnlyMessageChange[]> {
    const where: Prisma.WhatsAppMessageWhereInput = {
      organizationId,
      direction: WhatsAppMessageDirection.INBOUND,
      deletedAt: null,
      ...(cursor.at
        ? {
            OR: [
              { createdAt: { gt: cursor.at } },
              ...(cursor.id ? [{ createdAt: cursor.at, id: { gt: cursor.id } }] : []),
            ],
          }
        : {}),
    };
    const rows = await this.prisma.whatsAppMessage.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(limit, 1), 500),
      select: {
        id: true,
        organizationId: true,
        conversationId: true,
        contactId: true,
        externalMessageId: true,
        direction: true,
        type: true,
        status: true,
        text: true,
        createdAt: true,
        conversation: {
          select: {
            status: true,
            lastMessageAt: true,
            externalContactPhone: true,
            externalContactPhoneNormalized: true,
          },
        },
        contact: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            phoneNormalized: true,
            country: true,
          },
        },
      },
    });
    this.metrics.increment('readonly_source_reads');
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      conversationId: row.conversationId,
      contactId: row.contactId,
      externalMessageId: row.externalMessageId,
      direction: row.direction as WhatsAppMessageDirection,
      type: row.type as WhatsAppMessageType,
      status: row.status as WhatsAppMessageDeliveryStatus,
      text: row.text,
      createdAt: row.createdAt,
      phone: row.contact.phone ?? row.conversation.externalContactPhone,
      phoneNormalized:
        row.contact.phoneNormalized ?? row.conversation.externalContactPhoneNormalized,
      country: row.contact.country,
      contactName: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(' ') || null,
      conversationStatus: row.conversation.status,
      lastMessageAt: row.conversation.lastMessageAt,
    }));
  }

  async readConversationSnapshot(
    organizationId: string,
  ): Promise<readonly ReadOnlyConversationSnapshot[]> {
    const rows = await this.prisma.whatsAppConversation.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        contactId: true,
        externalContactPhone: true,
        externalContactPhoneNormalized: true,
        externalContactName: true,
        status: true,
        lastMessageAt: true,
        unreadCount: true,
        _count: { select: { messages: true } },
      },
    });
    this.metrics.increment('readonly_snapshot_reads');
    return rows.map((row) => ({
      id: row.id,
      contactId: row.contactId,
      phone: row.externalContactPhone,
      phoneNormalized: row.externalContactPhoneNormalized,
      name: row.externalContactName,
      status: row.status,
      lastMessageAt: row.lastMessageAt,
      unreadCount: row.unreadCount,
      messageCount: row._count.messages,
    }));
  }
}
