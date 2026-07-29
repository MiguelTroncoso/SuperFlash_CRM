import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CredentialEncryptionService } from './credential-encryption.service';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [CredentialsController],
  providers: [CredentialEncryptionService, CredentialsService],
  exports: [CredentialsService, CredentialEncryptionService],
})
export class CredentialsModule {}
