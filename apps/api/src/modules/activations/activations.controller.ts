import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { ActivationStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { operationsRequestMetadata } from '../operations/operations.http';
import { ActivationsService } from './activations.service';
import { CreateActivationDto, ListActivationsQueryDto } from './dto/activations.dto';

@ApiTags('activations')
@ApiBearerAuth()
@Controller('activations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ActivationsController {
  constructor(private readonly service: ActivationsService) {}
  @Post()
  @Permissions('activations.create')
  create(
    @Body() dto: CreateActivationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(dto, { user, metadata: operationsRequestMetadata(request) });
  }
  @Get()
  @Permissions('activations.read')
  list(
    @Query() query: ListActivationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }
  @Get(':id')
  @Permissions('activations.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }
  @Post(':id/activate')
  @Permissions('activations.update')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.transition(id, ActivationStatus.ACTIVE, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }
  @Post(':id/suspend')
  @Permissions('activations.update')
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.transition(id, ActivationStatus.SUSPENDED, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }
  @Post(':id/reactivate')
  @Permissions('activations.update')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.transition(id, ActivationStatus.ACTIVE, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }
  @Post(':id/revoke')
  @Permissions('activations.delete')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.transition(id, ActivationStatus.REVOKED, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }
}
