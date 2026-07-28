import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { OffersQueryDto } from '../dto/catalog.dto';
import { OffersService } from './offers.service';

@ApiTags('catalog-offers')
@ApiBearerAuth()
@Controller('catalog/offers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OffersController {
  constructor(private readonly service: OffersService) {}
  @Get()
  @Permissions('catalog.read')
  list(
    @Query() query: OffersQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.service.list(query, user);
  }
}
