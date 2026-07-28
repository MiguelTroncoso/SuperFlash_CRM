import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AutomationController, AutomationExecutionsController } from './automation.controller';
import { AutomationProcessor } from './automation.processor';
import { AutomationService } from './automation.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { TemplatesController } from './templates/templates.controller';
import { TemplateRendererService } from './templates/template-renderer.service';
import { TemplatesService } from './templates/templates.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [
    AutomationController,
    AutomationExecutionsController,
    TemplatesController,
    NotificationsController,
  ],
  providers: [
    AutomationService,
    AutomationProcessor,
    TemplateRendererService,
    TemplatesService,
    NotificationsService,
  ],
  exports: [AutomationService, TemplateRendererService, TemplatesService, NotificationsService],
})
export class AutomationModule {}
