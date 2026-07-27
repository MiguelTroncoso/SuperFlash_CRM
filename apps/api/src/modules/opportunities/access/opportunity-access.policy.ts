import { HttpStatus, Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../../auth/auth.types';
import { OPPORTUNITY_ERROR_CODES, opportunityException } from '../opportunities.errors';

@Injectable()
export class OpportunityAccessPolicy {
  canRead(user: AuthenticatedUser): boolean {
    return user.permissions.includes('opportunities.read');
  }

  canCreate(user: AuthenticatedUser): boolean {
    return user.permissions.includes('opportunities.create');
  }

  canMutate(user: AuthenticatedUser, opportunity: { userId: string | null }): boolean {
    if (!user.permissions.includes('opportunities.update')) return false;
    if (user.roleName === 'Owner' || user.roleName === 'Admin') return true;
    if (user.roleName === 'Sales') {
      return opportunity.userId === null || opportunity.userId === user.userId;
    }
    return false;
  }

  canAssign(
    user: AuthenticatedUser,
    opportunity: { userId: string | null },
    assignedUserId: string | null,
  ): boolean {
    if (user.roleName === 'Owner' || user.roleName === 'Admin') {
      return user.permissions.includes('opportunities.update');
    }
    if (user.roleName !== 'Sales' || !user.permissions.includes('opportunities.update')) {
      return false;
    }
    if (assignedUserId === user.userId && opportunity.userId === null) return true;
    return assignedUserId === opportunity.userId;
  }

  assertCanRead(user: AuthenticatedUser): void {
    if (!this.canRead(user)) {
      throw opportunityException(
        HttpStatus.FORBIDDEN,
        OPPORTUNITY_ERROR_CODES.UPDATE_FORBIDDEN,
        'No tienes permisos para realizar esta acción.',
      );
    }
  }

  assertCanCreate(user: AuthenticatedUser): void {
    if (!this.canCreate(user)) {
      throw opportunityException(
        HttpStatus.FORBIDDEN,
        OPPORTUNITY_ERROR_CODES.UPDATE_FORBIDDEN,
        'No tienes permisos para crear oportunidades.',
      );
    }
  }

  assertCanMutate(user: AuthenticatedUser, opportunity: { userId: string | null }): void {
    if (!this.canMutate(user, opportunity)) {
      throw opportunityException(
        HttpStatus.FORBIDDEN,
        OPPORTUNITY_ERROR_CODES.UPDATE_FORBIDDEN,
        'No tienes permisos para modificar esta oportunidad.',
      );
    }
  }

  assertCanAssign(
    user: AuthenticatedUser,
    opportunity: { userId: string | null },
    assignedUserId: string | null,
  ): void {
    if (!this.canAssign(user, opportunity, assignedUserId)) {
      throw opportunityException(
        HttpStatus.FORBIDDEN,
        OPPORTUNITY_ERROR_CODES.UPDATE_FORBIDDEN,
        'No tienes permisos para asignar esta oportunidad.',
      );
    }
  }
}
