import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ContactsService } from './contacts.service';
import { ArchiveContactDto } from './dto/archive-contact.dto';
import { AssignContactDto } from './dto/assign-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

function requestMetadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = forwardedIp || request.ip;
  const userAgent = request.get('user-agent')?.slice(0, 512);
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

@ApiTags('contacts')
@ApiBearerAuth()
@Controller('contacts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @Permissions('contacts.create')
  @ApiOperation({ summary: 'Crea un contacto y opcionalmente su oportunidad inicial' })
  @ApiResponse({ status: 201, description: 'Contacto creado.' })
  async create(
    @Body() dto: CreateContactDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.contactsService.create(dto, { user, metadata: requestMetadata(request) });
  }

  @Get()
  @Permissions('contacts.read')
  @ApiOperation({ summary: 'Lista contactos con paginación, búsqueda y filtros' })
  async list(
    @Query() query: ListContactsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.contactsService.list(query, user);
  }

  @Get(':id')
  @Permissions('contacts.read')
  @ApiOperation({ summary: 'Obtiene el detalle acotado de un contacto' })
  @ApiResponse({ status: 404, description: 'Contacto no encontrado en la organización.' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.contactsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('contacts.update')
  @ApiOperation({ summary: 'Actualiza campos editables del contacto' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.contactsService.update(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/archive')
  @Permissions('contacts.delete')
  @ApiOperation({ summary: 'Archiva un contacto mediante soft delete de negocio' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveContactDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.contactsService.archive(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/restore')
  @Permissions('contacts.delete')
  @ApiOperation({ summary: 'Restaura un contacto archivado' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.contactsService.restore(id, { user, metadata: requestMetadata(request) });
  }

  @Patch(':id/assignee')
  @Permissions('contacts.update')
  @ApiOperation({ summary: 'Asigna o desasigna el responsable del contacto' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignContactDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.contactsService.assign(id, dto, { user, metadata: requestMetadata(request) });
  }

  @Post(':id/tags/:tagId')
  @Permissions('contacts.update')
  @ApiOperation({ summary: 'Agrega una etiqueta al contacto' })
  async addTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.contactsService.addTag(id, tagId, { user, metadata: requestMetadata(request) });
  }

  @Delete(':id/tags/:tagId')
  @Permissions('contacts.update')
  @ApiOperation({ summary: 'Quita una etiqueta mediante soft delete de asociación' })
  async removeTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.contactsService.removeTag(id, tagId, { user, metadata: requestMetadata(request) });
  }
}
