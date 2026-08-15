import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingPeriodUnit,
  CustomerSegment,
  FulfillmentMode,
  PipelineStageCategory,
  Prisma,
  PrismaClient,
  ProductStatus,
  ProductType,
  UserStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { hashPassword } from '../src/modules/auth/auth.crypto';
import { resetDatabase } from './test-database';

const PASSWORD = 'CommercialPassword1!';

interface Fixture {
  organizationA: string;
  organizationB: string;
  ownerA: { id: string; email: string; password: string };
  ownerB: { id: string; email: string; password: string };
  viewerA: { id: string; email: string; password: string };
  contactA: string;
  contactB: string;
  productA: string;
  productB: string;
  opportunityA: string;
}

function body(response: { body: unknown }): Record<string, unknown> {
  return response.body as Record<string, unknown>;
}
function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('Commercial core HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let fixture: Fixture;
  let ipSequence = 0;

  beforeAll(async () => {
    if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test'))
      throw new Error('Commercial integration tests require schema=auth_test.');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const configuration = moduleRef.get(ConfigService).getOrThrow<AppConfiguration>('app');
    configureApplication(app, configuration);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    api = request(app.getHttpServer());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixture = await createFixture(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a Sale with immutable catalog snapshot and multiple items', async () => {
    const token = await login(fixture.ownerA);
    const response = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [
        { productId: fixture.productA, quantity: '2', unitPrice: '50.00' },
        { productId: fixture.productA, quantity: '1', unitPrice: '25.00' },
      ],
    });
    expect(response.status).toBe(201);
    const sale = body(response);
    expect(sale.status).toBe('DRAFT');
    expect(sale.total).toBe('125.00');
    const items = sale.items as unknown[];
    expect(items).toHaveLength(2);
    expect(record(items[0]).catalogSnapshot).toBeDefined();
    await prisma.product.update({
      where: { id: fixture.productA },
      data: { name: 'Live catalog changed' },
    });
    const stored = await prisma.saleItem.findFirstOrThrow({
      where: { saleId: String(sale.id), productId: fixture.productA },
    });
    expect(stored.productNameSnapshot).toBe('Commercial Product A');
  });

  it('lists sales with pagination and status filters', async () => {
    const token = await login(fixture.ownerA);
    await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [{ productId: fixture.productA, unitPrice: '10.00' }],
    });
    const response = await authorized('get', '/api/v1/sales?page=1&limit=1&status=DRAFT', token);
    expect(response.status).toBe(200);
    expect(record(body(response).pagination).total).toBe(1);
    expect(Array.isArray(body(response).data)).toBe(true);
  });

  it('does not expose a Sale across organizations', async () => {
    const ownerA = await login(fixture.ownerA);
    const ownerB = await login(fixture.ownerB);
    const created = await authorized('post', '/api/v1/sales', ownerA).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [{ productId: fixture.productA, unitPrice: '10.00' }],
    });
    const response = await authorized('get', `/api/v1/sales/${String(body(created).id)}`, ownerB);
    expect(response.status).toBe(404);
  });

  it('confirms a Sale idempotently under concurrent requests', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [{ productId: fixture.productA, unitPrice: '10.00' }],
    });
    const saleId = String(body(created).id);
    const responses = await Promise.all([
      authorized('post', `/api/v1/sales/${saleId}/confirm`, token),
      authorized('post', `/api/v1/sales/${saleId}/confirm`, token),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: saleId } })).status).toBe(
      'CONFIRMED',
    );
  });

  it('confirms a Sale and records an immediate payment in one transaction', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [{ productId: fixture.productA, unitPrice: '25.00' }],
    });
    const saleId = String(body(created).id);
    const confirmed = await authorized('post', `/api/v1/sales/${saleId}/confirm`, token).send({
      payment: { amount: '25.00', currency: 'USD', method: 'MANUAL' },
    });
    expect(confirmed.status).toBe(201);
    expect(body(confirmed).status).toBe('CONFIRMED');
    expect(
      await prisma.payment.count({
        where: { organizationId: fixture.organizationA, saleId, status: 'CONFIRMED' },
      }),
    ).toBe(1);
    expect(
      await prisma.activity.findFirst({ where: { saleId, title: 'Pago confirmado con la venta' } }),
    ).not.toBeNull();
  });

  it('rolls back the Sale transition when the immediate payment is invalid', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [{ productId: fixture.productA, unitPrice: '25.00' }],
    });
    const saleId = String(body(created).id);
    const rejected = await authorized('post', `/api/v1/sales/${saleId}/confirm`, token).send({
      payment: { amount: '25.01', currency: 'USD', method: 'MANUAL' },
    });
    expect(rejected.status).toBe(409);
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: saleId } })).status).toBe('DRAFT');
    expect(await prisma.payment.count({ where: { saleId } })).toBe(0);
  });

  it('deducts tracked stock only on confirmation and rejects overselling', async () => {
    const token = await login(fixture.ownerA);
    await prisma.product.update({
      where: { id: fixture.productA },
      data: { stockTrackingEnabled: true, stockQuantity: 2, stockMinimum: 1 },
    });
    const created = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [{ productId: fixture.productA, quantity: '2', unitPrice: '50.00' }],
    });
    expect(created.status).toBe(201);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: fixture.productA } })).stockQuantity,
    ).toBe(2);
    const confirmed = await authorized(
      'post',
      `/api/v1/sales/${String(body(created).id)}/confirm`,
      token,
    );
    expect(confirmed.status).toBe(201);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: fixture.productA } })).stockQuantity,
    ).toBe(0);
    expect(
      await prisma.productStockMovement.findFirst({
        where: { productId: fixture.productA, movementType: 'EXIT' },
      }),
    ).not.toBeNull();

    const oversell = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [{ productId: fixture.productA, quantity: '1', unitPrice: '50.00' }],
    });
    const rejected = await authorized(
      'post',
      `/api/v1/sales/${String(body(oversell).id)}/confirm`,
      token,
    );
    expect(rejected.status).toBe(409);
    expect(body(rejected).code).toBe('SALE_STOCK_INSUFFICIENT');
  });

  it('creates a subscription, renewal and reminder schedule from a confirmed sale', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [
        {
          productId: fixture.productA,
          quantity: '1',
          unitPrice: '50.00',
          subscriptionDurationDays: 90,
        },
      ],
    });
    const confirmed = await authorized(
      'post',
      `/api/v1/sales/${String(body(created).id)}/confirm`,
      token,
    );
    expect(confirmed.status).toBe(201);
    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { saleId: String(body(created).id), deletedAt: null },
    });
    expect(subscription.billingCycle).toBe('QUARTERLY');
    const renewal = await prisma.renewal.findFirstOrThrow({
      where: { subscriptionId: subscription.id, deletedAt: null },
    });
    expect(renewal.status).toBe('PENDING');
    expect(await prisma.renewalReminder.count({ where: { renewalId: renewal.id } })).toBe(3);
  });

  it('converts an Opportunity exactly once under concurrency', async () => {
    const token = await login(fixture.ownerA);
    const responses = await Promise.all([
      authorized('post', `/api/v1/sales/from-opportunity/${fixture.opportunityA}`, token),
      authorized('post', `/api/v1/sales/from-opportunity/${fixture.opportunityA}`, token),
    ]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
    expect(
      await prisma.sale.count({
        where: {
          organizationId: fixture.organizationA,
          opportunityId: fixture.opportunityA,
          deletedAt: null,
        },
      }),
    ).toBe(1);
  });

  it('creates and confirms a payment while calculating balance', async () => {
    const token = await login(fixture.ownerA);
    const sale = await createSale(token, '100.00');
    const payment = await authorized('post', `/api/v1/sales/${sale.id}/payments`, token).send({
      amount: '100.00',
      currency: 'USD',
      method: 'TRANSFER',
    });
    expect(payment.status).toBe(201);
    const confirmed = await authorized(
      'post',
      `/api/v1/payments/${String(body(payment).id)}/confirm`,
      token,
    );
    expect(confirmed.status).toBe(201);
    const detail = await authorized('get', `/api/v1/sales/${sale.id}`, token);
    const balance = record(body(detail).balance);
    expect(balance.confirmed).toBe('100.00');
    expect(balance.balance).toBe('0.00');
  });

  it('rejects payment creation while the Sale is still DRAFT', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [{ productId: fixture.productA, unitPrice: '10.00' }],
    });
    const response = await authorized(
      'post',
      `/api/v1/sales/${String(body(created).id)}/payments`,
      token,
    ).send({ amount: '10.00', currency: 'USD', method: 'MANUAL' });
    expect(response.status).toBe(409);
    expect(body(response).code).toBe('PAYMENT_SALE_STATE');
  });

  it('returns the same payment for an idempotent retry and conflicts on a changed payload', async () => {
    const token = await login(fixture.ownerA);
    const sale = await createSale(token, '100.00');
    const first = await authorized('post', `/api/v1/sales/${sale.id}/payments`, token).send({
      amount: '25.00',
      currency: 'USD',
      method: 'MANUAL',
      idempotencyKey: 'payment-retry-1',
    });
    const retry = await authorized('post', `/api/v1/sales/${sale.id}/payments`, token).send({
      amount: '25.00',
      currency: 'USD',
      method: 'MANUAL',
      idempotencyKey: 'payment-retry-1',
    });
    const conflict = await authorized('post', `/api/v1/sales/${sale.id}/payments`, token).send({
      amount: '30.00',
      currency: 'USD',
      method: 'MANUAL',
      idempotencyKey: 'payment-retry-1',
    });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(body(retry).id).toBe(body(first).id);
    expect(conflict.status).toBe(409);
    expect(body(conflict).code).toBe('PAYMENT_IDEMPOTENCY_CONFLICT');
  });

  it('prevents a confirmed payment from exceeding the Sale balance', async () => {
    const token = await login(fixture.ownerA);
    const sale = await createSale(token, '100.00');
    const first = await authorized('post', `/api/v1/sales/${sale.id}/payments`, token).send({
      amount: '100.00',
      currency: 'USD',
      method: 'MANUAL',
    });
    await authorized('post', `/api/v1/payments/${String(body(first).id)}/confirm`, token);
    const second = await authorized('post', `/api/v1/sales/${sale.id}/payments`, token).send({
      amount: '1.00',
      currency: 'USD',
      method: 'MANUAL',
    });
    const rejected = await authorized(
      'post',
      `/api/v1/payments/${String(body(second).id)}/confirm`,
      token,
    );
    expect(rejected.status).toBe(409);
    expect(body(rejected).code).toBe('PAYMENT_EXCEEDS_SALE_BALANCE');
  });

  it('supports partial refunds without storing a remaining balance', async () => {
    const token = await login(fixture.ownerA);
    const sale = await createSale(token, '100.00');
    const payment = await authorized('post', `/api/v1/sales/${sale.id}/payments`, token).send({
      amount: '100.00',
      currency: 'USD',
      method: 'CASH',
    });
    const paymentId = String(body(payment).id);
    await authorized('post', `/api/v1/payments/${paymentId}/confirm`, token);
    const refund = await authorized('post', `/api/v1/payments/${paymentId}/refund`, token).send({
      amount: '25.00',
      reason: 'Partial refund',
    });
    expect(refund.status).toBe(201);
    expect(body(refund).refundedAmount).toBe('25.00');
    const raw = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect('remainingBalance' in raw).toBe(false);
    expect('paidAmount' in raw).toBe(false);
  });

  it('blocks cancellation with confirmed money and allows it after a full refund', async () => {
    const token = await login(fixture.ownerA);
    const sale = await createSale(token, '100.00');
    const payment = await authorized('post', `/api/v1/sales/${sale.id}/payments`, token).send({
      amount: '100.00',
      currency: 'USD',
      method: 'MANUAL',
    });
    const paymentId = String(body(payment).id);
    await authorized('post', `/api/v1/payments/${paymentId}/confirm`, token);
    const rejected = await authorized('post', `/api/v1/sales/${sale.id}/cancel`, token).send({});
    expect(rejected.status).toBe(409);
    expect(body(rejected).code).toBe('SALE_CANCELLED_WITH_BALANCE');
    await authorized('post', `/api/v1/payments/${paymentId}/refund`, token).send({
      amount: '100.00',
    });
    const cancelled = await authorized('post', `/api/v1/sales/${sale.id}/cancel`, token).send({});
    expect(cancelled.status).toBe(201);
    expect(body(cancelled).status).toBe('CANCELLED');
  });

  it('rejects unsupported payment currencies', async () => {
    const token = await login(fixture.ownerA);
    const sale = await createSale(token, '10.00');
    const response = await authorized('post', `/api/v1/sales/${sale.id}/payments`, token).send({
      amount: '10.00',
      currency: 'ZZZ',
      method: 'MANUAL',
    });
    expect(response.status).toBe(400);
    expect(body(response).code).toBe('COMMERCIAL_UNSUPPORTED_CURRENCY');
  });

  it('protects SaleItem snapshots after confirmation', async () => {
    const token = await login(fixture.ownerA);
    const sale = await createSale(token, '10.00');
    const item = await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    await expect(
      prisma.saleItem.update({ where: { id: item.id }, data: { productNameSnapshot: 'Tampered' } }),
    ).rejects.toThrow(/immutable/i);
  });

  it('creates and activates a Subscription from SaleItem snapshot', async () => {
    const token = await login(fixture.ownerA);
    const sale = await createSale(token, '50.00');
    const saleItem = await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    const created = await authorized(
      'post',
      `/api/v1/subscriptions/from-sale-item/${saleItem.id}`,
      token,
    ).send({ billingCycle: 'MONTHLY' });
    expect(created.status).toBe(201);
    expect(body(created).status).toBe('PENDING');
    const activated = await authorized(
      'post',
      `/api/v1/subscriptions/${String(body(created).id)}/activate`,
      token,
    );
    expect(activated.status).toBe(201);
    expect(body(activated).status).toBe('ACTIVE');
  });

  it('creates one pending Renewal for concurrent requests', async () => {
    const token = await login(fixture.ownerA);
    const subscription = await createSubscription(token);
    const responses = await Promise.all([
      authorized('post', `/api/v1/renewals/from-subscription/${subscription.id}`, token).send({}),
      authorized('post', `/api/v1/renewals/from-subscription/${subscription.id}`, token).send({}),
    ]);
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(
      await prisma.renewal.count({ where: { subscriptionId: subscription.id, deletedAt: null } }),
    ).toBe(1);
  });

  it('marks Renewal due and generates a new Sale exactly once when paid concurrently', async () => {
    const token = await login(fixture.ownerA);
    const subscription = await createSubscription(token);
    const renewal = await authorized(
      'post',
      `/api/v1/renewals/from-subscription/${subscription.id}`,
      token,
    ).send({ dueAt: new Date(Date.now() - 1_000).toISOString() });
    const renewalId = String(body(renewal).id);
    const due = await authorized('post', `/api/v1/renewals/${renewalId}/due`, token);
    expect(due.status).toBe(201);
    const paid = await Promise.all([
      authorized('post', `/api/v1/renewals/${renewalId}/pay`, token),
      authorized('post', `/api/v1/renewals/${renewalId}/pay`, token),
    ]);
    expect(paid.every((response) => response.status === 201)).toBe(true);
    const stored = await prisma.renewal.findUniqueOrThrow({ where: { id: renewalId } });
    expect(stored.status).toBe('PAID');
    expect(stored.workflowStatus).toBe('RENEWED');
    expect(stored.generatedSaleId).not.toBeNull();
    expect(
      await prisma.sale.count({
        where: { id: stored.generatedSaleId ?? undefined, organizationId: fixture.organizationA },
      }),
    ).toBe(1);
    const nextRenewals = await prisma.renewal.findMany({
      where: { subscriptionId: subscription.id, id: { not: renewalId }, deletedAt: null },
    });
    expect(nextRenewals).toHaveLength(1);
    expect(nextRenewals[0]?.status).toBe('PENDING');
    expect(nextRenewals[0]?.sourceSaleId).toBe(stored.generatedSaleId);
  });

  it('rejects marking a future Renewal as due', async () => {
    const token = await login(fixture.ownerA);
    const subscription = await createSubscription(token);
    const renewal = await authorized(
      'post',
      `/api/v1/renewals/from-subscription/${subscription.id}`,
      token,
    ).send({});
    const response = await authorized(
      'post',
      `/api/v1/renewals/${String(body(renewal).id)}/due`,
      token,
    );
    expect(response.status).toBe(409);
    expect(body(response).code).toBe('RENEWAL_TOO_EARLY');
  });

  it('does not pay a Renewal after its Subscription is cancelled', async () => {
    const token = await login(fixture.ownerA);
    const subscription = await createSubscription(token);
    const renewal = await authorized(
      'post',
      `/api/v1/renewals/from-subscription/${subscription.id}`,
      token,
    ).send({ dueAt: new Date(Date.now() - 1_000).toISOString() });
    await authorized('post', `/api/v1/subscriptions/${subscription.id}/cancel`, token).send({
      reason: 'Test cancellation',
    });
    const response = await authorized(
      'post',
      `/api/v1/renewals/${String(body(renewal).id)}/pay`,
      token,
    );
    expect(response.status).toBe(409);
  });

  it('persists request correlation across audit, activity and outbox', async () => {
    const token = await login(fixture.ownerA);
    const requestId = 'commercial-request-123';
    const response = await authorized('post', '/api/v1/sales', token)
      .set('X-Request-Id', requestId)
      .send({
        contactId: fixture.contactA,
        currency: 'USD',
        items: [{ productId: fixture.productA, unitPrice: '10.00' }],
      });
    expect(response.headers['x-request-id']).toBe(requestId);
    expect(body(response).requestId).toBe(requestId);
    const saleId = String(body(response).id);
    expect(
      await prisma.auditLog.findFirst({ where: { recordId: saleId, requestId } }),
    ).not.toBeNull();
    expect(await prisma.activity.findFirst({ where: { saleId, requestId } })).not.toBeNull();
    expect(
      await prisma.outboxEvent.findFirst({ where: { aggregateId: saleId, requestId } }),
    ).not.toBeNull();
  });

  it('rejects cross-tenant contact and product references at Sale creation', async () => {
    const token = await login(fixture.ownerA);
    const response = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactB,
      currency: 'USD',
      items: [{ productId: fixture.productB, unitPrice: '10.00' }],
    });
    expect(response.status).toBe(404);
  });

  it('rejects unknown DTO fields through the global ValidationPipe', async () => {
    const token = await login(fixture.ownerA);
    const response = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      organizationId: fixture.organizationA,
      items: [{ productId: fixture.productA, unitPrice: '10.00' }],
    });
    expect(response.status).toBe(400);
  });

  it('returns 401 for unauthenticated commercial requests', async () => {
    const response = await api.get('/api/v1/sales');
    expect(response.status).toBe(401);
  });

  it('returns 403 when the role lacks the domain permission', async () => {
    const token = await login(fixture.viewerA);
    const response = await authorized('get', '/api/v1/sales', token);
    expect(response.status).toBe(403);
  });

  async function login(user: { email: string; password: string }): Promise<string> {
    const response = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `10.24.0.${++ipSequence}`)
      .send({ email: user.email, password: user.password });
    if (response.status !== 200)
      throw new Error(
        `Commercial fixture login failed with ${response.status}: ${JSON.stringify(response.body)}`,
      );
    return String(body(response).accessToken);
  }

  async function createSale(token: string, amount: string): Promise<{ id: string }> {
    const response = await authorized('post', '/api/v1/sales', token).send({
      contactId: fixture.contactA,
      currency: 'USD',
      items: [{ productId: fixture.productA, unitPrice: amount }],
    });
    const id = String(body(response).id);
    const confirmed = await authorized('post', `/api/v1/sales/${id}/confirm`, token);
    if (confirmed.status !== 201)
      throw new Error(
        `Commercial fixture sale confirmation failed: ${JSON.stringify(confirmed.body)}`,
      );
    return { id };
  }

  async function createSubscription(token: string): Promise<{ id: string }> {
    const sale = await createSale(token, '50.00');
    const item = await prisma.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    const response = await authorized(
      'post',
      `/api/v1/subscriptions/from-sale-item/${item.id}`,
      token,
    ).send({ billingCycle: 'MONTHLY' });
    const id = String(body(response).id);
    const activated = await authorized('post', `/api/v1/subscriptions/${id}/activate`, token);
    if (activated.status !== 201)
      throw new Error(
        `Commercial fixture subscription activation failed: ${JSON.stringify(activated.body)}`,
      );
    return { id };
  }

  function authorized(method: 'get' | 'post' | 'patch', path: string, token: string): request.Test {
    const builder =
      method === 'get' ? api.get(path) : method === 'patch' ? api.patch(path) : api.post(path);
    return builder
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', `10.24.1.${++ipSequence}`);
  }
});

async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const [organizationA, organizationB] = await Promise.all([
    prisma.organization.create({
      data: { name: 'Commercial Org A', slug: `commercial-a-${Date.now()}` },
    }),
    prisma.organization.create({
      data: { name: 'Commercial Org B', slug: `commercial-b-${Date.now()}` },
    }),
  ]);
  const permissionKeys = [
    'sales.read',
    'sales.create',
    'sales.update',
    'sales.delete',
    'payments.read',
    'payments.create',
    'payments.update',
    'subscriptions.read',
    'subscriptions.create',
    'subscriptions.update',
    'renewals.read',
    'renewals.create',
    'renewals.update',
  ];
  const permissions = await Promise.all(
    permissionKeys.map((key) => prisma.permission.create({ data: { key, name: key } })),
  );
  const connect = permissions.map((permission) => ({ id: permission.id }));
  const [roleA, roleB, viewerRole] = await Promise.all([
    prisma.role.create({
      data: { organizationId: organizationA.id, name: 'Owner', permissions: { connect } },
    }),
    prisma.role.create({
      data: { organizationId: organizationB.id, name: 'Owner', permissions: { connect } },
    }),
    prisma.role.create({ data: { organizationId: organizationA.id, name: 'Viewer' } }),
  ]);
  const passwordHash = await hashPassword(PASSWORD);
  const [ownerA, ownerB, viewerA] = await Promise.all([
    prisma.user.create({
      data: {
        organizationId: organizationA.id,
        roleId: roleA.id,
        email: `commercial-a-${Date.now()}@example.com`,
        firstName: 'Commercial',
        lastName: 'A',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organizationB.id,
        roleId: roleB.id,
        email: `commercial-b-${Date.now()}@example.com`,
        firstName: 'Commercial',
        lastName: 'B',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organizationA.id,
        roleId: viewerRole.id,
        email: `commercial-viewer-${Date.now()}@example.com`,
        firstName: 'Commercial',
        lastName: 'Viewer',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    }),
  ]);
  const [stageA, contactA, contactB] = await Promise.all([
    prisma.pipelineStage.create({
      data: {
        organizationId: organizationA.id,
        name: 'Commercial Lead',
        order: 1,
        color: '#111111',
        category: PipelineStageCategory.OPEN,
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: organizationA.id,
        firstName: 'Contact',
        lastName: 'A',
        email: `commercial-contact-a-${Date.now()}@example.com`,
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: organizationB.id,
        firstName: 'Contact',
        lastName: 'B',
        email: `commercial-contact-b-${Date.now()}@example.com`,
      },
    }),
  ]);
  const [productA, productB] = await Promise.all([
    prisma.product.create({
      data: {
        organizationId: organizationA.id,
        name: 'Commercial Product A',
        slug: `commercial-product-a-${Date.now()}`,
        type: ProductType.SUBSCRIPTION,
        fulfillmentMode: FulfillmentMode.MANUAL,
        status: ProductStatus.ACTIVE,
        active: true,
        requiresSubscription: true,
        price: new Prisma.Decimal('50.00'),
        currency: 'USD',
      },
    }),
    prisma.product.create({
      data: {
        organizationId: organizationB.id,
        name: 'Commercial Product B',
        slug: `commercial-product-b-${Date.now()}`,
        type: ProductType.SERVICE,
        status: ProductStatus.ACTIVE,
        active: true,
        price: new Prisma.Decimal('50.00'),
        currency: 'USD',
      },
    }),
  ]);
  await prisma.productPlan.create({
    data: {
      organizationId: organizationA.id,
      productId: productA.id,
      name: 'Monthly Plan',
      customerSegment: CustomerSegment.END_CUSTOMER,
      billingPeriodUnit: BillingPeriodUnit.MONTH,
      billingPeriodCount: 1,
      order: 1,
    },
  });
  const opportunity = await prisma.opportunity.create({
    data: {
      organizationId: organizationA.id,
      contactId: contactA.id,
      pipelineStageId: stageA.id,
      productId: productA.id,
      userId: ownerA.id,
      title: 'Commercial Opportunity',
      currency: 'USD',
    },
  });
  return {
    organizationA: organizationA.id,
    organizationB: organizationB.id,
    ownerA: { id: ownerA.id, email: ownerA.email, password: PASSWORD },
    ownerB: { id: ownerB.id, email: ownerB.email, password: PASSWORD },
    viewerA: { id: viewerA.id, email: viewerA.email, password: PASSWORD },
    contactA: contactA.id,
    contactB: contactB.id,
    productA: productA.id,
    productB: productB.id,
    opportunityA: opportunity.id,
  };
}
