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

import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FollowUpsService } from './followups.service';
import { ArchiveFollowUpDto } from './dto/archive-followup.dto';
import { AssignFollowUpDto } from './dto/assign-followup.dto';
import { CancelFollowUpDto } from './dto/cancel-followup.dto';
import { CompleteFollowUpDto } from './dto/complete-followup.dto';
import { CreateFollowUpDto } from './dto/create-followup.dto';
import { FollowUpHistoryQueryDto } from './dto/history-query.dto';
import { ListFollowUpsQueryDto } from './dto/list-followups-query.dto';
import { RescheduleFollowUpDto } from './dto/reschedule-followup.dto';
import { UpdateFollowUpDto } from './dto/update-followup.dto';

function requestMetadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = forwardedIp || request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  return { ...(ipAddress ? { ipAddress } : {}), ...(userAgent ? { userAgent } : {}) };
}

@ApiTags('follow-ups')
@ApiBearerAuth()
@Controller('follow-ups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FollowUpsController {
  constructor(private readonly service: FollowUpsService) {}

  @Post()
  @Permissions('followups.create')
  @ApiOperation({ summary: 'Crea un seguimiento comercial' })
  create(
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.create(dto, { user, metadata: requestMetadata(request) });
  }

  @Get()
  @Permissions('followups.read')
  @ApiOperation({ summary: 'Lista seguimientos con filtros y paginación' })
  list(
    @Query() query: ListFollowUpsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(query, user);
  }

  @Get(':id/history')
  @Permissions('followups.read')
  @ApiOperation({ summary: 'Consulta historial append-only de un seguimiento' })
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FollowUpHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.history(id, query, user);
  }

  @Get(':id')
  @Permissions('followups.read')
  @ApiOperation({ summary: 'Obtiene detalle de seguimiento' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('followups.update')
  @ApiOperation({ summary: 'Actualiza campos editables de un seguimiento pendiente' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.update(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Patch(':id/assignee')
  @Permissions('followups.update')
  @ApiOperation({ summary: 'Asigna un seguimiento a un usuario activo' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.assign(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/complete')
  @Permissions('followups.update')
  @ApiOperation({ summary: 'Completa un seguimiento pendiente' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.complete(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/cancel')
  @Permissions('followups.update')
  @ApiOperation({ summary: 'Cancela un seguimiento pendiente' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.cancel(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/reschedule')
  @Permissions('followups.update')
  @ApiOperation({ summary: 'Reprograma conservando el registro original' })
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.reschedule(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/archive')
  @Permissions('followups.delete')
  @ApiOperation({ summary: 'Archiva un seguimiento de forma reversible' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.archive(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/restore')
  @Permissions('followups.delete')
  @ApiOperation({ summary: 'Restaura un seguimiento archivado' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.restore(id, { user, metadata: requestMetadata(request) });
  }
}
