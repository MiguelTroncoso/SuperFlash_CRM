import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { authException, AUTH_ERROR_CODES } from '../auth.errors';
import { AuthenticatedRequest } from '../auth.types';
import { ANY_PERMISSIONS_KEY } from '../decorators/any-permissions.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const alternativePermissions = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!alternativePermissions || alternativePermissions.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const currentPermissions = request.user?.permissions ?? [];
    const hasEveryPermission =
      !requiredPermissions ||
      requiredPermissions.length === 0 ||
      requiredPermissions.every((permission) => currentPermissions.includes(permission));
    const hasAlternativePermission =
      !alternativePermissions ||
      alternativePermissions.length === 0 ||
      alternativePermissions.some((permission) => currentPermissions.includes(permission));

    if (!hasEveryPermission || !hasAlternativePermission) {
      throw authException(
        403,
        AUTH_ERROR_CODES.FORBIDDEN,
        'No tienes permisos para realizar esta acción.',
      );
    }

    return true;
  }
}
