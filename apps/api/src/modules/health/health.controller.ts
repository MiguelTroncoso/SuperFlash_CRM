import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check público de la API y PostgreSQL' })
  async check(@Res() response: Response): Promise<Response> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return response.status(HttpStatus.OK).json({ status: 'ok' });
    } catch {
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: 'error' });
    }
  }
}
