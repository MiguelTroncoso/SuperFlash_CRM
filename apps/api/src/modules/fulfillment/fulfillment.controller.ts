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
import { FulfillmentService } from './fulfillment.service';
import {
  AssignFulfillmentDto,
  CompleteFulfillmentDto,
  CreateFulfillmentDto,
  FailFulfillmentDto,
  ListFulfillmentsQueryDto,
  ListProvisioningAttemptsQueryDto,
  ProvisionFulfillmentDto,
} from './dto/fulfillment.dto';

@ApiTags('fulfillments')
@ApiBearerAuth()
@Controller('fulfillments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FulfillmentController {
  constructor(private readonly service: FulfillmentService) {}

  @Post()
  @Permissions('fulfillments.create')
  create(
    @Body() dto: CreateFulfillmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.create(dto, { user, metadata: operationsRequestMetadata(request) });
  }
  @Get()
  @Permissions('fulfillments.read')
  list(
    @Query() query: ListFulfillmentsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }
  @Get(':id')
  @Permissions('fulfillments.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.findOne(id, user);
  }
  @Patch(':id/assign')
  @Permissions('fulfillments.update')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignFulfillmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.assign(id, dto, { user, metadata: operationsRequestMetadata(request) });
  }
  @Post(':id/start')
  @Permissions('fulfillments.update')
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.start(id, { user, metadata: operationsRequestMetadata(request) });
  }
  @Post(':id/provision')
  @Permissions('fulfillments.update')
  provision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProvisionFulfillmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.provision(id, dto, { user, metadata: operationsRequestMetadata(request) });
  }
  @Post(':id/complete')
  @Permissions('fulfillments.update')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteFulfillmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.complete(id, dto, { user, metadata: operationsRequestMetadata(request) });
  }
  @Post(':id/fail')
  @Permissions('fulfillments.update')
  fail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FailFulfillmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.fail(id, dto, { user, metadata: operationsRequestMetadata(request) });
  }
  @Post(':id/cancel')
  @Permissions('fulfillments.delete')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<Record<string, unknown>> {
    return this.service.cancel(id, { user, metadata: operationsRequestMetadata(request) });
  }
}

@ApiTags('provisioning-attempts')
@ApiBearerAuth()
@Controller('provisioning-attempts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProvisioningController {
  constructor(private readonly service: FulfillmentService) {}

  @Get()
  @Permissions('provisioning.read')
  list(
    @Query() query: ListProvisioningAttemptsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.listAttempts(query, user);
  }
}
