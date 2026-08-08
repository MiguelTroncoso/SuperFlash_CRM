import { ApiPropertyOptional } from '@nestjs/swagger';
import { OpportunityPriority } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateLeadDto {
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  lastName?: string | null;

  @ApiPropertyOptional({ example: 'juan@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(trim)
  email?: string | null;

  @ApiPropertyOptional({ example: '9 1234 5678' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(trim)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'CL' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Transform(upper)
  country?: string | null;

  @ApiPropertyOptional({ example: 'META_ADS', default: 'MANUAL' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trim)
  source?: string;

  @ApiPropertyOptional({ example: 'META' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trim)
  platform?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  adSetId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  adId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  creativeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Etapa comercial inicial opcional.' })
  @IsOptional()
  @IsUUID()
  pipelineStageId?: string;

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

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(trim)
  note?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  nextFollowUpAt?: string | null;
}
