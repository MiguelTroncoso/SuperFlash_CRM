import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommercialAccessPolicy } from '../commercial/commercial.policy';
import { RenewalsController } from './renewals.controller';
import { RenewalsAccessPolicy } from './renewals.policy';
import { RenewalsService } from './renewals.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [RenewalsController],
  providers: [RenewalsService, RenewalsAccessPolicy, CommercialAccessPolicy],
  exports: [RenewalsService],
})
export class RenewalsModule {}
