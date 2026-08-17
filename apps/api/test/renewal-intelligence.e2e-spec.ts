import { INestApplication } from '@nestjs/common';
import {
  BillingCycle,
  RenewalStatus,
  RenewalWorkflowStatus,
  SaleStatus,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { hashPassword } from '../src/modules/auth/auth.crypto';
import { resetDatabase } from './test-database';

describe('Renewal Intelligence HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let email: string;
  let renewalId: string;
  let contactId: string;
  const password = 'RenewalOwner1!';

  beforeAll(async () => {
    if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test'))
      throw new Error('Renewal integration tests require schema=auth_test.');
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
      data: { name: 'Renewal Test', slug: `renewal-${Date.now()}` },
    });
    const permissionKeys = [
      'renewals.read',
      'renewals.create',
      'renewals.update',
      'renewals.export',
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
    email = `renewal-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        roleId: role.id,
        email,
        firstName: 'Renewal',
        lastName: 'Owner',
        passwordHash: await hashPassword(password),
        status: UserStatus.ACTIVE,
      },
    });
    const contact = await prisma.contact.create({
      data: {
        organizationId: organization.id,
        firstName: 'Cliente',
        lastName: 'Renewal',
        email: `customer-${Date.now()}@example.com`,
        country: 'CL',
      },
    });
    contactId = contact.id;
    const sale = await prisma.sale.create({
      data: {
        organizationId: organization.id,
        contactId: contact.id,
        userId: user.id,
        saleNumber: 'TEST-RENEWAL-SALE',
        status: SaleStatus.CONFIRMED,
        subtotal: 100,
        discountAmount: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD',
        soldAt: new Date(),
      },
    });
    const saleItem = await prisma.saleItem.create({
      data: {
        organizationId: organization.id,
        saleId: sale.id,
        productNameSnapshot: 'Plan mensual',
        catalogSnapshot: {},
        quantity: 1,
        unitPrice: 100,
        discountAmount: 0,
        taxAmount: 0,
        total: 100,
        currency: 'USD',
        requiresSubscriptionSnapshot: true,
      },
    });
    const start = new Date();
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 30);
    const subscription = await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        saleId: sale.id,
        saleItemId: saleItem.id,
        contactId: contact.id,
        userId: user.id,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: BillingCycle.MONTHLY,
        currency: 'USD',
        amount: 100,
        quantity: 1,
        productNameSnapshot: 'Plan mensual',
        catalogSnapshot: {},
        startsAt: start,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        nextBillingAt: start,
      },
    });
    const renewal = await prisma.renewal.create({
      data: {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        sourceSaleId: sale.id,
        userId: user.id,
        status: RenewalStatus.PENDING,
        workflowStatus: RenewalWorkflowStatus.PENDING,
        billingCycle: BillingCycle.MONTHLY,
        amount: 100,
        currency: 'USD',
        dueAt: start,
        periodStart: start,
        periodEnd: end,
        cycleKey: `${subscription.id}:${start.toISOString()}`,
        productNameSnapshot: 'Plan mensual',
        catalogSnapshot: {},
      },
    });
    renewalId = renewal.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns tenant-scoped dashboard and records workflow changes in Activity', async () => {
    const login = await api.post('/api/v1/auth/login').send({ email, password });
    const token = `Bearer ${String(login.body.accessToken)}`;
    const dashboard = await api.get('/api/v1/renewal-center/dashboard').set('Authorization', token);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.cards.today).toBe(1);
    expect(JSON.stringify(dashboard.body)).not.toContain('organizationId');
    const changed = await api
      .patch(`/api/v1/renewal-center/${renewalId}/workflow-status`)
      .set('Authorization', token)
      .send({ workflowStatus: 'CONTACTED', note: 'Se llamó al cliente.' });
    expect(changed.status).toBe(200);
    expect(changed.body.workflowStatus).toBe('CONTACTED');
    expect(
      await prisma.activity.count({
        where: { contactId, title: 'Estado de renovación actualizado' },
      }),
    ).toBe(1);
  });

  it('generates internal reminders idempotently and exports report data', async () => {
    const login = await api.post('/api/v1/auth/login').send({ email, password });
    const token = `Bearer ${String(login.body.accessToken)}`;
    const first = await api
      .post('/api/v1/renewal-center/reminders/generate')
      .set('Authorization', token);
    const second = await api
      .post('/api/v1/renewal-center/reminders/generate')
      .set('Authorization', token);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await prisma.renewalReminder.count()).toBe(8);
    expect(await prisma.notification.count()).toBe(6);
    const report = await api
      .get('/api/v1/renewal-center/reports?groupBy=product')
      .set('Authorization', token);
    expect(report.status).toBe(200);
    expect(report.body.data[0].label).toBe('Plan mensual');
    const csv = await api
      .get('/api/v1/renewal-center/reports/export?groupBy=product')
      .set('Authorization', token);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Grupo,Moneda,Monto');
  });

  it('keeps CSV import preview tenant-scoped and rejects unknown lifecycle rows', async () => {
    const login = await api.post('/api/v1/auth/login').send({ email, password });
    const token = `Bearer ${String(login.body.accessToken)}`;
    const preview = await api
      .post('/api/v1/renewal-center/import/preview')
      .set('Authorization', token)
      .send({
        csv: 'Cliente,Producto,Fecha inicio,Fecha vencimiento,Monto,Moneda,Estado\nCliente Renewal,Plan mensual,2026-08-01,2026-09-01,100,USD,Estado desconocido',
      });
    expect(preview.status).toBe(201);
    expect(preview.body.invalid).toBe(1);
    expect(JSON.stringify(preview.body)).not.toContain('organizationId');
  });
});
