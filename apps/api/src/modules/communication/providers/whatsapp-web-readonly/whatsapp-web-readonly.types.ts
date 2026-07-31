import { WhatsAppMessageType } from '@prisma/client';

export type WhatsAppWebReaderStatus =
  'PAIRING' | 'CONNECTED' | 'DISCONNECTED' | 'AUTHENTICATION_ERROR' | 'ERROR';

export interface WhatsAppWebStatusInput {
  readonly organizationId?: string;
  readonly status: WhatsAppWebReaderStatus;
  readonly phoneNumber?: string;
  readonly connectedAt?: string;
  readonly error?: string;
  readonly reconnectCount?: number;
  readonly historicalDiscarded?: number;
}

export interface WhatsAppWebQrInput {
  readonly organizationId?: string;
  readonly qr: string;
  readonly expiresAt?: string;
}

export interface WhatsAppWebMessageInput {
  readonly externalMessageId: string;
  readonly phone: string;
  readonly phoneNormalized: string;
  readonly contactName?: string;
  readonly type: WhatsAppMessageType;
  readonly text?: string;
  readonly mediaMimeType?: string;
  readonly mediaFilename?: string;
  readonly caption?: string;
  readonly location?: Record<string, unknown>;
  readonly occurredAt: string;
  readonly requestId: string;
}
