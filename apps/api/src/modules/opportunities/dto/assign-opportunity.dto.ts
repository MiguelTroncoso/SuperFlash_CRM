import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignOpportunityDto {
  @ApiProperty({ nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;
}
