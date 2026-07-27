import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { MyDayService } from './my-day.service';
import { MyDayQueryDto } from './dto/my-day-query.dto';

@ApiTags('my-day')
@ApiBearerAuth()
@Controller('my-day')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MyDayController {
  constructor(private readonly service: MyDayService) {}

  @Get()
  @Permissions('followups.read')
  @ApiOperation({ summary: 'Obtiene la bandeja backend Mi Día' })
  getMyDay(
    @Query() query: MyDayQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getMyDay(query, user);
  }

  @Get('summary')
  @Permissions('followups.read')
  @ApiOperation({ summary: 'Obtiene conteos de Mi Día' })
  getSummary(
    @Query() query: MyDayQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getSummary(query, user);
  }
}
