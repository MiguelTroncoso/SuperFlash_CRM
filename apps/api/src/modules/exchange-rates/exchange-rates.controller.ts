import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateExchangeRateDto } from './dto/exchange-rates.dto';
import { ExchangeRatesService } from './exchange-rates.service';
import { FxSchedulerService } from './fx-scheduler.service';

function extractMetadata(request: Request) {
  const forwarded = request.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : request.ip;
  const requestId = request.headers['x-request-id'];
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(typeof requestId === 'string' ? { requestId } : {}),
  };
}

@ApiTags('Exchange Rates')
@Controller('exchange-rates')
@UseGuards(JwtAuthGuard)
export class ExchangeRatesController {
  constructor(
    private readonly service: ExchangeRatesService,
    private readonly scheduler: FxSchedulerService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Get('scheduler-status')
  async schedulerStatus() {
    return this.scheduler.getStatus();
  }

  @Patch()
  async update(
    @Body() dto: UpdateExchangeRateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.service.updateRate(dto, user, extractMetadata(req));
  }

  @Post('refresh')
  async refresh(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.service.refreshRates(user.organizationId, user, extractMetadata(req));
  }
}
