import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { FollowUpPriority } from '@prisma/client';

const normalize = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class CreateFollowUpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  opportunityId!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  @Transform(normalize)
  title!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  dueAt!: string;

  @ApiProperty({ enum: FollowUpPriority })
  @IsEnum(FollowUpPriority)
  priority!: FollowUpPriority;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(normalize)
  note?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  reminderAt?: string | null;
}
