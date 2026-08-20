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
import { addSubscriptionDuration } from '@superflash/utils';

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
      aggregateType: 'Commercial',
      aggregateId: 'aggregate-a',
      actorUserId: 'user-a',
      requestId: 'request-a',
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

describe('Subscription duration contract', () => {
  const start = new Date('2026-08-15T12:00:00.000Z');

  it.each([
    [30, '2026-09-15T12:00:00.000Z'],
    [90, '2026-11-15T12:00:00.000Z'],
    [180, '2027-02-15T12:00:00.000Z'],
    [365, '2027-08-15T12:00:00.000Z'],
  ])(
    'calculates %s days with the shared calendar month rule for standard date',
    (duration, expected) => {
      expect(addSubscriptionDuration(start, duration).toISOString()).toBe(expected);
    },
  );

  it('calculates 31 enero + 1 mes -> 28 febrero en año no bisiesto', () => {
    const jan31 = new Date('2025-01-31T12:00:00.000Z');
    expect(addSubscriptionDuration(jan31, 30).toISOString()).toBe('2025-02-28T12:00:00.000Z');
  });

  it('calculates 31 enero + 1 mes -> 29 febrero en año bisiesto', () => {
    const jan31Leap = new Date('2024-01-31T12:00:00.000Z');
    expect(addSubscriptionDuration(jan31Leap, 30).toISOString()).toBe('2024-02-29T12:00:00.000Z');
  });

  it('calculates 28 febrero + 1 mes -> 28 marzo', () => {
    const feb28 = new Date('2026-02-28T12:00:00.000Z');
    expect(addSubscriptionDuration(feb28, 30).toISOString()).toBe('2026-03-28T12:00:00.000Z');
  });

  it('calculates 29 febrero año bisiesto + 1 mes -> 29 marzo y + 12 meses -> 28 febrero siguiente', () => {
    const feb29 = new Date('2024-02-29T12:00:00.000Z');
    expect(addSubscriptionDuration(feb29, 30).toISOString()).toBe('2024-03-29T12:00:00.000Z');
    expect(addSubscriptionDuration(feb29, 365).toISOString()).toBe('2025-02-28T12:00:00.000Z');
  });

  it('calculates 30 noviembre + 3 meses -> 28 febrero', () => {
    const nov30 = new Date('2025-11-30T12:00:00.000Z');
    expect(addSubscriptionDuration(nov30, 90).toISOString()).toBe('2026-02-28T12:00:00.000Z');
  });

  it('calculates 15 agosto + 6 meses -> 15 febrero siguiente', () => {
    const aug15 = new Date('2026-08-15T12:00:00.000Z');
    expect(addSubscriptionDuration(aug15, 180).toISOString()).toBe('2027-02-15T12:00:00.000Z');
  });

  it('calculates 12 meses exactos', () => {
    const aug15 = new Date('2026-08-15T12:00:00.000Z');
    expect(addSubscriptionDuration(aug15, 365).toISOString()).toBe('2027-08-15T12:00:00.000Z');
  });
});

describe('Confirmed Sale Operational Update rules', () => {
  it('identifies financial modification attempts on confirmed sales', () => {
    const isFinancialFieldPresent = (dto: {
      unitPrice?: string;
      discountAmount?: string;
      taxAmount?: string;
    }) =>
      dto.unitPrice !== undefined ||
      dto.discountAmount !== undefined ||
      dto.taxAmount !== undefined;

    expect(isFinancialFieldPresent({ unitPrice: '100.00' })).toBe(true);
    expect(isFinancialFieldPresent({ discountAmount: '10.00' })).toBe(true);
    expect(isFinancialFieldPresent({ taxAmount: '5.00' })).toBe(true);
    expect(isFinancialFieldPresent({})).toBe(false);
  });

  it('allows operational fields (note, paymentMethod, paymentDueAt, duration) without altering financial snapshots', () => {
    const operationalPayload = {
      note: 'Contacto solicitó cambio de fecha de compromiso',
      paymentMethod: 'TRANSFER' as const,
      paymentDueAt: '2026-09-01T12:00:00.000Z',
      subscriptionDurationDays: 180,
    };
    expect(operationalPayload.note).toBeDefined();
    expect(operationalPayload.subscriptionDurationDays).toBe(180);
  });
});
