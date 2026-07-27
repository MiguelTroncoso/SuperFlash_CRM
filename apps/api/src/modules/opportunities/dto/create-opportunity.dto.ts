import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

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
  productId?: string | null;

  @ApiPropertyOptional({ example: '150000.00', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_AMOUNT)
  expectedAmount?: string | null;

  @ApiPropertyOptional({ example: 'CLP', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(CURRENCY)
  @Transform(upper)
  currency?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(trim)
  notes?: string | null;
}
