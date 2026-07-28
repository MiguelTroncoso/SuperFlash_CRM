import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { TrialsController } from './trials.controller';
import { TrialsService } from './trials.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [TrialsController],
  providers: [TrialsService],
  exports: [TrialsService],
})
export class TrialsModule {}
