import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { SalesModule } from '../sales/sales.module';
import { TrialsModule } from '../trials/trials.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { SmartInboxController } from './smart-inbox.controller';
import { SmartInboxEventsService } from './smart-inbox.events';
import { SmartInboxService } from './smart-inbox.service';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    FollowUpsModule,
    FulfillmentModule,
    OpportunitiesModule,
    SalesModule,
    TrialsModule,
    WhatsAppModule,
  ],
  controllers: [SmartInboxController],
  providers: [SmartInboxEventsService, SmartInboxService],
})
export class SmartInboxModule {}
