import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ExecutiveIntelligenceController } from './executive-intelligence.controller';
import { ExecutiveIntelligenceService } from './executive-intelligence.service';

@Module({
  imports: [AuthModule],
  controllers: [ExecutiveIntelligenceController],
  providers: [ExecutiveIntelligenceService],
  exports: [ExecutiveIntelligenceService],
})
export class ExecutiveIntelligenceModule {}
