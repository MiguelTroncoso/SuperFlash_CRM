import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { operationsRequestMetadata } from '../operations/operations.http';
import { WhatsAppService } from './whatsapp.service';
import {
  AssignWhatsAppConversationDto,
  ListWhatsAppConversationsQueryDto,
  ListWhatsAppMessagesQueryDto,
  SendWhatsAppMessageDto,
  UpsertWhatsAppConnectionDto,
  WhatsAppTemplateQueryDto,
} from './dto/whatsapp.dto';

@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('integrations/whatsapp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppController {
  constructor(private readonly service: WhatsAppService) {}

  @Get('connection')
  @Permissions('whatsapp.read')
  getConnection(@CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown> | null> {
    return this.service.getConnection(user);
  }

  @Put('connection')
  @Permissions('whatsapp.manage')
  upsertConnection(
    @Body() dto: UpsertWhatsAppConnectionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.upsertConnection(dto, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }

  @Post('connection/test')
  @Permissions('whatsapp.manage')
  testConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.testConnection({ user, metadata: operationsRequestMetadata(request) });
  }

  @Post('connection/disconnect')
  @Permissions('whatsapp.manage')
  async disconnect(@CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.service.disconnect({ user, metadata: operationsRequestMetadata(request) });
  }

  @Get('conversations')
  @Permissions('whatsapp.read')
  listConversations(
    @Query() query: ListWhatsAppConversationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.listConversations(query, user);
  }

  @Get('conversations/:id/messages')
  @Permissions('whatsapp.read')
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListWhatsAppMessagesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.listMessages(id, query, user);
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Permissions('whatsapp.send')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendWhatsAppMessageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.sendMessage(id, dto, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }

  @Patch('conversations/:id/assignee')
  @Permissions('whatsapp.conversations.assign')
  assignConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignWhatsAppConversationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.assignConversation(id, dto, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }

  @Get('templates')
  @Permissions('whatsapp.templates.read')
  listTemplates(
    @Query() query: WhatsAppTemplateQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.listTemplates(query, user);
  }

  @Post('templates/sync')
  @Permissions('whatsapp.templates.read')
  syncTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.syncTemplates({ user, metadata: operationsRequestMetadata(request) });
  }
}
