import { Injectable } from '@nestjs/common';

import { ChannelHealth } from '../communication.types';
import { WhatsAppChannelProvider } from '../providers/whatsapp/whatsapp-channel.provider';

@Injectable()
export class ChannelHealthService {
  constructor(private readonly whatsapp: WhatsAppChannelProvider) {}

  getWhatsAppHealth(organizationId: string): Promise<ChannelHealth> {
    return this.whatsapp.health(organizationId);
  }

  async list(organizationId: string): Promise<{ data: ChannelHealth[] }> {
    return { data: [await this.getWhatsAppHealth(organizationId)] };
  }

  verifyWhatsAppConfiguration() {
    const configuration = this.whatsapp.configuration();
    return {
      channel: 'WHATSAPP' as const,
      provider: 'META_CLOUD_API',
      enabled: configuration.enabled,
      graphVersion: configuration.graphVersion,
      missingConfiguration: configuration.missing,
      webhookPath: '/api/v1/integrations/communication/whatsapp/webhook',
      externalRequestMade: false,
    };
  }
}
