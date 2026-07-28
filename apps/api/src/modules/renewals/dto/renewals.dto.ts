import { RenewalStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateRenewalDto {
  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  dueAt?: string;
}

export class ListRenewalsQueryDto {
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
  @IsEnum(RenewalStatus)
  status?: RenewalStatus;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'dueAt', 'paidAt'])
  sortBy: 'createdAt' | 'updatedAt' | 'dueAt' | 'paidAt' = 'dueAt';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}

export class CancelRenewalDto {
  @IsOptional()
  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason?: string;
}
