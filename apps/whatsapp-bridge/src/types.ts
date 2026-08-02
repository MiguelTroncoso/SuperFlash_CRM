export type BridgeStatus =
  'PAIRING' | 'CONNECTED' | 'DISCONNECTED' | 'AUTHENTICATION_ERROR' | 'ERROR';

export type BridgeMessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'LOCATION'
  | 'CONTACTS'
  | 'STICKER'
  | 'UNKNOWN';

export interface BridgeMessage {
  readonly externalMessageId: string;
  readonly phone: string;
  readonly phoneNormalized: string;
  readonly country?: string | undefined;
  readonly contactName?: string | undefined;
  readonly quotedMessageId?: string | undefined;
  readonly type: BridgeMessageType;
  readonly text?: string | undefined;
  readonly mediaMimeType?: string | undefined;
  readonly mediaFilename?: string | undefined;
  readonly caption?: string | undefined;
  readonly location?: Record<string, unknown> | undefined;
  readonly occurredAt: string;
  readonly requestId: string;
}

export interface BridgeApiStatus {
  readonly status: BridgeStatus;
  readonly phoneNumber?: string;
  readonly reconnectCount?: number;
  readonly historicalDiscarded?: number;
  readonly error?: string;
  readonly connectedAt?: string;
  readonly requestId: string;
}
