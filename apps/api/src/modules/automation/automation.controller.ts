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

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { automationRequestContext } from './automation.http';
import { AutomationService } from './automation.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import {
  ListAutomationExecutionsQueryDto,
  ListAutomationsQueryDto,
} from './dto/list-automations-query.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';
import { ToggleAutomationDto } from './dto/toggle-automation.dto';

@ApiTags('automations')
@ApiBearerAuth()
@Controller('automations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AutomationController {
  constructor(private readonly service: AutomationService) {}

  @Get()
  @Permissions('automations.read')
  @ApiOperation({ summary: 'Lista reglas de automatización del tenant' })
  list(
    @Query() query: ListAutomationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.listRules(query, user);
  }

  @Get(':id')
  @Permissions('automations.read')
  @ApiOperation({ summary: 'Obtiene una regla de automatización' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.findRule(id, user);
  }

  @Post()
  @Permissions('automations.create')
  @ApiOperation({ summary: 'Crea una regla de automatización' })
  create(
    @Body() dto: CreateAutomationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    const context = automationRequestContext(request, user);
    return this.service.createRule(dto, context);
  }

  @Patch(':id')
  @Permissions('automations.update')
  @ApiOperation({ summary: 'Actualiza una regla de automatización' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAutomationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    const context = automationRequestContext(request, user);
    return this.service.updateRule(id, dto, context);
  }

  @Post(':id/toggle')
  @Permissions('automations.update')
  @ApiOperation({ summary: 'Activa o desactiva una regla' })
  toggle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleAutomationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    const context = automationRequestContext(request, user);
    return this.service.toggle(id, dto.active, context);
  }
}

@ApiTags('automation-executions')
@ApiBearerAuth()
@Controller('automation-executions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AutomationExecutionsController {
  constructor(private readonly service: AutomationService) {}

  @Get()
  @Permissions('automation_executions.read')
  @ApiOperation({ summary: 'Lista el historial de ejecuciones' })
  list(
    @Query() query: ListAutomationExecutionsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.listExecutions(query, user);
  }
}
