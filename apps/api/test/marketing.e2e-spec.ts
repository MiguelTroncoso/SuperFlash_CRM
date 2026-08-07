import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, UserStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { hashPassword } from '../src/modules/auth/auth.crypto';
import { resetDatabase } from './test-database';

describe('Marketing attribution and campaign performance HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let email: string;
  let organizationId: string;
  const password = 'MarketingOwner1!';

  beforeAll(async () => {
    if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test'))
      throw new Error('Marketing integration tests require schema=auth_test.');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, moduleRef.get(ConfigService).getOrThrow<AppConfiguration>('app'));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    api = request(app.getHttpServer());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const organization = await prisma.organization.create({
      data: { name: 'Marketing Test', slug: `marketing-${Date.now()}` },
    });
    organizationId = organization.id;
    const permissions = await prisma.permission.createManyAndReturn({
      data: [
        { key: 'marketing.campaigns.read', name: 'Marketing campaigns read' },
        { key: 'marketing.campaigns.manage', name: 'Marketing campaigns manage' },
        { key: 'marketing.spend.read', name: 'Marketing spend read' },
        { key: 'marketing.spend.manage', name: 'Marketing spend manage' },
        { key: 'marketing.analytics.read', name: 'Marketing analytics read' },
        { key: 'marketing.attribution.read', name: 'Marketing attribution read' },
        { key: 'marketing.attribution.manage', name: 'Marketing attribution manage' },
        { key: 'commercial.profit.read', name: 'Commercial profit read' },
      ],
    });
    const role = await prisma.role.create({
      data: {
        organizationId,
        name: 'Owner',
        permissions: { connect: permissions.map((permission) => ({ id: permission.id })) },
      },
    });
    email = `marketing-${Date.now()}@example.com`;
    await prisma.user.create({
      data: {
        organizationId,
        roleId: role.id,
        email,
        firstName: 'Marketing',
        lastName: 'Owner',
        passwordHash: await hashPassword(password),
        status: UserStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a campaign, spend and original attribution with tenant-scoped performance', async () => {
    const login = await api.post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    const authorization = `Bearer ${String(login.body.accessToken)}`;
    const contact = await prisma.contact.create({
      data: {
        organizationId,
        firstName: 'Lead',
        phone: '+56912345678',
        phoneNormalized: '+56912345678',
      },
    });
    const today = new Date();
    const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1_000);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1_000);
    const campaign = await api
      .post('/api/v1/marketing/campaigns')
      .set('Authorization', authorization)
      .send({ name: 'Campaña prueba', platform: 'META_ADS', source: 'PAID' });
    expect(campaign.status).toBe(201);
    const spend = await api
      .post('/api/v1/marketing/spend')
      .set('Authorization', authorization)
      .send({
        date: dateOnly(today),
        campaignId: campaign.body.id,
        amount: '100.00',
        currency: 'USD',
      });
    expect(spend.status).toBe(201);
    const attribution = await api
      .post('/api/v1/marketing/attribution')
      .set('Authorization', authorization)
      .send({
        kind: 'ORIGINAL',
        contactId: contact.id,
        campaignId: campaign.body.id,
        platform: 'META_ADS',
        source: 'PAID',
      });
    expect(attribution.status).toBe(201);
    const performance = await api
      .get(
        `/api/v1/marketing/performance?from=${dateOnly(yesterday)}&to=${dateOnly(tomorrow)}&currency=USD`,
      )
      .set('Authorization', authorization);
    expect(performance.status).toBe(200);
    expect(performance.body.data[0]).toMatchObject({
      campaignName: 'Campaña prueba',
      spend: '100.00',
      contacts: 1,
    });
    expect(JSON.stringify(performance.body)).not.toContain('organizationId');
  });

  it('rejects references from a different tenant', async () => {
    const login = await api.post('/api/v1/auth/login').send({ email, password });
    const authorization = `Bearer ${String(login.body.accessToken)}`;
    const otherOrganization = await prisma.organization.create({
      data: { name: 'Other', slug: `other-${Date.now()}` },
    });
    const otherCampaign = await prisma.campaign.create({
      data: {
        organizationId: otherOrganization.id,
        name: 'Other campaign',
        platform: 'META_ADS',
        source: 'PAID',
      },
    });
    const response = await api
      .post('/api/v1/marketing/spend')
      .set('Authorization', authorization)
      .send({ date: '2026-08-05', campaignId: otherCampaign.id, amount: '10.00', currency: 'USD' });
    expect(response.status).toBe(404);
  });

  it('enforces spend idempotency and controlled currencies', async () => {
    const login = await api.post('/api/v1/auth/login').send({ email, password });
    const authorization = `Bearer ${String(login.body.accessToken)}`;
    const campaign = await api
      .post('/api/v1/marketing/campaigns')
      .set('Authorization', authorization)
      .send({ name: 'Campaña idempotente', platform: 'META_ADS', source: 'PAID' });
    const payload = {
      date: '2026-08-05',
      campaignId: campaign.body.id,
      amount: '25.00',
      currency: 'USD',
      idempotencyKey: 'marketing-spend-key-1',
    };
    const first = await api
      .post('/api/v1/marketing/spend')
      .set('Authorization', authorization)
      .send(payload);
    const repeated = await api
      .post('/api/v1/marketing/spend')
      .set('Authorization', authorization)
      .send(payload);
    const sameDayList = await api
      .get('/api/v1/marketing/spend?from=2026-08-05&to=2026-08-05')
      .set('Authorization', authorization);
    const changed = await api
      .post('/api/v1/marketing/spend')
      .set('Authorization', authorization)
      .send({ ...payload, amount: '30.00' });
    const unsupported = await api
      .post('/api/v1/marketing/spend')
      .set('Authorization', authorization)
      .send({ ...payload, idempotencyKey: 'marketing-spend-key-2', currency: 'XYZ' });

    expect(first.status).toBe(201);
    expect(repeated.status).toBe(201);
    expect(repeated.body.id).toBe(first.body.id);
    expect(repeated.body.idempotent).toBe(true);
    expect(sameDayList.status).toBe(200);
    expect(sameDayList.body.pagination.total).toBe(1);
    expect(changed.status).toBe(409);
    expect(changed.body.code).toBe('MARKETING_SPEND_IDEMPOTENCY_CONFLICT');
    expect(unsupported.status).toBe(400);
  });
});
