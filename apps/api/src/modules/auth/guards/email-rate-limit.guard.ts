import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

import { AuthenticatedRequest } from '../auth.types';
import { normalizeEmail } from '../auth.crypto';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class LoginEmailRateLimitGuard implements CanActivate {
  private readonly entries = new Map<string, RateLimitEntry>();

  canActivate(context: ExecutionContext): boolean {
    return this.check(context, 5, 60_000);
  }

  private check(context: ExecutionContext, limit: number, windowMs: number): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const body = request.body as { email?: unknown };
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : 'invalid-email';
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp =
      typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
    const ip = forwardedIp || request.ip || 'unknown-ip';
    const key = `${ip}:${email}`;
    const now = Date.now();
    const current = this.entries.get(key);

    if (!current || current.resetAt <= now) {
      this.entries.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (current.count >= limit) {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'AUTH_RATE_LIMITED',
          message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    return true;
  }
}

@Injectable()
export class ForgotPasswordRateLimitGuard extends LoginEmailRateLimitGuard {
  override canActivate(context: ExecutionContext): boolean {
    return this.checkForForgotPassword(context);
  }

  private checkForForgotPassword(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const body = request.body as { email?: unknown };
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : 'invalid-email';
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp =
      typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : undefined;
    const ip = forwardedIp || request.ip || 'unknown-ip';
    const key = `forgot:${ip}:${email}`;
    const now = Date.now();
    const current = this.entriesForForgot.get(key);

    if (!current || current.resetAt <= now) {
      this.entriesForForgot.set(key, { count: 1, resetAt: now + 3_600_000 });
      return true;
    }

    if (current.count >= 3) {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'AUTH_RATE_LIMITED',
          message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    return true;
  }

  private readonly entriesForForgot = new Map<string, RateLimitEntry>();
}
