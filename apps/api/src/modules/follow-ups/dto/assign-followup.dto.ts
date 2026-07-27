import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignFollowUpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  assignedUserId!: string;
}
