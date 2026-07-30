import {
  WhatsAppMessageDeliveryStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageType,
} from '@prisma/client';

export interface ReadOnlyCursor {
  readonly at: Date | null;
  readonly id: string | null;
}

export interface ReadOnlyMessageChange {
  readonly id: string;
  readonly organizationId: string;
  readonly conversationId: string;
  readonly contactId: string;
  readonly externalMessageId: string | null;
  readonly direction: WhatsAppMessageDirection;
  readonly type: WhatsAppMessageType;
  readonly status: WhatsAppMessageDeliveryStatus;
  readonly text: string | null;
  readonly createdAt: Date;
  readonly phone: string | null;
  readonly phoneNormalized: string | null;
  readonly country: string | null;
  readonly contactName: string | null;
  readonly conversationStatus: string;
  readonly lastMessageAt: Date | null;
}

export interface ReadOnlyConversationSnapshot {
  readonly id: string;
  readonly contactId: string;
  readonly phone: string;
  readonly phoneNormalized: string;
  readonly name: string | null;
  readonly status: string;
  readonly lastMessageAt: Date | null;
  readonly unreadCount: number;
  readonly messageCount: number;
}

export interface ReadOnlySyncSummary {
  readonly status: 'SUCCEEDED' | 'FAILED' | 'RUNNING';
  readonly lastSynchronizedAt: Date | null;
  readonly lastSuccessfulAt: Date | null;
  readonly checkpoint: ReadOnlyCursor;
  readonly messagesImported: number;
  readonly conversationsImported: number;
  readonly contactsImported: number;
  readonly duplicatesAvoided: number;
  readonly errors: number;
  readonly nextRetryAt: Date | null;
  readonly lastError: string | null;
  readonly readOnly: true;
  readonly externalWriteEnabled: false;
}
