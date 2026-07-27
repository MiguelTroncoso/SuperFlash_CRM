import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

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
  productId?: string | null;
}
