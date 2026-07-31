import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { RenewalsModule } from '../renewals/renewals.module';
import { RenewalIntelligenceController } from './renewal-intelligence.controller';
import { RenewalIntelligenceService } from './renewal-intelligence.service';
import { RenewalReminderProcessor } from './renewal-reminder.processor';

@Module({
  imports: [AuthModule, AuditModule, RenewalsModule],
  controllers: [RenewalIntelligenceController],
  providers: [RenewalIntelligenceService, RenewalReminderProcessor],
  exports: [RenewalIntelligenceService],
})
export class RenewalIntelligenceModule {}
