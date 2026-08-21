import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CountriesService } from './countries.service';

function extractMetadata(request: Request) {
  const forwarded = request.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : request.ip;
  const requestId = request.headers['x-request-id'];
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(typeof requestId === 'string' ? { requestId } : {}),
  };
}

@ApiTags('Countries')
@Controller('countries')
@UseGuards(JwtAuthGuard)
export class CountriesController {
  constructor(private readonly service: CountriesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.organizationId);
  }

  @Patch(':code')
  async updateStatus(
    @Param('code') code: string,
    @Body('active') active: boolean,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.service.updateStatus(code, active, user, extractMetadata(req));
  }
}
