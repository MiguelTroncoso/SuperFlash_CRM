import { Injectable } from '@nestjs/common';

import { ChannelHealth } from '../communication.types';
import { WhatsAppChannelProvider } from '../providers/whatsapp/whatsapp-channel.provider';
import { WhatsAppReadOnlyHealthService } from '../providers/whatsapp-readonly/whatsapp-readonly.health';

@Injectable()
export class ChannelHealthService {
  constructor(
    private readonly whatsapp: WhatsAppChannelProvider,
    private readonly whatsappReadOnly: WhatsAppReadOnlyHealthService,
  ) {}

  getWhatsAppHealth(organizationId: string): Promise<ChannelHealth> {
    return this.whatsapp.health(organizationId);
  }

  async list(
    organizationId: string,
  ): Promise<{ data: Array<ChannelHealth | Record<string, unknown>> }> {
    return {
      data: [
        await this.getWhatsAppHealth(organizationId),
        await this.whatsappReadOnly.get(organizationId),
      ],
    };
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
