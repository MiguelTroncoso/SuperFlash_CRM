import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ExecutiveIntelligenceModule } from '../executive-intelligence/executive-intelligence.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuditModule, AuthModule, ContactsModule, ExecutiveIntelligenceModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
