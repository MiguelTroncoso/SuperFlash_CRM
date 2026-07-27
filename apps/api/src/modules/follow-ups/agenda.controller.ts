import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AgendaService } from './agenda.service';
import { AgendaQueryDto } from './dto/agenda-query.dto';
import { AgendaSummaryQueryDto } from './dto/agenda-summary-query.dto';

@ApiTags('agenda')
@ApiBearerAuth()
@Controller('agenda')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgendaController {
  constructor(private readonly service: AgendaService) {}

  @Get()
  @Permissions('followups.read')
  @ApiOperation({ summary: 'Obtiene la agenda diaria en una zona horaria IANA' })
  getAgenda(
    @Query() query: AgendaQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getAgenda(query, user);
  }

  @Get('summary')
  @Permissions('followups.read')
  @ApiOperation({ summary: 'Obtiene resúmenes diarios de agenda' })
  getSummary(
    @Query() query: AgendaSummaryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getSummary(query, user);
  }
}
