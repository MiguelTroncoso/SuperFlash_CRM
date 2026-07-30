export type CommunicationChannel = 'WHATSAPP';

export type ChannelHealthStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'AUTHENTICATION_ERROR'
  | 'WEBHOOK_INVALID'
  | 'TOKEN_INVALID'
  | 'EXPIRED'
  | 'PENDING_CONFIGURATION';

export interface ChannelHealth {
  channel: CommunicationChannel;
  provider: string;
  status: ChannelHealthStatus;
  configured: boolean;
  graphVersion: string;
  webhookPath: string;
  phoneNumber: string | null;
  lastSynchronizedAt: Date | null;
  lastMessageReceivedAt: Date | null;
  lastMessageSentAt: Date | null;
  lastError: string | null;
  missingConfiguration: readonly string[];
}

export interface CommunicationWebhookInput {
  body: unknown;
  rawBody?: Buffer;
  signature?: string;
  requestId: string;
}

export interface CommunicationWebhookResult {
  received: true;
  duplicate: boolean;
}

export interface CommunicationProviderConfiguration {
  enabled: boolean;
  graphVersion: string;
  missing: readonly string[];
}

export interface CommunicationMessageInput {
  organizationId: string;
  conversationId: string;
  payload: Readonly<Record<string, unknown>>;
  requestId: string;
}

export interface CommunicationOperationResult {
  accepted: boolean;
  externalRequestMade: boolean;
  reason: 'FOUNDATION_ONLY' | 'PROVIDER_DISABLED';
}
