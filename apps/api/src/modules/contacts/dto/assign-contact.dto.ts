import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignContactDto {
  @ApiProperty({ nullable: true, format: 'uuid', description: 'Usa null para quitar responsable.' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;
}
