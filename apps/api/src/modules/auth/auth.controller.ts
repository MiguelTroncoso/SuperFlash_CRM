import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { requestIdOf } from '../../infrastructure/http/request-correlation';
import { authException, AUTH_ERROR_CODES } from './auth.errors';
import { AuthService, REFRESH_COOKIE_NAME } from './auth.service';
import { AuthenticatedUser, RequestMetadata } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Permissions } from './decorators/permissions.decorator';
import {
  ForgotPasswordRateLimitGuard,
  LoginEmailRateLimitGuard,
} from './guards/email-rate-limit.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface AuthenticatedResponse {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    timezone: string;
    organization: {
      id: string;
      name: string;
      slug: string;
    };
    role: {
      id: string;
      name: string;
    };
    permissions: readonly string[];
  };
}

function requestMetadata(request: Request): RequestMetadata {
  const userAgent = request.get('user-agent')?.slice(0, 512);
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
  const ipAddress = request.ip || forwardedIp;

  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
    requestId: requestIdOf(request),
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(LoginEmailRateLimitGuard)
  @ApiOperation({ summary: 'Inicia una sesión de usuario' })
  @ApiBody({ type: LoginDto })
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiResponse({ status: 200, description: 'Access token y usuario autenticado.' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedResponse> {
    const result = await this.authService.login(dto, requestMetadata(request));
    response.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );
    return this.toPublicResponse(result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rota la sesión de renovación y emite un access token nuevo' })
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiResponse({ status: 200, description: 'Access token renovado.' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido o reutilizado.' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedResponse> {
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const result = await this.authService.refresh(refreshToken, requestMetadata(request));
    response.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );
    return this.toPublicResponse(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoca la sesión actual y limpia la cookie' })
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiNoContentResponse({ description: 'Sesión revocada.' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    await this.authService.logout(refreshToken, requestMetadata(request));
    response.clearCookie(REFRESH_COOKIE_NAME, this.authService.getRefreshCookieOptions());
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoca todas las sesiones activas del usuario' })
  @ApiNoContentResponse({ description: 'Todas las sesiones fueron revocadas.' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user, requestMetadata(request));
    response.clearCookie(REFRESH_COOKIE_NAME, this.authService.getRefreshCookieOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retorna el contexto del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Usuario, organización, rol y permisos efectivos.' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthenticatedResponse['user']> {
    return this.authService.getMe(user);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retorna el perfil editable del usuario actual' })
  async profile(@CurrentUser() user: AuthenticatedUser): Promise<AuthenticatedResponse['user']> {
    return this.authService.getMe(user);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualiza el perfil del usuario actual' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @Req() request: Request,
  ): Promise<AuthenticatedResponse['user']> {
    return this.authService.updateProfile(user, dto, requestMetadata(request));
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @UseGuards(ForgotPasswordRateLimitGuard)
  @ApiOperation({ summary: 'Solicita recuperación de contraseña sin enumerar cuentas' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Respuesta genérica de recuperación.' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto, requestMetadata(request));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Consume un token de recuperación y revoca las sesiones' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 204, description: 'Contraseña actualizada.' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request): Promise<void> {
    await this.authService.resetPassword(dto, requestMetadata(request));
  }

  @Get('security-check')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('audit.read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Endpoint técnico de verificación de seguridad' })
  @ApiResponse({ status: 200, description: 'Contexto autenticado con audit.read.' })
  async securityCheck(@CurrentUser() user: AuthenticatedUser): Promise<{
    authenticated: true;
    organizationId: string;
    userId: string;
    permission: 'audit.read';
  }> {
    if (!user.permissions.includes('audit.read')) {
      throw authException(
        HttpStatus.FORBIDDEN,
        AUTH_ERROR_CODES.FORBIDDEN,
        'No tienes permisos para realizar esta acción.',
      );
    }

    return {
      authenticated: true,
      organizationId: user.organizationId,
      userId: user.userId,
      permission: 'audit.read',
    };
  }

  private toPublicResponse(result: {
    accessToken: string;
    expiresIn: number;
    user: AuthenticatedResponse['user'];
  }): AuthenticatedResponse {
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }
}
