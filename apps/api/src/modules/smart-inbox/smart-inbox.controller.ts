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
  Sse,
  UseGuards,
} from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Observable } from 'rxjs';

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  AssignWhatsAppConversationDto,
  SendWhatsAppMessageDto,
} from '../whatsapp/dto/whatsapp.dto';
import {
  AddInboxNoteDto,
  CreateInboxFulfillmentDto,
  CreateInboxSaleDto,
  CreateInboxTrialDto,
  ListSmartInboxQueryDto,
  MoveInboxPipelineDto,
  ScheduleInboxFollowUpDto,
} from './dto/smart-inbox.dto';
import { SmartInboxEventsService } from './smart-inbox.events';
import { SmartInboxService } from './smart-inbox.service';

function requestMetadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = forwardedIp || request.ip;
  const userAgent = request.get('user-agent');
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent: userAgent.slice(0, 512) } : {}),
    requestId: requestIdOf(request),
  };
}

@ApiTags('smart-inbox')
@ApiBearerAuth()
@Controller('smart-inbox')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SmartInboxController {
  constructor(
    private readonly service: SmartInboxService,
    private readonly events: SmartInboxEventsService,
  ) {}

  @Get('conversations')
  @Permissions('whatsapp.read')
  @ApiOperation({ summary: 'Lista conversaciones enriquecidas para el workspace operativo' })
  list(@Query() query: ListSmartInboxQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(query, user);
  }

  @Get('conversations/:id')
  @Permissions('whatsapp.read')
  @ApiOperation({ summary: 'Obtiene conversación, mensajes y panel operacional' })
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.detail(id, user);
  }

  @Get('conversations/:id/timeline')
  @Permissions('whatsapp.read')
  timeline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.timeline(id, user);
  }

  @Get('search')
  @Permissions('whatsapp.read')
  search(@Query() query: ListSmartInboxQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list({ ...query, limit: Math.min(query.limit, 50) }, user);
  }

  @Sse('events')
  @Permissions('whatsapp.read')
  @ApiOperation({ summary: 'Stream SSE de cambios del workspace operacional' })
  eventsStream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.events.stream(user.organizationId);
  }

  @Post('conversations/:id/read')
  @Permissions('whatsapp.read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.markRead(id, { user, metadata: requestMetadata(request) });
  }

  @Patch('conversations/:id/assignee')
  @Permissions('whatsapp.conversations.assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignWhatsAppConversationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.assign(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/messages')
  @Permissions('whatsapp.send')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendWhatsAppMessageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.sendMessage(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/actions/note')
  @Permissions('contacts.update')
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddInboxNoteDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.addNote(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/actions/move-pipeline')
  @Permissions('opportunities.update')
  movePipeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveInboxPipelineDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.movePipeline(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/actions/create-sale')
  @Permissions('sales.create')
  createSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInboxSaleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createSale(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/actions/follow-up')
  @Permissions('followups.create')
  scheduleFollowUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleInboxFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.scheduleFollowUp(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/actions/fulfillment')
  @Permissions('fulfillments.create')
  createFulfillment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInboxFulfillmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createFulfillment(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/actions/trial')
  @Permissions('trials.create')
  createTrial(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInboxTrialDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createTrial(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/close')
  @Permissions('whatsapp.read')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.changeStatus(id, 'CLOSED', { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/archive')
  @Permissions('whatsapp.read')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.changeStatus(id, 'ARCHIVED', { user, metadata: requestMetadata(request) });
  }

  @Post('conversations/:id/restore')
  @Permissions('whatsapp.read')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.changeStatus(id, 'OPEN', { user, metadata: requestMetadata(request) });
  }
}
