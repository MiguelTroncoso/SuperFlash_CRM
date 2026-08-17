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

const PASSWORD = 'RevenuePassword1!';

describe('Revenue Intelligence HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let email: string;

  beforeAll(async () => {
    if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test')) {
      throw new Error('Revenue Intelligence integration tests require schema=auth_test.');
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
      data: { name: 'Revenue Test', slug: `revenue-${Date.now()}` },
    });
    const permission = await prisma.permission.create({
      data: { key: 'reports.read', name: 'Reports read' },
    });
    const role = await prisma.role.create({
      data: {
        organizationId: organization.id,
        name: 'Owner',
        permissions: { connect: [{ id: permission.id }] },
      },
    });
    email = `revenue-${Date.now()}@example.com`;
    const passwordHash = await hashPassword(PASSWORD);
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        roleId: role.id,
        email,
        firstName: 'Revenue',
        lastName: 'Owner',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });
    const contact = await prisma.contact.create({
      data: {
        organizationId: organization.id,
        firstName: 'Analytic',
        lastName: 'Customer',
        country: 'CL',
        isCustomer: true,
      },
    });
    const stage = await prisma.pipelineStage.create({
      data: {
        organizationId: organization.id,
        name: 'Potential buyer',
        order: 1,
        color: '#6366ff',
        category: PipelineStageCategory.OPEN,
        systemKey: 'POTENTIAL_BUYER',
      },
    });
    const opportunity = await prisma.opportunity.create({
      data: {
        organizationId: organization.id,
        contactId: contact.id,
        pipelineStageId: stage.id,
        userId: user.id,
        title: 'Analytics opportunity',
      },
    });
    const sale = await prisma.sale.create({
      data: {
        organizationId: organization.id,
        contactId: contact.id,
        opportunityId: opportunity.id,
        userId: user.id,
        saleNumber: 'TEST-REVENUE-SALE',
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
        productNameSnapshot: 'Analytics Product',
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

  it('returns tenant-scoped KPIs and dashboard without leaking organizationId', async () => {
    const response = await api
      .get('/api/v1/revenue-intelligence/dashboard')
      .set('Authorization', `Bearer ${await token()}`);
    expect(response.status).toBe(200);
    expect(response.body.kpis.salesMonth[0]).toEqual(
      expect.objectContaining({ currency: 'USD', amount: '100.00', count: 1 }),
    );
    expect(response.body.kpis.activeCustomers).toBe(1);
    expect(JSON.stringify(response.body)).not.toContain('organizationId');
  });

  it('supports configurable funnels and period comparison', async () => {
    const response = await api
      .get('/api/v1/revenue-intelligence/funnels?stages=MESSAGE,SALE&compare=true')
      .set('Authorization', `Bearer ${await token()}`);
    expect(response.status).toBe(200);
    expect(response.body.data.stages.map((stage: { key: string }) => stage.key)).toEqual([
      'MESSAGE',
      'SALE',
    ]);
    expect(response.body.data.comparison).toHaveLength(2);
  });

  it('exposes cohort, trend, forecast and materialized view endpoints', async () => {
    const authorization = `Bearer ${await token()}`;
    const [cohorts, trends, forecast, views] = await Promise.all([
      api.get('/api/v1/revenue-intelligence/cohorts').set('Authorization', authorization),
      api.get('/api/v1/revenue-intelligence/trends').set('Authorization', authorization),
      api
        .get('/api/v1/revenue-intelligence/forecast?horizon=2')
        .set('Authorization', authorization),
      api
        .get('/api/v1/revenue-intelligence/materialized-views/status')
        .set('Authorization', authorization),
    ]);
    expect(cohorts.status).toBe(200);
    expect(trends.status).toBe(200);
    expect(forecast.status).toBe(200);
    expect(views.status).toBe(200);
    expect(views.body.views).toHaveLength(3);
  });

  it('rejects unauthenticated access and honors reports.read', async () => {
    const response = await api.get('/api/v1/revenue-intelligence/kpis');
    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty('organizationId');
  });
});
