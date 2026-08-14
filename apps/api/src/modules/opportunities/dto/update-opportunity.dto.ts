import { ApiPropertyOptional } from '@nestjs/swagger';
import { OpportunityPriority } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const DECIMAL_AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;

export class UpdateOpportunityDto {
  @ApiPropertyOptional({ example: 'Panel reseller anual' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Transform(trim)
  title?: string;

  @ApiPropertyOptional({ example: '150000.00', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_AMOUNT)
  expectedAmount?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  estimatedPurchaseAt?: string | null;

  @ApiPropertyOptional({ example: 'CLP', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY)
  @Transform(upper)
  currency?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  campaignId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @ApiPropertyOptional({ enum: OpportunityPriority })
  @IsOptional()
  @IsEnum(OpportunityPriority)
  priority?: OpportunityPriority;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
}
