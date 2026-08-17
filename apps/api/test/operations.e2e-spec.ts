import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FulfillmentMode,
  PrismaClient,
  ProductStatus,
  ProductType,
  SaleStatus,
  UserStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { hashPassword } from '../src/modules/auth/auth.crypto';
import { resetDatabase } from './test-database';

const PASSWORD = 'OperationsOwner1!';

interface FixtureUser {
  id: string;
  email: string;
  password: string;
  organizationId: string;
}
interface Fixture {
  ownerA: FixtureUser;
  ownerB: FixtureUser;
  saleItemA: string;
  productA: string;
  contactA: string;
}

function requireIsolatedDatabase(): void {
  if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test'))
    throw new Error('Las pruebas operativas requieren DATABASE_URL con schema=auth_test.');
}

function body(response: { body: unknown }): Record<string, unknown> {
  return response.body as Record<string, unknown>;
}

describe('Operations and fulfillment HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let fixture: Fixture;
  let sequence = 0;

  beforeAll(async () => {
    requireIsolatedDatabase();
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

  async function login(user: FixtureUser): Promise<string> {
    const response = await api
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', `10.99.0.${++sequence}`)
      .send({ email: user.email, password: user.password });
    expect(response.status).toBe(200);
    return String(body(response).accessToken);
  }

  function authorized(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    token: string,
  ): request.Test {
    const builder =
      method === 'get'
        ? api.get(path)
        : method === 'patch'
          ? api.patch(path)
          : method === 'delete'
            ? api.delete(path)
            : api.post(path);
    return builder
      .set('Authorization', `Bearer ${token}`)
      .set('x-forwarded-for', `10.99.1.${++sequence}`);
  }

  async function provider(token: string, type = 'MANUAL'): Promise<string> {
    const response = await authorized('post', '/api/v1/providers', token).send({
      name: `Provider ${randomUUID()}`,
      type,
      fulfillmentMode: type === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC',
    });
    expect(response.status).toBe(201);
    return String(body(response).id);
  }

  it('creates a provider with tenant-scoped slug and no organizationId in the response', async () => {
    const token = await login(fixture.ownerA);
    const response = await authorized('post', '/api/v1/providers', token).send({
      name: 'Manual Supplier',
      type: 'MANUAL',
      metadata: { region: 'CL' },
    });
    expect(response.status).toBe(201);
    expect(body(response).organizationId).toBeUndefined();
    expect(body(response).slug).toBe('manual-supplier');
  });

  it('rejects secrets in provider metadata', async () => {
    const token = await login(fixture.ownerA);
    const response = await authorized('post', '/api/v1/providers', token).send({
      name: 'Unsafe',
      type: 'API',
      metadata: { apiToken: 'must-not-persist' },
    });
    expect(response.status).toBe(400);
  });

  it('isolates providers between organizations', async () => {
    const tokenA = await login(fixture.ownerA);
    const tokenB = await login(fixture.ownerB);
    const id = await provider(tokenA);
    const response = await authorized('get', `/api/v1/providers/${id}`, tokenB);
    expect(response.status).toBe(404);
  });

  it('creates provider mappings only for same-tenant catalog relations', async () => {
    const token = await login(fixture.ownerA);
    const providerId = await provider(token);
    const response = await authorized('post', '/api/v1/provider-mappings', token).send({
      providerId,
      productId: fixture.productA,
      priority: 1,
    });
    expect(response.status).toBe(201);
    const mappings = await authorized(
      'get',
      `/api/v1/provider-mappings?productId=${fixture.productA}`,
      token,
    );
    expect(mappings.status).toBe(200);
    expect((body(mappings).data as unknown[]).length).toBe(1);
  });

  it('creates exactly one fulfillment under concurrent idempotent requests', async () => {
    const token = await login(fixture.ownerA);
    const providerId = await provider(token);
    const responses = await Promise.all([
      authorized('post', '/api/v1/fulfillments', token).send({
        saleItemId: fixture.saleItemA,
        providerId,
        idempotencyKey: 'same-request',
      }),
      authorized('post', '/api/v1/fulfillments', token).send({
        saleItemId: fixture.saleItemA,
        providerId,
        idempotencyKey: 'same-request',
      }),
    ]);
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(new Set(responses.map((response) => String(body(response).id))).size).toBe(1);
    expect(
      await prisma.fulfillment.count({ where: { organizationId: fixture.ownerA.organizationId } }),
    ).toBe(1);
  });

  it('rejects the same fulfillment idempotency key with a different payload', async () => {
    const token = await login(fixture.ownerA);
    const firstProvider = await provider(token);
    const secondProvider = await provider(token);
    const first = await authorized('post', '/api/v1/fulfillments', token).send({
      saleItemId: fixture.saleItemA,
      providerId: firstProvider,
      idempotencyKey: 'payload-key',
    });
    expect(first.status).toBe(201);
    const conflict = await authorized('post', '/api/v1/fulfillments', token).send({
      saleItemId: fixture.saleItemA,
      providerId: secondProvider,
      idempotencyKey: 'payload-key',
    });
    expect(conflict.status).toBe(409);
  });

  it('does not assign an inactive provider', async () => {
    const token = await login(fixture.ownerA);
    const providerId = await provider(token);
    expect(
      (
        await authorized('patch', `/api/v1/providers/${providerId}`, token).send({
          status: 'INACTIVE',
        })
      ).status,
    ).toBe(200);
    const response = await authorized('post', '/api/v1/fulfillments', token).send({
      saleItemId: fixture.saleItemA,
      providerId,
    });
    expect(response.status).toBe(409);
  });

  it('provisions through the mock adapter without an external call', async () => {
    const token = await login(fixture.ownerA);
    const providerId = await provider(token, 'API');
    const fulfillment = await authorized('post', '/api/v1/fulfillments', token).send({
      saleItemId: fixture.saleItemA,
      providerId,
    });
    expect(fulfillment.status).toBe(201);
    const response = await authorized(
      'post',
      `/api/v1/fulfillments/${String(body(fulfillment).id)}/provision`,
      token,
    ).send({ idempotencyKey: 'provision-1' });
    expect(response.status).toBe(201);
    expect(body(response).status).toBe('COMPLETED');
    expect(
      await prisma.provisioningAttempt.count({
        where: { organizationId: fixture.ownerA.organizationId, status: 'SUCCEEDED' },
      }),
    ).toBe(1);
  });

  it('keeps provisioning attempts append-only', async () => {
    const token = await login(fixture.ownerA);
    const providerId = await provider(token, 'API');
    const fulfillment = await authorized('post', '/api/v1/fulfillments', token).send({
      saleItemId: fixture.saleItemA,
      providerId,
    });
    await authorized(
      'post',
      `/api/v1/fulfillments/${String(body(fulfillment).id)}/provision`,
      token,
    ).send({ idempotencyKey: 'append-only' });
    const attempt = await prisma.provisioningAttempt.findFirstOrThrow({
      where: { organizationId: fixture.ownerA.organizationId },
    });
    await expect(
      prisma.provisioningAttempt.update({
        where: {
          organizationId_id: { organizationId: fixture.ownerA.organizationId, id: attempt.id },
        },
        data: { errorMessage: 'mutation' },
      }),
    ).rejects.toThrow();
  });

  it('masks credentials and reveals only with the explicit permission', async () => {
    const token = await login(fixture.ownerA);
    const providerId = await provider(token);
    const fulfillment = await authorized('post', '/api/v1/fulfillments', token).send({
      saleItemId: fixture.saleItemA,
      providerId,
    });
    const credential = await authorized('post', '/api/v1/credentials', token).send({
      fulfillmentId: String(body(fulfillment).id),
      username: 'demo-user',
      password: 'DemoSecret1!',
    });
    expect(credential.status).toBe(201);
    expect(body(credential).password).toBe('••••');
    const stored = await prisma.credentialRecord.findFirstOrThrow({
      where: { organizationId: fixture.ownerA.organizationId },
    });
    expect(stored.encryptedPassword).not.toContain('DemoSecret1!');
    const revealed = await authorized(
      'post',
      `/api/v1/credentials/${String(body(credential).id)}/reveal`,
      token,
    );
    expect(revealed.status).toBe(201);
    expect(body(revealed).password).toBe('DemoSecret1!');
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: String(body(credential).id) },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(event.payload)).not.toContain('DemoSecret1!');
  });

  it('creates and activates a trial from a product snapshot', async () => {
    const token = await login(fixture.ownerA);
    const response = await authorized('post', '/api/v1/trials', token).send({
      contactId: fixture.contactA,
      productId: fixture.productA,
      durationMinutes: 60,
    });
    expect(response.status).toBe(201);
    const trialId = String(body(response).id);
    expect((await authorized('post', `/api/v1/trials/${trialId}/approve`, token)).status).toBe(201);
    const active = await authorized('post', `/api/v1/trials/${trialId}/activate`, token);
    expect(active.status).toBe(201);
    expect(body(active).status).toBe('ACTIVE');
    expect(body(active).snapshot).toBeDefined();
  });

  it('converts a trial exactly once to a new draft sale', async () => {
    const token = await login(fixture.ownerA);
    const trial = await authorized('post', '/api/v1/trials', token).send({
      contactId: fixture.contactA,
      productId: fixture.productA,
      durationMinutes: 60,
    });
    const id = String(body(trial).id);
    await authorized('post', `/api/v1/trials/${id}/approve`, token);
    await authorized('post', `/api/v1/trials/${id}/activate`, token);
    const conversions = await Promise.all([
      authorized('post', `/api/v1/trials/${id}/convert`, token),
      authorized('post', `/api/v1/trials/${id}/convert`, token),
    ]);
    expect(conversions.every((response) => response.status === 201)).toBe(true);
    expect(new Set(conversions.map((response) => String(body(response).saleId))).size).toBe(1);
    expect(
      await prisma.sale.count({ where: { organizationId: fixture.ownerA.organizationId } }),
    ).toBe(2);
  });

  it('creates and activates one activation for a completed fulfillment', async () => {
    const token = await login(fixture.ownerA);
    const providerId = await provider(token);
    const fulfillment = await authorized('post', '/api/v1/fulfillments', token).send({
      saleItemId: fixture.saleItemA,
      providerId,
    });
    const fulfillmentId = String(body(fulfillment).id);
    await authorized('post', `/api/v1/fulfillments/${fulfillmentId}/provision`, token);
    const activation = await authorized('post', '/api/v1/activations', token).send({
      fulfillmentId,
    });
    expect(activation.status).toBe(201);
    const active = await authorized(
      'post',
      `/api/v1/activations/${String(body(activation).id)}/activate`,
      token,
    );
    expect(active.status).toBe(201);
    expect(body(active).status).toBe('ACTIVE');
  });

  it('returns a technical My Day operations section without credential values', async () => {
    const token = await login(fixture.ownerA);
    const response = await authorized('get', '/api/v1/my-day', token);
    expect(response.status).toBe(200);
    expect((body(response).sections as Record<string, unknown>).pendingFulfillments).toBeDefined();
  });

  it('records daily operating metrics idempotently and exposes the source distinction', async () => {
    const token = await login(fixture.ownerA);
    const payload = {
      metricDate: '2026-08-15',
      country: 'CL',
      campaignName: 'Sprint 35 Manual',
      conversations: 12,
      demos: 4,
      salesCount: 1,
      adSpend: '35.50',
      grossRevenue: '120.00',
      currency: 'USD',
    };
    const first = await authorized('post', '/api/v1/dashboard/daily-metrics', token).send(payload);
    const second = await authorized('post', '/api/v1/dashboard/daily-metrics', token).send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(body(second).id).toBe(body(first).id);
    const dashboard = await authorized('get', '/api/v1/dashboard/operational', token);
    expect(dashboard.status).toBe(200);
    expect((body(dashboard).sourceOfTruth as Record<string, unknown>).financialSales).toBe(
      'Sale and confirmed Payment',
    );
    const rows = await prisma.dailyMetric.count({
      where: { organizationId: fixture.ownerA.organizationId },
    });
    expect(rows).toBe(1);

    const csv =
      'fecha,campaña,pais,conversaciones,demos,ventas,gasto\n' +
      '2026-08-16,Sprint 35 CSV,CL,8,2,0,12.00\n' +
      '2026-08-16,Sprint 35 CSV,MX,5,1,0,8.00';
    const imported = await authorized('post', '/api/v1/dashboard/daily-metrics/import', token).send(
      { csv },
    );
    const importedAgain = await authorized(
      'post',
      '/api/v1/dashboard/daily-metrics/import',
      token,
    ).send({ csv });
    expect(imported.status).toBe(201);
    expect(importedAgain.status).toBe(201);
    expect(body(imported).imported).toBe(2);
    expect(body(importedAgain).imported).toBe(2);
    expect(
      await prisma.dailyMetric.count({
        where: { organizationId: fixture.ownerA.organizationId },
      }),
    ).toBe(3);
  });

  it('allows manual metrics to be edited and archived without physical deletion', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/dashboard/daily-metrics', token).send({
      metricDate: '2026-08-15',
      country: 'CL',
      conversations: 2,
      demos: 1,
      salesCount: 0,
      adSpend: '5.00',
      currency: 'USD',
    });
    expect(created.status).toBe(201);
    const id = String(body(created).id);

    const updated = await authorized('patch', `/api/v1/dashboard/daily-metrics/${id}`, token).send({
      conversations: 5,
      notes: 'Revisado por operaciones',
    });
    expect(updated.status).toBe(200);
    expect(body(updated).conversations).toBe(5);
    expect(body(updated).notes).toBe('Revisado por operaciones');

    const archived = await authorized('delete', `/api/v1/dashboard/daily-metrics/${id}`, token);
    expect(archived.status).toBe(200);
    expect(await prisma.dailyMetric.findUniqueOrThrow({ where: { id } })).toEqual(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
    const visible = await authorized('get', '/api/v1/dashboard/daily-metrics', token);
    expect(visible.status).toBe(200);
    expect((body(visible).data as Array<{ id: string }>).some((row) => row.id === id)).toBe(false);
  });

  it('rejects unknown DTO fields', async () => {
    const token = await login(fixture.ownerA);
    const response = await authorized('post', '/api/v1/providers', token).send({
      name: 'Strict',
      type: 'MANUAL',
      organizationId: fixture.ownerB.organizationId,
    });
    expect(response.status).toBe(400);
  });
});

async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const [organizationA, organizationB] = await Promise.all([
    prisma.organization.create({
      data: { name: 'Operations A', slug: `operations-a-${randomUUID()}` },
    }),
    prisma.organization.create({
      data: { name: 'Operations B', slug: `operations-b-${randomUUID()}` },
    }),
  ]);
  const permissionKeys = [
    'providers.read',
    'providers.create',
    'providers.update',
    'providers.delete',
    'provider_mappings.read',
    'provider_mappings.create',
    'provider_mappings.update',
    'provider_mappings.delete',
    'fulfillments.read',
    'fulfillments.create',
    'fulfillments.update',
    'fulfillments.delete',
    'provisioning.read',
    'credentials.read',
    'credentials.create',
    'credentials.reveal',
    'credentials.revoke',
    'trials.read',
    'trials.create',
    'trials.update',
    'trials.delete',
    'activations.read',
    'activations.create',
    'activations.update',
    'activations.delete',
    'followups.read',
    'operations.read',
    'operations.manage',
  ];
  const permissions = await Promise.all(
    permissionKeys.map((key) => prisma.permission.create({ data: { key, name: key } })),
  );
  const ownerRoleA = await prisma.role.create({
    data: {
      organizationId: organizationA.id,
      name: 'Owner',
      permissions: { connect: permissions.map((permission) => ({ id: permission.id })) },
    },
  });
  const ownerRoleB = await prisma.role.create({
    data: {
      organizationId: organizationB.id,
      name: 'Owner',
      permissions: { connect: permissions.map((permission) => ({ id: permission.id })) },
    },
  });
  const passwordHash = await hashPassword(PASSWORD);
  const ownerA = await prisma.user.create({
    data: {
      organizationId: organizationA.id,
      roleId: ownerRoleA.id,
      email: `operations-a-${randomUUID()}@example.com`,
      firstName: 'Owner',
      lastName: 'A',
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });
  const ownerB = await prisma.user.create({
    data: {
      organizationId: organizationB.id,
      roleId: ownerRoleB.id,
      email: `operations-b-${randomUUID()}@example.com`,
      firstName: 'Owner',
      lastName: 'B',
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });
  const contactA = await prisma.contact.create({
    data: {
      organizationId: organizationA.id,
      firstName: 'Contact',
      lastName: 'A',
      email: `contact-${randomUUID()}@example.com`,
    },
  });
  const productA = await prisma.product.create({
    data: {
      organizationId: organizationA.id,
      name: 'Demo Product',
      slug: `demo-${randomUUID()}`,
      type: ProductType.DIGITAL_ACCESS,
      fulfillmentMode: FulfillmentMode.MANUAL,
      status: ProductStatus.ACTIVE,
      active: true,
      allowsDemo: true,
      price: '25.00',
      currency: 'USD',
    },
  });
  const sale = await prisma.sale.create({
    data: {
      organizationId: organizationA.id,
      contactId: contactA.id,
      saleNumber: 'TEST-OPERATIONS-SALE',
      status: SaleStatus.CONFIRMED,
      subtotal: '25.00',
      discountAmount: 0,
      taxAmount: 0,
      total: '25.00',
      currency: 'USD',
      soldAt: new Date(),
    },
  });
  const saleItem = await prisma.saleItem.create({
    data: {
      organizationId: organizationA.id,
      saleId: sale.id,
      productId: productA.id,
      snapshotVersion: 2,
      productNameSnapshot: productA.name,
      productSlugSnapshot: productA.slug,
      productTypeSnapshot: productA.type,
      fulfillmentModeSnapshot: productA.fulfillmentMode,
      skuSnapshot: null,
      requiresSubscriptionSnapshot: false,
      catalogSnapshot: {
        snapshotVersion: 2,
        productId: productA.id,
        productName: productA.name,
        productSlug: productA.slug,
        currency: 'USD',
        salePrice: '25.00',
      },
      quantity: 1,
      unitPrice: '25.00',
      discountAmount: 0,
      taxAmount: 0,
      total: '25.00',
      currency: 'USD',
    },
  });
  return {
    ownerA: {
      id: ownerA.id,
      email: ownerA.email,
      password: PASSWORD,
      organizationId: organizationA.id,
    },
    ownerB: {
      id: ownerB.id,
      email: ownerB.email,
      password: PASSWORD,
      organizationId: organizationB.id,
    },
    saleItemA: saleItem.id,
    productA: productA.id,
    contactA: contactA.id,
  };
}
