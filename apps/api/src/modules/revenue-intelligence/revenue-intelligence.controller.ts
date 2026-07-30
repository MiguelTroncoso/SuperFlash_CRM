import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RevenueQueryDto } from './dto/revenue-query.dto';
import { RevenueIntelligenceService } from './revenue-intelligence.service';

@ApiTags('revenue-intelligence')
@ApiBearerAuth()
@Controller('revenue-intelligence')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('reports.read')
export class RevenueIntelligenceController {
  constructor(private readonly service: RevenueIntelligenceService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard ejecutivo de Revenue Intelligence Phase 1' })
  dashboard(@Query() query: RevenueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getDashboard(query, user);
  }

  @Get('kpis')
  @ApiOperation({ summary: 'KPIs comerciales calculados desde datos operacionales' })
  kpis(@Query() query: RevenueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getKpis(query, user);
  }

  @Get('funnels')
  @ApiOperation({ summary: 'Embudo configurable y comparación de períodos' })
  funnels(@Query() query: RevenueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getFunnel(query, user);
  }

  @Get('cohorts')
  @ApiOperation({ summary: 'Cohortes mensuales de clientes y revenue' })
  cohorts(@Query() query: RevenueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getCohorts(query, user);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Tendencias agregadas por día' })
  trends(@Query() query: RevenueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getTrends(query, user);
  }

  @Get('forecast')
  @ApiOperation({ summary: 'Forecast histórico básico sin IA' })
  forecast(@Query() query: RevenueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getForecast(query, user);
  }

  @Get('communication')
  @ApiOperation({ summary: 'Métricas de conversaciones entrantes de WhatsApp Read Only' })
  communication(@Query() query: RevenueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getCommunicationMetrics(query, user);
  }

  @Get('materialized-views/status')
  @ApiOperation({ summary: 'Estado de los agregados materializados analíticos' })
  materializedViewStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMaterializedViewStatus(user);
  }
}
