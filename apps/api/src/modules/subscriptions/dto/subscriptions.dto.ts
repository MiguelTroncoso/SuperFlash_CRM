import { BillingCycle, SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSubscriptionDto {
  @IsEnum(BillingCycle)
  @ApiProperty({ enum: BillingCycle })
  billingCycle!: BillingCycle;

  @IsOptional()
  @ApiPropertyOptional({ minimum: 1, maximum: 3650 })
  @IsInt()
  @Min(1)
  @Max(3650)
  customIntervalDays?: number;

  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  startsAt?: string;
}

export class ListSubscriptionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'nextBillingAt', 'currentPeriodEnd'])
  sortBy: 'createdAt' | 'updatedAt' | 'nextBillingAt' | 'currentPeriodEnd' = 'createdAt';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class CancelSubscriptionDto {
  @IsOptional()
  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason?: string;
}
