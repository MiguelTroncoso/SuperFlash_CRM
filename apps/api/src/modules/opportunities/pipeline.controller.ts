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
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { PipelineQueryDto } from './dto/pipeline-query.dto';
import { ReorderPipelineStageDto } from './dto/reorder-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';
import { OpportunitiesService } from './opportunities.service';

function requestMetadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = forwardedIp || request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
    requestId: requestIdOf(request),
  };
}

@ApiTags('pipeline')
@ApiBearerAuth()
@Controller('pipeline')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PipelineController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get()
  @Permissions('opportunities.read')
  @ApiOperation({ summary: 'Obtiene el tablero Kanban por columnas de etapa' })
  async getPipeline(
    @Query() query: PipelineQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.opportunitiesService.getPipeline(query, user);
  }

  @Get('summary')
  @Permissions('opportunities.read')
  @ApiOperation({ summary: 'Obtiene conteos y montos separados por moneda' })
  async getSummary(
    @Query() query: PipelineQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.opportunitiesService.getPipelineSummary(query, user);
  }

  @Get('stages/:id/opportunities')
  @Permissions('opportunities.read')
  @ApiOperation({ summary: 'Lista oportunidades de una columna con cursor' })
  async getStageOpportunities(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PipelineQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.opportunitiesService.getStageOpportunities(id, query, user);
  }

  @Post('stages')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Crea una etapa del pipeline' })
  async createStage(
    @Body() dto: CreatePipelineStageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.createStage(dto, { user, metadata: requestMetadata(request) });
  }

  @Patch('stages/:id')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Actualiza nombre, color o activación de una etapa' })
  async updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePipelineStageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.updateStage(id, dto, {
      user,
      metadata: requestMetadata(request),
    });
  }

  @Post('stages/:id/reorder')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Reordena etapas con bloqueo transaccional por organización' })
  async reorderStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderPipelineStageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.reorderStage(id, dto, {
      user,
      metadata: requestMetadata(request),
    });
  }

  @Post('stages/:id/archive')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Archiva una etapa sin eliminarla físicamente' })
  async archiveStage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.archiveStage(id, { user, metadata: requestMetadata(request) });
  }

  @Post('stages/:id/restore')
  @Permissions('settings.manage')
  @ApiOperation({ summary: 'Restaura una etapa archivada' })
  async restoreStage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.opportunitiesService.restoreStage(id, { user, metadata: requestMetadata(request) });
  }
}
