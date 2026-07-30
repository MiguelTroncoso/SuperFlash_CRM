import { Controller, Get, Header, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ChannelHealthService } from './services/channel-health.service';
import { CommunicationMetricsService } from './services/communication-metrics.service';

@ApiTags('communication')
@ApiBearerAuth()
@Controller('communication')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunicationController {
  constructor(
    private readonly health: ChannelHealthService,
    private readonly metrics: CommunicationMetricsService,
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
