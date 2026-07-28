import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export type CommercialEventName =
  | 'SaleCreated'
  | 'SaleConfirmed'
  | 'SaleCancelled'
  | 'SaleFulfilled'
  | 'PaymentCreated'
  | 'PaymentConfirmed'
  | 'PaymentRefunded'
  | 'PaymentFailed'
  | 'SubscriptionCreated'
  | 'SubscriptionActivated'
  | 'SubscriptionSuspended'
  | 'SubscriptionExpired'
  | 'SubscriptionCancelled'
  | 'RenewalCreated'
  | 'RenewalDue'
  | 'RenewalPaid'
  | 'RenewalCancelled';

export interface CommercialEvent {
  eventId: string;
  occurredAt: Date;
  organizationId: string;
  aggregateId: string;
  actorUserId: string;
  payload: Readonly<Record<string, unknown>>;
}

@Injectable()
export class ApplicationEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  publish(name: CommercialEventName, event: CommercialEvent): void {
    this.emit(name, event);
  }
}
