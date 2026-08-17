import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommercialAccessPolicy } from '../commercial/commercial.policy';
import { PaymentsController, SalePaymentsController } from './payments.controller';
import { PaymentsAccessPolicy } from './payments.policy';
import { PaymentsService } from './payments.service';
import { CommissionsModule } from '../commissions/commissions.module';

@Module({
  imports: [AuditModule, AuthModule, CommissionsModule],
  controllers: [PaymentsController, SalePaymentsController],
  providers: [PaymentsService, PaymentsAccessPolicy, CommercialAccessPolicy],
  exports: [PaymentsService],
})
export class PaymentsModule {}
