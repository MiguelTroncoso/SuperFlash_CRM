import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { OperationalDashboardService } from './operational-dashboard.service';
import {
  ImportDailyMetricsDto,
  ListDailyMetricsQueryDto,
  OperationalDashboardQueryDto,
  UpdateDailyMetricDto,
  UpsertDailyMetricDto,
} from './dto/operational-dashboard.dto';

function metadata(request: Request) {
  const forwarded = request.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : request.ip;
  return { ...(ipAddress ? { ipAddress } : {}), requestId: requestIdOf(request) };
}

@ApiTags('operations')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OperationalDashboardController {
  constructor(private readonly service: OperationalDashboardService) {}

  @Get('operational')
  @Permissions('operations.read')
  @ApiOperation({ summary: 'Dashboard operativo diario y métricas reales de ventas' })
  operational(
    @Query() query: OperationalDashboardQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.dashboard(query, user);
  }

  @Get('daily-metrics')
  @Permissions('operations.read')
  @ApiOperation({ summary: 'Lista métricas manuales diarias' })
  list(@Query() query: ListDailyMetricsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listDailyMetrics(query, user);
  }

  @Post('daily-metrics')
  @Permissions('operations.manage')
  @ApiOperation({ summary: 'Registra o actualiza una fila del día operativo' })
  create(
    @Body() dto: UpsertDailyMetricDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.upsertDailyMetric(dto, user, metadata(request));
  }

  @Patch('daily-metrics/:id')
  @Permissions('operations.manage')
  @ApiOperation({ summary: 'Actualiza una fila manual del día operativo' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDailyMetricDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateDailyMetric(id, dto, user, metadata(request));
  }

  @Post('daily-metrics/import/preview')
  @Permissions('operations.manage')
  @ApiOperation({ summary: 'Valida un CSV de métricas sin persistirlo' })
  preview(@Body() dto: ImportDailyMetricsDto) {
    return this.service.previewImport(dto);
  }

  @Post('daily-metrics/import')
  @Permissions('operations.manage')
  @ApiOperation({ summary: 'Importa métricas históricas de forma idempotente' })
  import(
    @Body() dto: ImportDailyMetricsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.importDailyMetrics(dto, user, metadata(request));
  }
}
