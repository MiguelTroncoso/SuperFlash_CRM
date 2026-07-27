import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const normalize = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTagDto {
  @ApiProperty({ example: 'Cliente potencial' })
  @IsString()
  @MaxLength(100)
  @Transform(normalize)
  name!: string;

  @ApiPropertyOptional({ example: '#2563EB', nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  @Transform(normalize)
  color?: string | null;
}
