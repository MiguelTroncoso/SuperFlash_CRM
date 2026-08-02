import { Injectable } from '@nestjs/common';

import { ChannelHealth } from '../communication.types';
import { WhatsAppChannelProvider } from '../providers/whatsapp/whatsapp-channel.provider';
import { WhatsAppReadOnlyHealthService } from '../providers/whatsapp-readonly/whatsapp-readonly.health';
import { WhatsAppWebBridgeService } from '../providers/whatsapp-web-bridge/whatsapp-web-bridge.service';

@Injectable()
export class ChannelHealthService {
  constructor(
    private readonly whatsapp: WhatsAppChannelProvider,
    private readonly whatsappReadOnly: WhatsAppReadOnlyHealthService,
    private readonly whatsappWebBridge: WhatsAppWebBridgeService,
  ) {}

  getWhatsAppHealth(organizationId: string): Promise<ChannelHealth> {
    return this.whatsapp.health(organizationId);
  }

  getWhatsAppWebBridgeHealth(organizationId: string): Promise<Record<string, unknown>> {
    return this.whatsappWebBridge.health(organizationId);
  }

  async list(
    organizationId: string,
  ): Promise<{ data: Array<ChannelHealth | Record<string, unknown>> }> {
    return {
      data: [
        await this.getWhatsAppHealth(organizationId),
        await this.whatsappReadOnly.get(organizationId),
        await this.whatsappWebBridge.health(organizationId),
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
