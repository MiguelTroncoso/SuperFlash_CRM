import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ActivationsController } from './activations.controller';
import { ActivationsService } from './activations.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [ActivationsController],
  providers: [ActivationsService],
  exports: [ActivationsService],
})
export class ActivationsModule {}
