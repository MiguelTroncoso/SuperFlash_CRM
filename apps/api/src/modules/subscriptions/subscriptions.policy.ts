import { Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types';
import { CommercialAccessPolicy } from '../commercial/commercial.policy';

@Injectable()
export class SubscriptionsAccessPolicy {
  constructor(private readonly policy: CommercialAccessPolicy) {}

  assertRead(user: AuthenticatedUser): void {
    this.policy.assert(this.policy.canRead(user, 'subscriptions.read'));
  }
  assertCreate(user: AuthenticatedUser): void {
    this.policy.assert(this.policy.canCreate(user, 'subscriptions.create'));
  }
  assertMutate(user: AuthenticatedUser, ownerUserId: string | null): void {
    this.policy.assert(this.policy.canMutate(user, 'subscriptions.update', ownerUserId));
  }
}
