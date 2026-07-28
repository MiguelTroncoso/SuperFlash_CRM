import { Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types';
import { CommercialAccessPolicy } from '../commercial/commercial.policy';

@Injectable()
export class PaymentsAccessPolicy {
  constructor(private readonly policy: CommercialAccessPolicy) {}

  assertRead(user: AuthenticatedUser): void {
    this.policy.assert(this.policy.canRead(user, 'payments.read'));
  }
  assertCreate(user: AuthenticatedUser): void {
    this.policy.assert(this.policy.canCreate(user, 'payments.create'));
  }
  assertMutate(user: AuthenticatedUser, ownerUserId: string | null): void {
    this.policy.assert(this.policy.canMutate(user, 'payments.update', ownerUserId));
  }
}
