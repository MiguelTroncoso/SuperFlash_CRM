import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { MessageTemplateStatus } from '@prisma/client';

import { CreateTemplateDto } from './create-template.dto';

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {
  @ApiPropertyOptional({ enum: MessageTemplateStatus })
  @IsOptional()
  @IsEnum(MessageTemplateStatus)
  status?: MessageTemplateStatus;
}
