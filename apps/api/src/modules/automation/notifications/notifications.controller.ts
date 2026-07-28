import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { requestIdOf } from '../../../infrastructure/http/request-correlation';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { ListNotificationsQueryDto } from '../dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @Permissions('notifications.read')
  @ApiOperation({ summary: 'Lista el centro de notificaciones del usuario' })
  list(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(query, user);
  }

  @Post(':id/read')
  @Permissions('notifications.update')
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.read(id, user, requestIdOf(request));
  }

  @Post(':id/archive')
  @Permissions('notifications.update')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    return this.service.archive(id, user, requestIdOf(request));
  }

  @Post('read-all')
  @Permissions('notifications.update')
  @ApiOperation({ summary: 'Marca todas las notificaciones como leídas' })
  readAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<{ updated: number }> {
    return this.service.readAll(user, requestIdOf(request));
  }
}
