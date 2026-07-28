import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommercialAccessPolicy } from '../commercial/commercial.policy';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsAccessPolicy } from './subscriptions.policy';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsAccessPolicy, CommercialAccessPolicy],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
