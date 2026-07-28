import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PricingResolveQueryDto } from '../dto/catalog.dto';
import { PricingService } from './pricing.service';

@ApiTags('catalog-pricing')
@ApiBearerAuth()
@Controller('catalog/pricing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PricingController {
  constructor(private readonly service: PricingService) {}
  @Get('resolve')
  @Permissions('catalog.prices.read')
  resolve(
    @Query() query: PricingResolveQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.resolve(query, user);
  }
}
