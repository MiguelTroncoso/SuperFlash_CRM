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

import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { automationRequestContext } from '../automation.http';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { ListTemplatesQueryDto } from '../dto/list-templates-query.dto';
import { TemplatePreviewDto } from '../dto/template-preview.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  @Permissions('templates.read')
  @ApiOperation({ summary: 'Lista plantillas de mensajes' })
  list(
    @Query() query: ListTemplatesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(query, user);
  }

  @Get(':id')
  @Permissions('templates.read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.findOne(id, user);
  }

  @Post()
  @Permissions('templates.create')
  @ApiOperation({ summary: 'Crea una plantilla con variables detectadas' })
  create(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.create(
      dto,
      user,
      automationRequestContext(request, user).metadata.requestId,
    );
  }

  @Patch(':id')
  @Permissions('templates.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.service.update(
      id,
      dto,
      user,
      automationRequestContext(request, user).metadata.requestId,
    );
  }

  @Post(':id/archive')
  @Permissions('templates.delete')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    return this.service.archive(
      id,
      user,
      automationRequestContext(request, user).metadata.requestId,
    );
  }

  @Post('preview')
  @Permissions('templates.read')
  @ApiOperation({ summary: 'Renderiza una vista previa de plantilla' })
  preview(
    @Body() dto: TemplatePreviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.preview(dto, user);
  }
}
