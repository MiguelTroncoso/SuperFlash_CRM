import { AutomationActionType, AutomationTrigger, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';

import {
  CommercialEvent,
  CommercialEventName,
} from '../../infrastructure/events/application-event-bus';

export const AUTOMATION_TRIGGER_EVENTS: Readonly<
  Partial<Record<CommercialEventName, AutomationTrigger>>
> = {
  ContactCreated: AutomationTrigger.CONTACT_CREATED,
  OpportunityStageChanged: AutomationTrigger.OPPORTUNITY_STAGE_CHANGED,
  SaleConfirmed: AutomationTrigger.SALE_CONFIRMED,
  PaymentConfirmed: AutomationTrigger.PAYMENT_CONFIRMED,
  TrialExpiring: AutomationTrigger.TRIAL_EXPIRING,
  TrialExpired: AutomationTrigger.TRIAL_EXPIRED,
  SubscriptionRenewalDue: AutomationTrigger.SUBSCRIPTION_RENEWAL_DUE,
  FulfillmentCompleted: AutomationTrigger.FULFILLMENT_COMPLETED,
  ActivationCreated: AutomationTrigger.ACTIVATION_CREATED,
};

export const AUTOMATION_EVENT_NAMES = Object.keys(
  AUTOMATION_TRIGGER_EVENTS,
) as CommercialEventName[];

export const INTERNAL_OUTBOX_EVENT_NAMES: readonly CommercialEventName[] = [
  'ContactCreated',
  'OpportunityStageChanged',
  'SaleCreated',
  'SaleConfirmed',
  'SaleCancelled',
  'SaleFulfilled',
  'PaymentCreated',
  'PaymentConfirmed',
  'PaymentRefunded',
  'PaymentFailed',
  'SubscriptionCreated',
  'SubscriptionActivated',
  'SubscriptionSuspended',
  'SubscriptionExpired',
  'SubscriptionCancelled',
  'RenewalCreated',
  'RenewalDue',
  'RenewalPaid',
  'RenewalCancelled',
  'ProviderCreated',
  'ProviderStatusChanged',
  'FulfillmentCreated',
  'FulfillmentAssigned',
  'FulfillmentStarted',
  'FulfillmentCompleted',
  'FulfillmentFailed',
  'ProvisioningAttemptCreated',
  'ProvisioningSucceeded',
  'ProvisioningFailed',
  'CredentialCreated',
  'CredentialRevealed',
  'TrialCreated',
  'TrialActivated',
  'TrialExpired',
  'TrialConverted',
  'TrialExpiring',
  'SubscriptionRenewalDue',
  'ActivationCreated',
  'ActivationActivated',
  'ActivationSuspended',
  'ActivationRevoked',
];

export interface AutomationEventContext extends Record<string, unknown> {
  event: {
    id: string;
    type: CommercialEventName;
    occurredAt: string;
    organizationId: string;
    aggregateType: string;
    aggregateId: string;
    actorUserId: string;
    requestId: string;
  };
}

export interface AutomationRequestContext {
  user: AuthenticatedUser;
  metadata: {
    ipAddress?: string;
    requestId?: string;
  };
}

export interface PublicAutomationAction {
  id: string;
  actionOrder: number;
  type: AutomationActionType;
  config: Prisma.JsonValue;
}

export interface PublicAutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  conditions: Prisma.JsonValue | null;
  active: boolean;
  template: { id: string; name: string; slug: string } | null;
  actions: PublicAutomationAction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicAutomationExecution {
  id: string;
  automationRuleId: string;
  ruleName: string;
  trigger: AutomationTrigger;
  sourceEventId: string;
  aggregateType: string;
  aggregateId: string;
  requestId: string;
  status: string;
  attempts: number;
  availableAt: Date;
  processingAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  resultPayload: Prisma.JsonValue | null;
  createdAt: Date;
  actions: Array<{
    id: string;
    actionOrder: number;
    type: AutomationActionType;
    status: string;
    errorMessage: string | null;
    resultPayload: Prisma.JsonValue | null;
    completedAt: Date | null;
  }>;
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function asJsonRecord(value: unknown): Record<string, unknown> {
  return isJsonRecord(value) ? value : {};
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function eventContextEnvelope(
  eventName: CommercialEventName,
  event: CommercialEvent,
): Record<string, unknown> {
  return {
    ...(isJsonRecord(event.payload) ? event.payload : {}),
    event: {
      id: event.eventId,
      type: eventName,
      occurredAt: event.occurredAt.toISOString(),
      organizationId: event.organizationId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      actorUserId: event.actorUserId,
      requestId: event.requestId,
    },
  };
}
