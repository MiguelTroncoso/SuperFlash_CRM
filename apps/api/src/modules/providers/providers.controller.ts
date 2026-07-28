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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { operationsRequestMetadata } from '../operations/operations.http';
import { OperationsRequestContext } from '../operations/operations.types';
import { ProvidersService } from './providers.service';
import {
  CreateProviderDto,
  CreateProviderMappingDto,
  ListProviderMappingsQueryDto,
  ListProvidersQueryDto,
  ProviderStatusDto,
  UpdateProviderDto,
  UpdateProviderMappingDto,
} from './dto/providers.dto';

@ApiTags('providers')
@ApiBearerAuth()
@Controller('providers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProvidersController {
  constructor(private readonly service: ProvidersService) {}

  @Post()
  @Permissions('providers.create')
  create(
    @Body() dto: CreateProviderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(dto, this.context(user, request));
  }
  @Get()
  @Permissions('providers.read')
  list(
    @Query() query: ListProvidersQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }
  @Get(':id')
  @Permissions('providers.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }
  @Patch(':id')
  @Permissions('providers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.update(id, dto, this.context(user, request));
  }
  @Post(':id/status')
  @Permissions('providers.update')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProviderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.changeStatus(id, dto, this.context(user, request));
  }
  @Post(':id/archive')
  @Permissions('providers.delete')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    return this.service.archive(id, this.context(user, request));
  }
  @Post(':id/restore')
  @Permissions('providers.delete')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    return this.service.restore(id, this.context(user, request));
  }
  private context(user: AuthenticatedUser, request: Request): OperationsRequestContext {
    return { user, metadata: operationsRequestMetadata(request) };
  }
}

@ApiTags('provider-mappings')
@ApiBearerAuth()
@Controller('provider-mappings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProviderMappingsController {
  constructor(private readonly service: ProvidersService) {}

  @Post()
  @Permissions('provider_mappings.create')
  create(
    @Body() dto: CreateProviderMappingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.createMapping(dto, { user, metadata: operationsRequestMetadata(request) });
  }
  @Get()
  @Permissions('provider_mappings.read')
  list(
    @Query() query: ListProviderMappingsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.listMappings(query, user);
  }
  @Patch(':id')
  @Permissions('provider_mappings.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderMappingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.updateMapping(id, dto, {
      user,
      metadata: operationsRequestMetadata(request),
    });
  }
  @Post(':id/archive')
  @Permissions('provider_mappings.delete')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    return this.service.archiveMapping(id, { user, metadata: operationsRequestMetadata(request) });
  }
  @Post(':id/restore')
  @Permissions('provider_mappings.delete')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    return this.service.restoreMapping(id, { user, metadata: operationsRequestMetadata(request) });
  }
}
