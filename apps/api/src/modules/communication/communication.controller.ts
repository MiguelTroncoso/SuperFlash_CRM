import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ChannelHealthService } from './services/channel-health.service';
import { ConversationImportService } from './services/conversation-import.service';
import { CommunicationMetricsService } from './services/communication-metrics.service';
import { WhatsAppReadOnlyHealthService } from './providers/whatsapp-readonly/whatsapp-readonly.health';
import { WhatsAppReadOnlyAnalyticsService } from './services/whatsapp-readonly-analytics.service';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunicationController {
  constructor(
    private readonly health: ChannelHealthService,
    private readonly metrics: CommunicationMetricsService,
    private readonly readOnlyHealth: WhatsAppReadOnlyHealthService,
    private readonly importer: ConversationImportService,
    private readonly readOnlyAnalytics: WhatsAppReadOnlyAnalyticsService,
  ) {}

  @Get('channels')
  @Permissions('whatsapp.read')
  @ApiOperation({ summary: 'Estado de los canales de comunicación del tenant' })
  listChannels(@CurrentUser() user: AuthenticatedUser) {
    return this.health.list(user.organizationId);
  }

  @Get('channels/whatsapp/health')
  @Permissions('whatsapp.read')
  @ApiOperation({ summary: 'Estado operativo de WhatsApp Cloud API' })
  whatsappHealth(@CurrentUser() user: AuthenticatedUser) {
    return this.health.getWhatsAppHealth(user.organizationId);
  }

  @Get('channels/whatsapp-read-only/health')
  @Permissions('whatsapp.read')
  @ApiOperation({ summary: 'Estado del conector WhatsApp exclusivamente de lectura' })
  whatsappReadOnlyHealth(@CurrentUser() user: AuthenticatedUser) {
    return this.readOnlyHealth.get(user.organizationId);
  }

  @Get('channels/whatsapp-read-only/sync-status')
  @Permissions('whatsapp.read')
  @ApiOperation({ summary: 'Checkpoint persistente de sincronización WhatsApp Read Only' })
  whatsappReadOnlySyncStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.importer.status(user.organizationId);
  }

  @Post('channels/whatsapp-read-only/sync')
  @HttpCode(HttpStatus.OK)
  @Permissions('whatsapp.manage')
  @ApiOperation({ summary: 'Sincroniza el read model local de WhatsApp sin llamadas externas' })
  syncWhatsAppReadOnly(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.importer.synchronize(user, { requestId: requestIdOf(request) });
  }

  @Post('channels/whatsapp-read-only/reindex')
  @HttpCode(HttpStatus.OK)
  @Permissions('whatsapp.manage')
  @ApiOperation({ summary: 'Reindexa el read model local sin cambiar datos manuales del contacto' })
  reindexWhatsAppReadOnly(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.importer.reindex(user, { requestId: requestIdOf(request) });
  }

  @Get('channels/whatsapp-read-only/metrics')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Métricas operacionales de conversaciones entrantes de WhatsApp' })
  whatsappReadOnlyMetrics(@CurrentUser() user: AuthenticatedUser) {
    return this.readOnlyAnalytics.get(user.organizationId);
  }

  @Post('channels/whatsapp/verify')
  @HttpCode(HttpStatus.OK)
  @Permissions('whatsapp.manage')
  @ApiOperation({ summary: 'Valida configuración local sin realizar llamadas externas' })
  verifyWhatsApp() {
    return this.health.verifyWhatsAppConfiguration();
  }

  @Get('metrics')
  @Permissions('audit.read')
  @ApiOperation({ summary: 'Métricas internas de comunicación en formato JSON' })
  metricsSnapshot() {
    return this.metrics.snapshot();
  }

  @Get('metrics/prometheus')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  @Permissions('audit.read')
  @ApiOperation({ summary: 'Métricas internas de comunicación para Prometheus' })
  metricsPrometheus(): string {
    return this.metrics.prometheus();
  }
}
