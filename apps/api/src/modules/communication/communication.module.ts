import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CommunicationController } from './communication.controller';
import { CommunicationWebhookController } from './communication.webhook.controller';
import { CommunicationEventTranslator } from './services/communication-event-translator.service';
import { ChannelHealthService } from './services/channel-health.service';
import { CommunicationMetricsService } from './services/communication-metrics.service';
import { WhatsAppChannelProvider } from './providers/whatsapp/whatsapp-channel.provider';

@Global()
@Module({
  imports: [AuthModule, PrismaModule, WhatsAppModule],
  controllers: [CommunicationController, CommunicationWebhookController],
  providers: [
    CommunicationMetricsService,
    WhatsAppChannelProvider,
    ChannelHealthService,
    CommunicationEventTranslator,
  ],
  exports: [CommunicationMetricsService, ChannelHealthService, WhatsAppChannelProvider],
})
export class CommunicationModule {}
