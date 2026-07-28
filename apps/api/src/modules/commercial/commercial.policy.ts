import { HttpStatus, Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types';
import { commercialException, COMMERCIAL_ERROR_CODES } from './commercial.errors';

@Injectable()
export class CommercialAccessPolicy {
  canRead(user: AuthenticatedUser, permission: string): boolean {
    return user.permissions.includes(permission);
  }

  canCreate(user: AuthenticatedUser, permission: string): boolean {
    return user.permissions.includes(permission);
  }

  canMutate(user: AuthenticatedUser, permission: string, ownerUserId: string | null): boolean {
    if (!user.permissions.includes(permission)) return false;
    if (user.roleName === 'Owner' || user.roleName === 'Admin') return true;
    return user.roleName === 'Sales' && (ownerUserId === null || ownerUserId === user.userId);
  }

  assert(condition: boolean, message = 'No tienes permisos para realizar esta acción.'): void {
    if (!condition) {
      throw commercialException(HttpStatus.FORBIDDEN, COMMERCIAL_ERROR_CODES.FORBIDDEN, message);
    }
  }
}
