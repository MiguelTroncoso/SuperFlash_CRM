import { HttpStatus, Injectable } from '@nestjs/common';

import { contactException, CONTACT_ERROR_CODES } from '../contacts.errors';
import { ContactMutation } from '../contacts.repository';
import { AuthenticatedUser } from '../../auth/auth.types';

@Injectable()
export class ContactAccessPolicy {
  canRead(user: AuthenticatedUser): boolean {
    return user.permissions.includes('contacts.read');
  }

  canMutate(user: AuthenticatedUser, contact: Pick<ContactMutation, 'userId'>): boolean {
    if (!user.permissions.includes('contacts.update')) {
      return false;
    }
    if (user.roleName === 'Owner' || user.roleName === 'Admin') {
      return true;
    }
    if (user.roleName === 'Sales') {
      return contact.userId === null || contact.userId === user.userId;
    }
    return false;
  }

  canCreateOpportunity(user: AuthenticatedUser, contact: Pick<ContactMutation, 'userId'>): boolean {
    if (user.roleName === 'Owner' || user.roleName === 'Admin') return true;
    return user.roleName === 'Sales' && (contact.userId === null || contact.userId === user.userId);
  }

  assertCanRead(user: AuthenticatedUser): void {
    if (!this.canRead(user)) {
      throw contactException(
        HttpStatus.FORBIDDEN,
        CONTACT_ERROR_CODES.UPDATE_FORBIDDEN,
        'No tienes permisos para realizar esta acción.',
      );
    }
  }

  assertCanMutate(user: AuthenticatedUser, contact: Pick<ContactMutation, 'userId'>): void {
    if (!this.canMutate(user, contact)) {
      throw contactException(
        HttpStatus.FORBIDDEN,
        CONTACT_ERROR_CODES.UPDATE_FORBIDDEN,
        'No tienes permisos para modificar este contacto.',
      );
    }
  }
}
