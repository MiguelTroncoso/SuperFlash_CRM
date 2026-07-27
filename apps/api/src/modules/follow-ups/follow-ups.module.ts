import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { FollowUpAccessPolicy } from './access/followup-access.policy';
import { FollowUpsController } from './followups.controller';
import { FollowUpsRepository } from './followups.repository';
import { FollowUpsService } from './followups.service';
import { MyDayController } from './my-day.controller';
import { MyDayService } from './my-day.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [FollowUpsController, AgendaController, MyDayController],
  providers: [
    FollowUpsService,
    FollowUpsRepository,
    FollowUpAccessPolicy,
    AgendaService,
    MyDayService,
  ],
  exports: [FollowUpsService, FollowUpAccessPolicy],
})
export class FollowUpsModule {}
