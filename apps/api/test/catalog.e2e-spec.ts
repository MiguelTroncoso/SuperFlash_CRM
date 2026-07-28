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

const PASSWORD = 'CatalogOwner1!';

interface FixtureUser {
  id: string;
  email: string;
  password: string;
  organizationId: string;
}
interface Fixture {
  ownerA: FixtureUser;
  ownerB: FixtureUser;
  productB: string;
}

function requireIsolatedDatabase(): void {
  if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test'))
    throw new Error('Las pruebas de catálogo requieren DATABASE_URL con schema=auth_test.');
}

describe('Catalog and pricing HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let fixture: Fixture;

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
    await prisma.priceHistory.deleteMany();
    await prisma.priceBookEntry.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.productPlan.deleteMany();
    await prisma.priceBook.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.contactTag.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.followUpHistory.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.opportunityStageHistory.deleteMany();
    await prisma.opportunity.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.product.deleteMany();
    await prisma.productCategory.deleteMany();
    await prisma.pipelineStage.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.organization.deleteMany();
    fixture = await createFixture(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(user: FixtureUser): Promise<string> {
    const response = await api
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password });
    expect(response.status).toBe(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  function authorized(method: 'get' | 'post' | 'patch', path: string, token: string): request.Test {
    return api[method](path).set('Authorization', `Bearer ${token}`);
  }

  it('creates the catalog hierarchy and resolves current price without exposing cost by default', async () => {
    const token = await login(fixture.ownerA);
    const category = await authorized('post', '/api/v1/catalog/categories', token).send({
      name: 'Diseño Digital',
    });
    const product = await authorized('post', '/api/v1/catalog/products', token).send({
      name: 'Canva Pro',
      categoryId: category.body.id,
      type: 'DIGITAL_ACCESS',
      fulfillmentMode: 'MANUAL',
      status: 'ACTIVE',
      active: true,
      sku: 'CANVA-PRO',
    });
    const plan = await authorized(
      'post',
      `/api/v1/catalog/products/${product.body.id}/plans`,
      token,
    ).send({
      name: '1 mes',
      code: 'CANVA-1M',
      customerSegment: 'END_CUSTOMER',
      billingPeriodUnit: 'MONTH',
      billingPeriodCount: 1,
    });
    const variant = await authorized(
      'post',
      `/api/v1/catalog/products/${product.body.id}/variants`,
      token,
    ).send({ name: 'HD', code: 'HD', planId: plan.body.id, attributes: { quality: 'HD' } });
    const priceBook = await authorized('post', '/api/v1/catalog/price-books', token).send({
      name: 'Chile público',
      status: 'ACTIVE',
      customerSegment: 'END_CUSTOMER',
      countryCode: 'CL',
      currency: 'USD',
      isDefault: true,
    });
    const entry = await authorized(
      'post',
      `/api/v1/catalog/price-books/${priceBook.body.id}/entries`,
      token,
    ).send({
      productId: product.body.id,
      planId: plan.body.id,
      variantId: variant.body.id,
      salePrice: '19.90',
      costPrice: '5.00',
      minimumPrice: '10.00',
    });
    const resolved = await authorized(
      'get',
      `/api/v1/catalog/pricing/resolve?productId=${product.body.id}&planId=${plan.body.id}&variantId=${variant.body.id}&customerSegment=END_CUSTOMER&countryCode=CL&currency=USD`,
      token,
    );
    const resolvedWithCost = await authorized(
      'get',
      `/api/v1/catalog/pricing/resolve?productId=${product.body.id}&planId=${plan.body.id}&variantId=${variant.body.id}&customerSegment=END_CUSTOMER&countryCode=CL&currency=USD&includeCosts=true`,
      token,
    );

    expect(category.status).toBe(201);
    expect(product.status).toBe(201);
    expect(plan.status).toBe(201);
    expect(variant.status).toBe(201);
    expect(priceBook.status).toBe(201);
    expect(entry.status).toBe(201);
    expect(resolved.status).toBe(200);
    expect(resolved.body.price.salePrice).toBe('19.90');
    expect(resolved.body.price.costPrice).toBeUndefined();
    expect(resolvedWithCost.body.price.costPrice).toBe('5.00');
    expect(await prisma.priceHistory.count({ where: { priceBookEntryId: entry.body.id } })).toBe(1);
  });

  it('protects duplicate active combinations, validates DTOs and isolates tenants', async () => {
    const tokenA = await login(fixture.ownerA);
    const tokenB = await login(fixture.ownerB);
    const category = await authorized('post', '/api/v1/catalog/categories', tokenA).send({
      name: 'TV',
    });
    const product = await authorized('post', '/api/v1/catalog/products', tokenA).send({
      name: 'Televisión',
      categoryId: category.body.id,
      type: 'SERVICE',
      fulfillmentMode: 'MANUAL',
      status: 'ACTIVE',
      active: true,
    });
    const book = await authorized('post', '/api/v1/catalog/price-books', tokenA).send({
      name: 'Base',
      status: 'ACTIVE',
      customerSegment: 'ANY',
      currency: 'USD',
    });
    const payload = { productId: product.body.id, salePrice: '10.00' };
    const entries = await Promise.all([
      authorized('post', `/api/v1/catalog/price-books/${book.body.id}/entries`, tokenA).send(
        payload,
      ),
      authorized('post', `/api/v1/catalog/price-books/${book.body.id}/entries`, tokenA).send(
        payload,
      ),
    ]);
    const foreign = await authorized('get', `/api/v1/catalog/products/${fixture.productB}`, tokenA);
    const unknownField = await authorized('post', '/api/v1/catalog/products', tokenA).send({
      name: 'Invalid',
      type: 'SERVICE',
      fulfillmentMode: 'MANUAL',
      organizationId: fixture.ownerB.organizationId,
    });
    const offers = await authorized(
      'get',
      '/api/v1/catalog/offers?customerSegment=ANY&currency=USD',
      tokenB,
    );

    expect(entries.filter((response) => response.status === 201)).toHaveLength(1);
    expect(entries.filter((response) => response.status === 409)).toHaveLength(1);
    expect(foreign.status).toBe(404);
    expect(unknownField.status).toBe(400);
    expect(offers.status).toBe(200);
    expect(JSON.stringify(offers.body)).not.toContain(fixture.ownerA.organizationId);
  });

  it('records append-only price history after a price change', async () => {
    const token = await login(fixture.ownerA);
    const product = await authorized('post', '/api/v1/catalog/products', token).send({
      name: 'CapCut',
      type: 'DIGITAL_ACCESS',
      fulfillmentMode: 'DOWNLOAD',
      status: 'ACTIVE',
      active: true,
    });
    const book = await authorized('post', '/api/v1/catalog/price-books', token).send({
      name: 'Default',
      status: 'ACTIVE',
      customerSegment: 'ANY',
      currency: 'USD',
    });
    const entry = await authorized(
      'post',
      `/api/v1/catalog/price-books/${book.body.id}/entries`,
      token,
    ).send({ productId: product.body.id, salePrice: '12.00' });
    const updated = await authorized(
      'patch',
      `/api/v1/catalog/price-books/${book.body.id}/entries/${entry.body.id}`,
      token,
    ).send({ salePrice: '15.00', reason: 'Actualización anual' });
    const history = await authorized(
      'get',
      `/api/v1/catalog/price-books/${book.body.id}/entries/${entry.body.id}/history`,
      token,
    );
    expect(updated.status).toBe(200);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(2);
    expect(history.body[0].reason).toBe('Actualización anual');
  });
});

async function createFixture(database: PrismaClient): Promise<Fixture> {
  const keys = [
    'catalog.read',
    'catalog.create',
    'catalog.update',
    'catalog.delete',
    'catalog.prices.read',
    'catalog.prices.manage',
    'catalog.costs.read',
  ] as const;
  const permissions = await Promise.all(
    keys.map((key) => database.permission.create({ data: { key, name: key } })),
  );
  const organizationA = await database.organization.create({
    data: { name: 'Catalog A', slug: `catalog-a-${Date.now()}` },
  });
  const organizationB = await database.organization.create({
    data: { name: 'Catalog B', slug: `catalog-b-${Date.now()}` },
  });
  const roleA = await database.role.create({
    data: {
      organizationId: organizationA.id,
      name: 'Owner',
      permissions: { connect: permissions.map((permission) => ({ id: permission.id })) },
    },
  });
  const roleB = await database.role.create({
    data: {
      organizationId: organizationB.id,
      name: 'Owner',
      permissions: { connect: permissions.map((permission) => ({ id: permission.id })) },
    },
  });
  const hash = await hashPassword(PASSWORD);
  const ownerA = await database.user.create({
    data: {
      organizationId: organizationA.id,
      roleId: roleA.id,
      email: 'catalog-owner-a@example.com',
      firstName: 'Owner',
      lastName: 'A',
      passwordHash: hash,
      status: UserStatus.ACTIVE,
    },
  });
  const ownerB = await database.user.create({
    data: {
      organizationId: organizationB.id,
      roleId: roleB.id,
      email: 'catalog-owner-b@example.com',
      firstName: 'Owner',
      lastName: 'B',
      passwordHash: hash,
      status: UserStatus.ACTIVE,
    },
  });
  const productB = await database.product.create({
    data: {
      organizationId: organizationB.id,
      name: 'Foreign Product',
      slug: 'foreign-product',
      type: 'SERVICE',
      fulfillmentMode: 'MANUAL',
      status: 'ACTIVE',
      active: true,
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
    productB: productB.id,
  };
}
