import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STRONG_PASSWORD_PATTERN =
  /^(?=.{10,128}$)(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/;

export class ResetPasswordDto {
  @ApiProperty({ example: 'opaque-token-generated-in-development' })
  @IsString()
  @IsNotEmpty()
  @Matches(RESET_TOKEN_PATTERN)
  token!: string;

  @ApiProperty({ example: 'NewOwnerPassword1!' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_PATTERN, {
    message: 'La contraseña debe incluir mayúscula, minúscula, número y símbolo.',
  })
  password!: string;
}
