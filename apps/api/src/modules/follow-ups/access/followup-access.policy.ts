import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../../auth/auth.types';
import { FOLLOW_UP_ERROR_CODES, followUpException } from '../followups.errors';

export interface FollowUpAccessRecord {
  userId: string | null;
  opportunityUserId: string | null;
}

@Injectable()
export class FollowUpAccessPolicy {
  canRead(user: AuthenticatedUser): boolean {
    return user.permissions.includes('followups.read');
  }

  canCreate(user: AuthenticatedUser): boolean {
    return user.permissions.includes('followups.create');
  }

  canMutate(user: AuthenticatedUser, record: FollowUpAccessRecord): boolean {
    if (!user.permissions.includes('followups.update')) return false;
    if (user.roleName === 'Owner' || user.roleName === 'Admin') return true;
    if (user.roleName !== 'Sales') return false;
    return (
      (record.userId === null || record.userId === user.userId) &&
      (record.opportunityUserId === null || record.opportunityUserId === user.userId)
    );
  }

  canCreateForOpportunity(user: AuthenticatedUser, opportunityUserId: string | null): boolean {
    if (user.roleName === 'Owner' || user.roleName === 'Admin') return true;
    return (
      user.roleName === 'Sales' && (opportunityUserId === null || opportunityUserId === user.userId)
    );
  }

  canAssign(
    user: AuthenticatedUser,
    record: FollowUpAccessRecord,
    assignedUserId: string,
  ): boolean {
    if (user.roleName === 'Owner' || user.roleName === 'Admin') {
      return user.permissions.includes('followups.update');
    }
    if (
      user.roleName !== 'Sales' ||
      !user.permissions.includes('followups.update') ||
      assignedUserId !== user.userId
    ) {
      return false;
    }
    return (
      (record.userId === null || record.userId === user.userId) &&
      (record.opportunityUserId === null || record.opportunityUserId === user.userId)
    );
  }

  listWhere(user: AuthenticatedUser): Prisma.FollowUpWhereInput {
    if (user.roleName !== 'Sales') return {};
    return {
      OR: [
        { userId: user.userId },
        { opportunity: { userId: user.userId, deletedAt: null } },
        { opportunity: { userId: null, deletedAt: null } },
      ],
    };
  }

  opportunityWhere(user: AuthenticatedUser): Prisma.OpportunityWhereInput {
    if (user.roleName !== 'Sales') return {};
    return { OR: [{ userId: user.userId }, { userId: null }] };
  }

  assertCanRead(user: AuthenticatedUser): void {
    if (!this.canRead(user)) {
      throw followUpException(
        HttpStatus.FORBIDDEN,
        FOLLOW_UP_ERROR_CODES.UPDATE_FORBIDDEN,
        'No tienes permisos para consultar seguimientos.',
      );
    }
  }

  assertCanCreate(user: AuthenticatedUser): void {
    if (!this.canCreate(user)) {
      throw followUpException(
        HttpStatus.FORBIDDEN,
        FOLLOW_UP_ERROR_CODES.UPDATE_FORBIDDEN,
        'No tienes permisos para crear seguimientos.',
      );
    }
  }

  assertCanMutate(user: AuthenticatedUser, record: FollowUpAccessRecord): void {
    if (!this.canMutate(user, record)) {
      throw followUpException(
        HttpStatus.FORBIDDEN,
        FOLLOW_UP_ERROR_CODES.UPDATE_FORBIDDEN,
        'No tienes permisos para modificar este seguimiento.',
      );
    }
  }
}
