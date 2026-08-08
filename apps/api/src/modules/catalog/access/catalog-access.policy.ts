import { HttpStatus, Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../../auth/auth.types';
import { CATALOG_ERROR_CODES, catalogException } from '../catalog.errors';

@Injectable()
export class CatalogAccessPolicy {
  assertRead(user: AuthenticatedUser): void {
    if (!user.permissions.includes('catalog.read')) this.forbidden();
  }

  assertCreate(user: AuthenticatedUser): void {
    if (!user.permissions.includes('catalog.create')) this.forbidden();
  }

  assertQuickCreate(user: AuthenticatedUser): void {
    if (
      !user.permissions.includes('catalog.create') &&
      !user.permissions.includes('opportunities.create')
    ) {
      this.forbidden();
    }
  }

  assertUpdate(user: AuthenticatedUser): void {
    if (!user.permissions.includes('catalog.update')) this.forbidden();
  }

  assertDelete(user: AuthenticatedUser): void {
    if (!user.permissions.includes('catalog.delete')) this.forbidden();
  }

  assertPricesRead(user: AuthenticatedUser): void {
    if (!user.permissions.includes('catalog.prices.read')) this.forbidden();
  }

  assertPricesManage(user: AuthenticatedUser): void {
    if (!user.permissions.includes('catalog.prices.manage')) this.forbidden();
  }

  assertCostsRead(user: AuthenticatedUser): void {
    if (!user.permissions.includes('catalog.costs.read')) {
      throw catalogException(
        HttpStatus.FORBIDDEN,
        CATALOG_ERROR_CODES.COSTS_FORBIDDEN,
        'No tienes permisos para consultar costos.',
      );
    }
  }

  private forbidden(): never {
    throw catalogException(
      HttpStatus.FORBIDDEN,
      CATALOG_ERROR_CODES.FORBIDDEN,
      'No tienes permisos para realizar esta acción.',
    );
  }
}
