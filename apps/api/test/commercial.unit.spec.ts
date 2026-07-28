import { CommercialAccessPolicy } from '../src/modules/commercial/commercial.policy';
import {
  normalizeCurrency,
  parseMoney,
  parseQuantity,
} from '../src/modules/commercial/commercial.types';
import {
  ApplicationEventBus,
  CommercialEventName,
} from '../src/infrastructure/events/application-event-bus';
import { AuthenticatedUser } from '../src/modules/auth/auth.types';

function user(
  roleName: string,
  permissions: readonly string[],
  userId = 'user-a',
): AuthenticatedUser {
  return {
    userId,
    organizationId: 'org-a',
    sessionId: 'session-a',
    roleId: 'role-a',
    roleName,
    permissions,
  };
}

const policyCases: Array<{
  role: string;
  permissions: string[];
  owner: string | null;
  expected: boolean;
}> = [
  { role: 'Owner', permissions: ['sales.update'], owner: 'user-b', expected: true },
  { role: 'Admin', permissions: ['sales.update'], owner: 'user-b', expected: true },
  { role: 'Sales', permissions: ['sales.update'], owner: null, expected: true },
  { role: 'Sales', permissions: ['sales.update'], owner: 'user-a', expected: true },
  { role: 'Sales', permissions: ['sales.update'], owner: 'user-b', expected: false },
  { role: 'Viewer', permissions: ['sales.update'], owner: null, expected: false },
  { role: 'Owner', permissions: [], owner: 'user-b', expected: false },
  { role: 'Admin', permissions: [], owner: 'user-b', expected: false },
  { role: 'Sales', permissions: [], owner: null, expected: false },
  { role: 'Sales', permissions: ['sales.read'], owner: null, expected: false },
  { role: 'Viewer', permissions: ['sales.read'], owner: null, expected: false },
  { role: 'Owner', permissions: ['payments.update'], owner: 'user-b', expected: false },
  { role: 'Admin', permissions: ['payments.update'], owner: 'user-b', expected: false },
  { role: 'Sales', permissions: ['payments.update'], owner: null, expected: false },
  { role: 'Sales', permissions: ['payments.update'], owner: 'user-b', expected: false },
  { role: 'Viewer', permissions: ['payments.update'], owner: null, expected: false },
  { role: 'Owner', permissions: ['subscriptions.update'], owner: 'user-b', expected: false },
  { role: 'Admin', permissions: ['subscriptions.update'], owner: 'user-b', expected: false },
  { role: 'Sales', permissions: ['subscriptions.update'], owner: null, expected: false },
  { role: 'Sales', permissions: ['subscriptions.update'], owner: 'user-a', expected: false },
  { role: 'Viewer', permissions: ['subscriptions.update'], owner: null, expected: false },
  { role: 'Owner', permissions: ['renewals.update'], owner: 'user-b', expected: false },
  { role: 'Admin', permissions: ['renewals.update'], owner: 'user-b', expected: false },
  { role: 'Sales', permissions: ['renewals.update'], owner: null, expected: false },
  { role: 'Viewer', permissions: ['renewals.update'], owner: null, expected: false },
];

describe('Commercial authorization policy', () => {
  const policy = new CommercialAccessPolicy();

  it.each(policyCases)('evaluates ownership case %# for %s', (testCase) => {
    const permissions = testCase.permissions;
    const currentUser = user(testCase.role, permissions);
    expect(policy.canMutate(currentUser, 'sales.update', testCase.owner)).toBe(testCase.expected);
  });

  it.each([
    ['sales.read', 'sales.read'],
    ['payments.read', 'payments.read'],
    ['subscriptions.read', 'subscriptions.read'],
    ['renewals.read', 'renewals.read'],
    ['sales.create', 'sales.create'],
    ['payments.create', 'payments.create'],
    ['subscriptions.create', 'subscriptions.create'],
    ['renewals.create', 'renewals.create'],
  ])('requires the exact permission %s', (required, granted) => {
    expect(policy.canRead(user('Viewer', [granted]), required)).toBe(true);
    expect(policy.canCreate(user('Sales', [granted]), required)).toBe(true);
  });

  it.each([
    ['sales.read', 'payments.read'],
    ['payments.read', 'sales.read'],
    ['subscriptions.read', 'renewals.read'],
    ['renewals.read', 'subscriptions.read'],
    ['sales.create', 'payments.create'],
    ['payments.create', 'sales.create'],
    ['subscriptions.create', 'renewals.create'],
    ['renewals.create', 'subscriptions.create'],
  ])('rejects a different permission %s when only %s is granted', (required, granted) => {
    expect(policy.canRead(user('Viewer', [granted]), required)).toBe(false);
    expect(policy.canCreate(user('Sales', [granted]), required)).toBe(false);
  });
});

const eventNames: CommercialEventName[] = [
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
];

describe('Commercial event contracts', () => {
  it.each(eventNames)('publishes the %s event with tenant context', (name) => {
    const bus = new ApplicationEventBus();
    const received: string[] = [];
    bus.on(name, (event: { organizationId: string; aggregateId: string }) => {
      received.push(`${event.organizationId}:${event.aggregateId}`);
    });
    bus.publish(name, {
      eventId: `event-${name}`,
      occurredAt: new Date(),
      organizationId: 'org-a',
      aggregateId: 'aggregate-a',
      actorUserId: 'user-a',
      payload: { status: 'TEST' },
    });
    expect(received).toEqual(['org-a:aggregate-a']);
  });
});

describe('Commercial value normalization', () => {
  it.each([
    [' usd ', 'USD'],
    ['clp', 'CLP'],
    [' Eur ', 'EUR'],
    ['mxn', 'MXN'],
    [' brl ', 'BRL'],
    ['ars', 'ARS'],
    [' pen ', 'PEN'],
    ['cop', 'COP'],
  ])('normalizes currency %s to %s', (input, expected) => {
    expect(normalizeCurrency(input)).toBe(expected);
  });

  it.each([
    ['0', '0.00'],
    ['10', '10.00'],
    ['10.5', '10.50'],
    ['100.25', '100.25'],
    [0, '0.00'],
    [5, '5.00'],
    [12.345, '12.35'],
    ['999999.99', '999999.99'],
  ])('parses money %s as a two-decimal amount', (input, expected) => {
    expect(parseMoney(input).toFixed(2)).toBe(expected);
  });

  it.each([
    ['1', '1.00'],
    ['2.5', '2.50'],
    ['10', '10.00'],
    ['0.25', '0.25'],
    [1, '1.00'],
    [3, '3.00'],
    [100.75, '100.75'],
    ['1000', '1000.00'],
  ])('parses quantity %s without floating point drift', (input, expected) => {
    expect(parseQuantity(input).toFixed(2)).toBe(expected);
  });
});
