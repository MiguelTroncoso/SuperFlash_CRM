import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ContactsModule } from '../contacts/contacts.module';
import { OpportunityAccessPolicy } from './access/opportunity-access.policy';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesRepository } from './opportunities.repository';
import { OpportunitiesService } from './opportunities.service';
import { PipelineController } from './pipeline.controller';

@Module({
  imports: [AuditModule, AuthModule, ContactsModule],
  controllers: [OpportunitiesController, PipelineController],
  providers: [OpportunitiesService, OpportunitiesRepository, OpportunityAccessPolicy],
  exports: [OpportunitiesService, OpportunityAccessPolicy],
})
export class OpportunitiesModule {}
