import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ContactsModule } from '../contacts/contacts.module';
import { SmartInboxEventsService } from '../smart-inbox/smart-inbox.events';
import { CommunicationController } from './communication.controller';
import { CommunicationWebhookController } from './communication.webhook.controller';
import { ConversationImportService } from './services/conversation-import.service';
import { CommunicationEventTranslator } from './services/communication-event-translator.service';
import { ChannelHealthService } from './services/channel-health.service';
import { CommunicationMetricsService } from './services/communication-metrics.service';
import { WhatsAppReadOnlyAnalyticsService } from './services/whatsapp-readonly-analytics.service';
import { WhatsAppChannelProvider } from './providers/whatsapp/whatsapp-channel.provider';
import { WhatsAppReadOnlyHealthService } from './providers/whatsapp-readonly/whatsapp-readonly.health';
import { WhatsAppReadOnlyProvider } from './providers/whatsapp-readonly/whatsapp-readonly.provider';
import {
  WhatsAppWebReadOnlyController,
  WhatsAppWebReadOnlyInternalController,
} from './providers/whatsapp-web-readonly/whatsapp-web-readonly.controller';
import { WhatsAppWebReadOnlyService } from './providers/whatsapp-web-readonly/whatsapp-web-readonly.service';
import {
  WhatsAppWebBridgeController,
  WhatsAppWebBridgeInternalController,
} from './providers/whatsapp-web-bridge/whatsapp-web-bridge.controller';
import { WhatsAppWebBridgeSecurity } from './providers/whatsapp-web-bridge/whatsapp-web-bridge.security';
import { WhatsAppWebBridgeService } from './providers/whatsapp-web-bridge/whatsapp-web-bridge.service';

@Global()
@Module({
  imports: [AuthModule, AuditModule, PrismaModule, WhatsAppModule, ContactsModule],
  controllers: [
    CommunicationController,
    CommunicationWebhookController,
    WhatsAppWebReadOnlyController,
    WhatsAppWebReadOnlyInternalController,
    WhatsAppWebBridgeController,
    WhatsAppWebBridgeInternalController,
  ],
  providers: [
    CommunicationMetricsService,
    WhatsAppChannelProvider,
    WhatsAppReadOnlyProvider,
    WhatsAppWebReadOnlyService,
    WhatsAppReadOnlyHealthService,
    ConversationImportService,
    WhatsAppReadOnlyAnalyticsService,
    ChannelHealthService,
    CommunicationEventTranslator,
    SmartInboxEventsService,
    WhatsAppWebBridgeSecurity,
    WhatsAppWebBridgeService,
  ],
  exports: [
    CommunicationMetricsService,
    ChannelHealthService,
    WhatsAppChannelProvider,
    WhatsAppReadOnlyProvider,
    WhatsAppReadOnlyHealthService,
    ConversationImportService,
    WhatsAppReadOnlyAnalyticsService,
    SmartInboxEventsService,
    WhatsAppWebBridgeService,
  ],
})
export class CommunicationModule {}
