import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, Max } from 'class-validator';

import { MessageTemplateChannel, MessageTemplateStatus } from '@prisma/client';

export class ListTemplatesQueryDto {
  @IsOptional()
  @IsEnum(MessageTemplateStatus)
  status?: MessageTemplateStatus;

  @IsOptional()
  @IsEnum(MessageTemplateChannel)
  channel?: MessageTemplateChannel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 25;
}
