import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PipelineStageCategory, PrismaClient, SaleStatus, UserStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { hashPassword } from '../src/modules/auth/auth.crypto';
import { resetDatabase } from './test-database';

const PASSWORD = 'ExecutivePassword1!';

describe('Executive Intelligence HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let email: string;
  let contactId: string;

  beforeAll(async () => {
    if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test')) {
      throw new Error('Executive Intelligence integration tests require schema=auth_test.');
    }
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
    const organization = await prisma.organization.create({
      data: { name: 'Executive Test', slug: `executive-${Date.now()}` },
    });
    const permissionKeys = [
      'reports.read',
      'contacts.read',
      'opportunities.read',
      'followups.read',
    ];
    const permissions = await Promise.all(
      permissionKeys.map((key) => prisma.permission.create({ data: { key, name: key } })),
    );
    const role = await prisma.role.create({
      data: {
        organizationId: organization.id,
        name: 'Owner',
        permissions: { connect: permissions.map((permission) => ({ id: permission.id })) },
      },
    });
    email = `executive-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        roleId: role.id,
        email,
        firstName: 'Executive',
        lastName: 'Owner',
        passwordHash: await hashPassword(PASSWORD),
        status: UserStatus.ACTIVE,
      },
    });
    const contact = await prisma.contact.create({
      data: {
        organizationId: organization.id,
        firstName: 'Read',
        lastName: 'Model',
        country: 'CL',
        isCustomer: true,
      },
    });
    contactId = contact.id;
    const stage = await prisma.pipelineStage.create({
      data: {
        organizationId: organization.id,
        name: 'Nuevo Lead',
        order: 1,
        color: '#6366ff',
        category: PipelineStageCategory.OPEN,
        systemKey: 'NEW_LEAD',
      },
    });
    const opportunity = await prisma.opportunity.create({
      data: {
        organizationId: organization.id,
        contactId: contact.id,
        pipelineStageId: stage.id,
        userId: user.id,
        title: 'Executive opportunity',
        expectedAmount: 100,
        currency: 'USD',
        probability: 80,
        priority: 'HIGH',
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizationId: organization.id,
        contactId: contact.id,
        opportunityId: opportunity.id,
        userId: user.id,
        saleNumber: 'TEST-EXECUTIVE-SALE',
        status: SaleStatus.CONFIRMED,
        subtotal: 100,
        discountAmount: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD',
        soldAt: new Date(),
      },
    });
    await prisma.saleItem.create({
      data: {
        organizationId: organization.id,
        saleId: sale.id,
        snapshotVersion: 2,
        productNameSnapshot: 'Executive Product',
        requiresSubscriptionSnapshot: false,
        catalogSnapshot: { source: 'test' },
        quantity: 1,
        unitPrice: 100,
        discountAmount: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function token(): Promise<string> {
    const response = await api.post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(response.status).toBe(200);
    return String(response.body.accessToken);
  }

  it('returns persisted executive metrics without organization internals', async () => {
    const response = await api
      .get('/api/v1/executive/dashboard')
      .set('Authorization', `Bearer ${await token()}`);
    expect(response.status).toBe(200);
    expect(response.body.kpis.salesMonth[0]).toEqual(
      expect.objectContaining({ currency: 'USD', amount: '100.00' }),
    );
    expect(JSON.stringify(response.body)).not.toContain('organizationId');
  });

  it('returns weighted pipeline data and a tenant-scoped customer 360', async () => {
    const authorization = `Bearer ${await token()}`;
    const [pipeline, customer] = await Promise.all([
      api.get('/api/v1/pipeline/intelligence').set('Authorization', authorization),
      api.get(`/api/v1/customer-360/${contactId}`).set('Authorization', authorization),
    ]);
    expect(pipeline.status).toBe(200);
    expect(pipeline.body.data[0]).toEqual(
      expect.objectContaining({ probability: 80, priority: 'HIGH', weightedValue: '80.00' }),
    );
    expect(customer.status).toBe(200);
    expect(customer.body.contact).not.toHaveProperty('organizationId');
  });

  it('protects global search and unauthenticated intelligence routes', async () => {
    expect((await api.get('/api/v1/global-search?search=Read')).status).toBe(401);
    const response = await api
      .get('/api/v1/global-search?search=Read')
      .set('Authorization', `Bearer ${await token()}`);
    expect(response.status).toBe(200);
    expect(response.body.results[0]).toEqual(expect.objectContaining({ type: 'contact' }));
  });

  it('serves every BI dimension and the operational agenda', async () => {
    const authorization = `Bearer ${await token()}`;
    const views = [
      'summary',
      'countries',
      'products',
      'campaigns',
      'sellers',
      'providers',
      'renewals',
    ];
    const responses = await Promise.all(
      views.map((view) =>
        api.get(`/api/v1/business-intelligence/${view}`).set('Authorization', authorization),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const agenda = await api.get('/api/v1/agenda/operational').set('Authorization', authorization);
    expect(agenda.status).toBe(200);
    expect(agenda.body.sections).toEqual(expect.any(Object));
  });
});
