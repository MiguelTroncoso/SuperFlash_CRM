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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AssignOpportunityDto } from './dto/assign-opportunity.dto';
import { ArchiveOpportunityDto } from './dto/archive-opportunity.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { ListOpportunitiesQueryDto } from './dto/list-opportunities-query.dto';
import { MoveOpportunityDto } from './dto/move-opportunity.dto';
import { ReopenOpportunityDto } from './dto/reopen-opportunity.dto';
import { StageHistoryQueryDto } from './dto/stage-history-query.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

function requestMetadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = forwardedIp || request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  return { ...(ipAddress ? { ipAddress } : {}), ...(userAgent ? { userAgent } : {}) };
}

@ApiTags('opportunities')
@ApiBearerAuth()
@Controller('opportunities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  @Permissions('opportunities.create')
  @ApiOperation({ summary: 'Crea una oportunidad en el tenant autenticado' })
  async create(
    @Body() dto: CreateOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.create(dto, { user, metadata: requestMetadata(request) });
  }

  @Get()
  @Permissions('opportunities.read')
  @ApiOperation({ summary: 'Lista oportunidades con filtros y paginación' })
  async list(
    @Query() query: ListOpportunitiesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.opportunitiesService.list(query, user);
  }

  @Get(':id/stage-history')
  @Permissions('opportunities.read')
  @ApiOperation({ summary: 'Consulta el historial append-only de etapas' })
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StageHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.opportunitiesService.history(id, query, user);
  }

  @Get(':id')
  @Permissions('opportunities.read')
  @ApiOperation({ summary: 'Obtiene el detalle acotado de una oportunidad' })
  @ApiResponse({ status: 404, description: 'La oportunidad no existe en la organización actual.' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.opportunitiesService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('opportunities.update')
  @ApiOperation({ summary: 'Actualiza los campos editables de una oportunidad' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.update(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Patch(':id/assignee')
  @Permissions('opportunities.update')
  @ApiOperation({ summary: 'Asigna una oportunidad a un usuario del tenant' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.assign(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/move')
  @Permissions('opportunities.update')
  @ApiOperation({ summary: 'Mueve una oportunidad entre etapas' })
  async move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.move(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/reopen')
  @Permissions('opportunities.update')
  @ApiOperation({ summary: 'Reabre una oportunidad cerrada en una etapa abierta' })
  async reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.reopen(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/archive')
  @Permissions('opportunities.delete')
  @ApiOperation({ summary: 'Archiva una oportunidad de forma reversible' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.archive(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/restore')
  @Permissions('opportunities.delete')
  @ApiOperation({ summary: 'Restaura una oportunidad archivada' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.restore(id, { user, metadata: requestMetadata(request) });
  }
}
