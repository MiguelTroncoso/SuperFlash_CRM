import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { MessageTemplateChannel } from '@prisma/client';

const normalize = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class CreateTemplateDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(normalize)
  name!: string;

  @ApiProperty({ maxLength: 120, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ enum: MessageTemplateChannel })
  @IsEnum(MessageTemplateChannel)
  channel!: MessageTemplateChannel;

  @ApiPropertyOptional({ maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  subject?: string | null;

  @ApiProperty({ maxLength: 20000 })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;

  @ApiPropertyOptional({ type: [String], maxItems: 50 })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}
