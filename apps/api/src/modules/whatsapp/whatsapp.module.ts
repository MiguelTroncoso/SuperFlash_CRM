import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ContactsModule } from '../contacts/contacts.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppGraphApiClient } from './whatsapp.graph-api.client';
import { WhatsAppProcessor } from './whatsapp.processor';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';
import { WhatsAppWebhookService } from './whatsapp.webhook.service';

@Module({
  imports: [AuditModule, AuthModule, ContactsModule, CredentialsModule],
  controllers: [WhatsAppController, WhatsAppWebhookController],
  providers: [WhatsAppService, WhatsAppWebhookService, WhatsAppGraphApiClient, WhatsAppProcessor],
  exports: [WhatsAppService, WhatsAppWebhookService],
})
export class WhatsAppModule {}
