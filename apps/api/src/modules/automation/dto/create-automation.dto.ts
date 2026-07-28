import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { AutomationTrigger } from '@prisma/client';

import { AutomationActionDto } from './automation-action.dto';

export class CreateAutomationDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({ enum: AutomationTrigger })
  @IsEnum(AutomationTrigger)
  trigger!: AutomationTrigger;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown> | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  templateId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({ type: [AutomationActionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AutomationActionDto)
  actions!: AutomationActionDto[];
}
