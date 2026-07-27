import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { authException, AUTH_ERROR_CODES } from '../auth.errors';
import { AuthService } from '../auth.service';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth.types';

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.organizationId === 'string' &&
    typeof payload.sessionId === 'string' &&
    typeof payload.roleId === 'string'
  );
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      throw authException(
        401,
        AUTH_ERROR_CODES.UNAUTHORIZED,
        'Se requiere un access token válido.',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<Record<string, unknown>>(token);
      if (!isAccessTokenPayload(payload)) {
        throw new UnauthorizedException();
      }

      const authenticatedUser = await this.authService.validateAccessToken(payload);
      if (!authenticatedUser) {
        throw new UnauthorizedException();
      }

      request.user = authenticatedUser;
      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw authException(
          401,
          AUTH_ERROR_CODES.UNAUTHORIZED,
          'El access token no es válido o ya no está activo.',
        );
      }
      throw authException(
        401,
        AUTH_ERROR_CODES.UNAUTHORIZED,
        'El access token no es válido o ya no está activo.',
      );
    }
  }
}
