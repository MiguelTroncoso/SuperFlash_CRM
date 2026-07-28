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
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { operationsRequestMetadata } from '../operations/operations.http';
import { CredentialsService } from './credentials.service';
import { CreateCredentialDto, ListCredentialsQueryDto } from './dto/credentials.dto';

@ApiTags('credentials')
@ApiBearerAuth()
@Controller('credentials')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CredentialsController {
  constructor(private readonly service: CredentialsService) {}
  @Post()
  @Permissions('credentials.create')
  create(
    @Body() dto: CreateCredentialDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(dto, { user, metadata: operationsRequestMetadata(request) });
  }
  @Get()
  @Permissions('credentials.read')
  list(
    @Query() query: ListCredentialsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }
  @Get(':id')
  @Permissions('credentials.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }
  @Post(':id/reveal')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Permissions('credentials.reveal')
  reveal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.reveal(id, { user, metadata: operationsRequestMetadata(request) });
  }
  @Post(':id/revoke')
  @Permissions('credentials.revoke')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    return this.service.revoke(id, { user, metadata: operationsRequestMetadata(request) });
  }
}
