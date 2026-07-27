import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

function metadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers['x-forwarded-for'];
  const ipAddress =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @Permissions('contacts.read')
  @ApiOperation({ summary: 'Lista etiquetas activas de la organización' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.tagsService.list(user);
  }

  @Post()
  @Permissions('contacts.update')
  @ApiOperation({ summary: 'Crea una etiqueta' })
  async create(
    @Body() dto: CreateTagDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.tagsService.create(dto, { user, metadata: metadata(request) });
  }

  @Patch(':id')
  @Permissions('contacts.update')
  @ApiOperation({ summary: 'Actualiza una etiqueta' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.tagsService.update(id, dto, { user, metadata: metadata(request) });
  }

  @Post(':id/archive')
  @Permissions('contacts.update')
  @ApiOperation({ summary: 'Archiva una etiqueta' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.tagsService.archive(id, { user, metadata: metadata(request) });
  }

  @Post(':id/restore')
  @Permissions('contacts.update')
  @ApiOperation({ summary: 'Restaura una etiqueta archivada' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.tagsService.restore(id, { user, metadata: metadata(request) });
  }
}
