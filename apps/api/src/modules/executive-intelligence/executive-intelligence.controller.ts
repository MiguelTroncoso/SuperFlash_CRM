import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  GlobalSearchQueryDto,
  IntelligenceQueryDto,
  PipelineIntelligenceQueryDto,
} from './dto/intelligence.dto';
import { ExecutiveIntelligenceService } from './executive-intelligence.service';

@ApiTags('executive-intelligence')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExecutiveIntelligenceController {
  constructor(private readonly service: ExecutiveIntelligenceService) {}

  @Get('executive/dashboard')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Dashboard ejecutivo consolidado desde datos persistidos' })
  dashboard(@Query() query: IntelligenceQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.dashboard(query, user);
  }

  @Get('business-intelligence/:view')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Vista de Business Intelligence por dimensión' })
  businessIntelligence(
    @Param('view') view: string,
    @Query() query: IntelligenceQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const allowed = [
      'summary',
      'countries',
      'products',
      'campaigns',
      'sellers',
      'providers',
      'renewals',
    ];
    return this.service.businessIntelligence(
      query,
      user,
      allowed.includes(view) ? view : 'summary',
    );
  }

  @Get('customer-360/:contactId')
  @Permissions('contacts.read')
  @ApiOperation({ summary: 'Perfil 360 del cliente sin secretos de credenciales' })
  customer360(
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.customer360(contactId, user);
  }

  @Get('global-search')
  @Permissions('reports.read')
  @ApiOperation({ summary: 'Búsqueda global multi-dominio y tenant-scoped' })
  globalSearch(@Query() query: GlobalSearchQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.globalSearch(query, user);
  }

  @Get('agenda/operational')
  @Permissions('followups.read')
  @ApiOperation({ summary: 'Agenda operativa consolidada' })
  operationalAgenda(@CurrentUser() user: AuthenticatedUser) {
    return this.service.operationalAgenda(user);
  }

  @Get('pipeline/intelligence')
  @Permissions('opportunities.read')
  @ApiOperation({ summary: 'Pipeline con antigüedad, estancamiento y valor ponderado' })
  pipeline(@Query() query: PipelineIntelligenceQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.pipeline(query, user);
  }
}
