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

describe('Financial Intelligence HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let email: string;
  const password = 'FinancialOwner1!';

  beforeAll(async () => {
    if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test'))
      throw new Error('Financial integration tests require schema=auth_test.');
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
      data: { name: 'Financial Test', slug: `financial-${Date.now()}` },
    });
    const read = await prisma.permission.create({
      data: { key: 'financial.read', name: 'Financial read' },
    });
    const manage = await prisma.permission.create({
      data: { key: 'financial.manage', name: 'Financial manage' },
    });
    const role = await prisma.role.create({
      data: {
        organizationId: organization.id,
        name: 'Owner',
        permissions: { connect: [{ id: read.id }, { id: manage.id }] },
      },
    });
    email = `financial-${Date.now()}@example.com`;
    await prisma.user.create({
      data: {
        organizationId: organization.id,
        roleId: role.id,
        email,
        firstName: 'Financial',
        lastName: 'Owner',
        passwordHash: await hashPassword(password),
        status: UserStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a category and expense, then exposes tenant-scoped dashboard data', async () => {
    const login = await api.post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    const authorization = `Bearer ${String(login.body.accessToken)}`;
    const category = await api
      .post('/api/v1/financial/categories')
      .set('Authorization', authorization)
      .send({ name: 'Hosting' });
    expect(category.status).toBe(201);
    const expense = await api
      .post('/api/v1/financial/expenses')
      .set('Authorization', authorization)
      .send({
        expenseDate: new Date().toISOString(),
        amount: '35.00',
        currency: 'USD',
        categoryId: category.body.id,
        paymentMethod: 'TRANSFER',
        frequency: 'MONTHLY',
        description: 'VPS',
      });
    expect(expense.status).toBe(201);
    const dashboard = await api
      .get('/api/v1/financial/dashboard?currency=USD')
      .set('Authorization', authorization);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.expenses).toBe('35.00');
    expect(JSON.stringify(dashboard.body)).not.toContain('organizationId');
  });
});
