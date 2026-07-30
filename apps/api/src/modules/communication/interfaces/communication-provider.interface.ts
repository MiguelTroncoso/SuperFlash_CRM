import {
  CommunicationMessageInput,
  CommunicationOperationResult,
  CommunicationProviderConfiguration,
  CommunicationWebhookInput,
  CommunicationWebhookResult,
} from '../communication.types';

export interface CommunicationProvider {
  readonly channel: 'WHATSAPP';
  configuration(): CommunicationProviderConfiguration;
  verifyWebhook(
    mode: string | undefined,
    verifyToken: string | undefined,
    challenge: string | undefined,
  ): Promise<string>;
  receiveWebhook(input: CommunicationWebhookInput): Promise<CommunicationWebhookResult>;
  sendMessage(input: CommunicationMessageInput): Promise<CommunicationOperationResult>;
  queryMessageStatus(input: CommunicationMessageInput): Promise<CommunicationOperationResult>;
}
