import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ContactAccessPolicy } from './access/contact-access.policy';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';
import { PhoneNormalizerService } from './phone/phone-normalizer.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [ContactsController, TagsController],
  providers: [
    ContactsService,
    ContactsRepository,
    PhoneNormalizerService,
    ContactAccessPolicy,
    TagsService,
  ],
  exports: [ContactsService, ContactAccessPolicy, PhoneNormalizerService],
})
export class ContactsModule {}
