import { WhatsAppMessageType } from '@prisma/client';

export type WhatsAppWebBridgeIncomingStatus =
  'PAIRING' | 'CONNECTED' | 'DISCONNECTED' | 'AUTHENTICATION_ERROR' | 'ERROR';

export type WhatsAppWebBridgeMessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'LOCATION'
  | 'CONTACTS'
  | 'STICKER'
  | 'UNKNOWN';

export interface WhatsAppWebBridgeQrInput {
  readonly qr: string;
  readonly expiresAt: string;
  readonly requestId: string;
}

export interface WhatsAppWebBridgeStatusInput {
  readonly status: WhatsAppWebBridgeIncomingStatus;
  readonly phoneNumber?: string;
  readonly reconnectCount?: number;
  readonly historicalDiscarded?: number;
  readonly error?: string;
  readonly connectedAt?: string;
  readonly requestId: string;
}

export interface WhatsAppWebBridgeHeartbeatInput {
  readonly status?: WhatsAppWebBridgeIncomingStatus;
  readonly requestId: string;
}

export interface WhatsAppWebBridgeMessageInput {
  readonly externalMessageId: string;
  readonly phone: string;
  readonly phoneNormalized?: string;
  readonly country?: string;
  readonly contactName?: string;
  readonly type: WhatsAppWebBridgeMessageType;
  readonly text?: string;
  readonly mediaMimeType?: string;
  readonly mediaFilename?: string;
  readonly caption?: string;
  readonly location?: Record<string, unknown>;
  readonly quotedMessageId?: string;
  readonly occurredAt: string;
  readonly requestId: string;
}

export function mapBridgeMessageType(value: WhatsAppWebBridgeMessageType): WhatsAppMessageType {
  if (value === 'TEXT') return WhatsAppMessageType.TEXT;
  if (value === 'IMAGE') return WhatsAppMessageType.IMAGE;
  if (value === 'AUDIO') return WhatsAppMessageType.AUDIO;
  if (value === 'VIDEO') return WhatsAppMessageType.VIDEO;
  if (value === 'DOCUMENT') return WhatsAppMessageType.DOCUMENT;
  if (value === 'LOCATION') return WhatsAppMessageType.LOCATION;
  if (value === 'CONTACTS') return WhatsAppMessageType.CONTACTS;
  if (value === 'STICKER') return WhatsAppMessageType.STICKER;
  return WhatsAppMessageType.UNKNOWN;
}

export interface BridgeQrState {
  readonly value: string;
  readonly expiresAt: Date;
}
