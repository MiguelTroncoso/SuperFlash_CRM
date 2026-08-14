import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateOpportunityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  contactId!: string;

  @ApiProperty({ example: 'Panel reseller anual' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Transform(trim)
  title!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pipelineStageId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

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

  @ApiPropertyOptional({ example: '150000.00', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_AMOUNT)
  expectedAmount?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  estimatedPurchaseAt?: string | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  nextFollowUpAt?: string | null;

  @ApiPropertyOptional({ example: 'CLP', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY)
  @Transform(upper)
  currency?: string | null;

  @ApiPropertyOptional({ enum: OpportunityPriority, default: OpportunityPriority.NORMAL })
  @IsOptional()
  @IsEnum(OpportunityPriority)
  priority?: OpportunityPriority;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(trim)
  notes?: string | null;
}
