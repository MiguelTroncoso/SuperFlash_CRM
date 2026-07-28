import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, Max } from 'class-validator';

import { NotificationStatus } from '@prisma/client';

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

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
