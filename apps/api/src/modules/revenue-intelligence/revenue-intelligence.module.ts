import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';
import { RevenueIntelligenceController } from './revenue-intelligence.controller';
import { RevenueIntelligenceService } from './revenue-intelligence.service';

@Module({
  imports: [AuthModule, CommunicationModule],
  controllers: [RevenueIntelligenceController],
  providers: [RevenueIntelligenceService],
  exports: [RevenueIntelligenceService],
})
export class RevenueIntelligenceModule {}
