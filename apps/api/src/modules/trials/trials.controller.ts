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

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { operationsRequestMetadata } from '../operations/operations.http';
import { CreateTrialDto, ListTrialsQueryDto } from './dto/trials.dto';
import { TrialsService } from './trials.service';
import { TrialStatus } from '@prisma/client';

@ApiTags('trials')
@ApiBearerAuth()
@Controller('trials')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TrialsController {
  constructor(private readonly service: TrialsService) {}
  @Post()
  @Permissions('trials.create')
  create(
    @Body() dto: CreateTrialDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(dto, { user, metadata: operationsRequestMetadata(request) });
  }
  @Get()
  @Permissions('trials.read')
  list(
    @Query() query: ListTrialsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }
  @Get(':id')
  @Permissions('trials.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }
  @Post(':id/approve')
  @Permissions('trials.update')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.transition(id, TrialStatus.APPROVED, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }
  @Post(':id/activate')
  @Permissions('trials.update')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.transition(id, TrialStatus.ACTIVE, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }
  @Post(':id/expire')
  @Permissions('trials.update')
  expire(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.transition(id, TrialStatus.EXPIRED, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }
  @Post(':id/cancel')
  @Permissions('trials.update')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.transition(id, TrialStatus.CANCELLED, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }
  @Post(':id/convert')
  @Permissions('trials.update')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.convert(id, { user, metadata: operationsRequestMetadata(request) });
  }
}
