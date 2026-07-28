import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerSegment,
  PriceBookStatus,
  Prisma,
  PrismaClient,
  ProductStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { hashPassword } from '../src/modules/auth/auth.crypto';
import { resetDatabase } from './test-database';

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

type PriceBookOverrides = Partial<{
  status: PriceBookStatus;
  customerSegment: CustomerSegment;
  countryCode: string | null;
  currency: string;
  validFrom: Date | null;
  validUntil: Date | null;
  createdAt: Date;
  isDefault: boolean;
  priority: number;
}>;

type PriceEntryOverrides = Partial<{
  planId: string | null;
  variantId: string | null;
  salePrice: string;
  costPrice: string | null;
  minimumPrice: string | null;
  active: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
}>;

type ResolveOptions = {
  planId?: string;
  variantId?: string;
  customerSegment?: CustomerSegment;
  countryCode?: string;
  currency?: string;
  at?: Date;
  includeCosts?: boolean;
};

function requireIsolatedDatabase(): void {
  if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test'))
    throw new Error('Las pruebas de catálogo requieren DATABASE_URL con schema=auth_test.');
}

describe('Catalog and pricing HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let fixture: Fixture;
  let loginSequence = 0;

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
    loginSequence += 1;
    const response = await api
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', `catalog-test-${loginSequence}`)
      .send({ email: user.email, password: user.password });
    expect(response.status).toBe(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  function authorized(method: 'get' | 'post' | 'patch', path: string, token: string): request.Test {
    return api[method](path).set('Authorization', `Bearer ${token}`);
  }

  async function resolvePrice(token: string, productId: string, options: ResolveOptions = {}) {
    const params = new URLSearchParams({
      productId,
      customerSegment: options.customerSegment ?? CustomerSegment.END_CUSTOMER,
      currency: options.currency ?? 'USD',
    });
    if (options.planId) params.set('planId', options.planId);
    if (options.variantId) params.set('variantId', options.variantId);
    if (options.countryCode) params.set('countryCode', options.countryCode);
    if (options.at) params.set('at', options.at.toISOString());
    if (options.includeCosts) params.set('includeCosts', 'true');
    return authorized('get', `/api/v1/catalog/pricing/resolve?${params.toString()}`, token);
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
    const invalidPriority = await authorized('post', '/api/v1/catalog/price-books', tokenA).send({
      name: 'Invalid priority',
      status: 'ACTIVE',
      customerSegment: 'ANY',
      currency: 'USD',
      priority: 10001,
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
    expect(invalidPriority.status).toBe(400);
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

    const unchangedMoney = await authorized(
      'patch',
      `/api/v1/catalog/price-books/${book.body.id}/entries/${entry.body.id}`,
      token,
    ).send({ taxIncluded: true });
    expect(unchangedMoney.status).toBe(200);
    expect(await prisma.priceHistory.count({ where: { priceBookEntryId: entry.body.id } })).toBe(2);

    const changedCost = await authorized(
      'patch',
      `/api/v1/catalog/price-books/${book.body.id}/entries/${entry.body.id}`,
      token,
    ).send({ costPrice: '4.00', minimumPrice: '8.00' });
    expect(changedCost.status).toBe(200);
    expect(await prisma.priceHistory.count({ where: { priceBookEntryId: entry.body.id } })).toBe(3);

    const foreignHistory = await authorized(
      'get',
      `/api/v1/catalog/price-books/${book.body.id}/entries/${entry.body.id}/history`,
      await login(fixture.ownerB),
    );
    expect(foreignHistory.status).toBe(404);
  });

  it('resolves segment and country before default and priority', async () => {
    const token = await login(fixture.ownerA);
    const product = await createProduct(prisma, fixture.ownerA.organizationId, 'Ranking exacto');
    const exact = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Exacto', {
      customerSegment: CustomerSegment.END_CUSTOMER,
      countryCode: 'CL',
      priority: -10000,
    });
    const any = await createPriceBook(prisma, fixture.ownerA.organizationId, 'ANY CL', {
      customerSegment: CustomerSegment.ANY,
      countryCode: 'CL',
      isDefault: true,
      priority: 10000,
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, exact.id, product.id, {
      salePrice: '10.00',
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, any.id, product.id, {
      salePrice: '20.00',
    });

    const resolved = await resolvePrice(token, product.id, { countryCode: 'CL' });

    expect(resolved.status).toBe(200);
    expect(resolved.body.price.salePrice).toBe('10.00');
    expect(resolved.body.explanation.segmentMatch).toBe('EXACT');
    expect(resolved.body.explanation.countryMatch).toBe('EXACT');
  });

  it('resolves default before priority and priority before createdAt', async () => {
    const token = await login(fixture.ownerA);
    const product = await createProduct(
      prisma,
      fixture.ownerA.organizationId,
      'Ranking secundario',
    );
    const defaultBook = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Default', {
      isDefault: true,
      priority: -10000,
    });
    const nonDefaultBook = await createPriceBook(
      prisma,
      fixture.ownerA.organizationId,
      'No default',
      { priority: 10000 },
    );
    await createPriceEntry(prisma, fixture.ownerA.organizationId, defaultBook.id, product.id, {
      salePrice: '30.00',
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, nonDefaultBook.id, product.id, {
      salePrice: '40.00',
    });

    const resolved = await resolvePrice(token, product.id);

    expect(resolved.status).toBe(200);
    expect(resolved.body.price.salePrice).toBe('30.00');

    const secondProduct = await createProduct(
      prisma,
      fixture.ownerA.organizationId,
      'Ranking prioridad',
    );
    const low = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Low', {
      priority: -1,
    });
    const high = await createPriceBook(prisma, fixture.ownerA.organizationId, 'High', {
      priority: 1,
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, low.id, secondProduct.id, {
      salePrice: '50.00',
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, high.id, secondProduct.id, {
      salePrice: '60.00',
    });
    const priorityResolved = await resolvePrice(token, secondProduct.id);
    expect(priorityResolved.body.price.salePrice).toBe('60.00');
  });

  it('uses createdAt and id as deterministic final tie breakers', async () => {
    const token = await login(fixture.ownerA);
    const product = await createProduct(prisma, fixture.ownerA.organizationId, 'Ranking fecha');
    const older = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Older');
    const newer = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Newer');
    await prisma.priceBook.update({
      where: { organizationId_id: { organizationId: fixture.ownerA.organizationId, id: older.id } },
      data: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.priceBook.update({
      where: { organizationId_id: { organizationId: fixture.ownerA.organizationId, id: newer.id } },
      data: { createdAt: new Date('2026-02-01T00:00:00.000Z') },
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, older.id, product.id, {
      salePrice: '70.00',
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, newer.id, product.id, {
      salePrice: '80.00',
    });

    const resolved = await resolvePrice(token, product.id);

    expect(resolved.status).toBe(200);
    expect(resolved.body.price.salePrice).toBe('80.00');
  });

  it('applies inclusive validFrom and exclusive validUntil to price books and entries', async () => {
    const token = await login(fixture.ownerA);
    const at = new Date('2026-05-01T00:00:00.000Z');
    const product = await createProduct(prisma, fixture.ownerA.organizationId, 'Vigencia');
    const expiredBook = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Expired', {
      validUntil: at,
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, expiredBook.id, product.id, {
      salePrice: '90.00',
    });
    const expiredBookResponse = await resolvePrice(token, product.id, { at });
    expect(expiredBookResponse.status).toBe(404);

    const currentBook = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Current', {
      validFrom: at,
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, currentBook.id, product.id, {
      salePrice: '91.00',
      validFrom: at,
      validUntil: new Date('2026-06-01T00:00:00.000Z'),
    });
    const currentResponse = await resolvePrice(token, product.id, { at });
    expect(currentResponse.status).toBe(200);
    expect(currentResponse.body.price.salePrice).toBe('91.00');

    const atEndResponse = await resolvePrice(token, product.id, {
      at: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(atEndResponse.status).toBe(404);
  });

  it.each([ProductStatus.DRAFT, ProductStatus.INACTIVE, ProductStatus.DISCONTINUED])(
    'ignores product status %s during resolution',
    async (status) => {
      const token = await login(fixture.ownerA);
      const product = await createProduct(
        prisma,
        fixture.ownerA.organizationId,
        `Product ${status}`,
        status,
      );
      const book = await createPriceBook(prisma, fixture.ownerA.organizationId, `Book ${status}`);
      await createPriceEntry(prisma, fixture.ownerA.organizationId, book.id, product.id);

      const resolved = await resolvePrice(token, product.id);

      expect(resolved.status).toBe(404);
    },
  );

  it('rejects inactive or archived plans and variants and requires a variant plan when assigned', async () => {
    const token = await login(fixture.ownerA);
    const product = await createProduct(prisma, fixture.ownerA.organizationId, 'Relaciones');
    const book = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Relaciones book');
    const inactivePlan = await createPlan(prisma, fixture.ownerA.organizationId, product.id, false);
    await createPriceEntry(prisma, fixture.ownerA.organizationId, book.id, product.id, {
      planId: inactivePlan.id,
    });
    expect((await resolvePrice(token, product.id, { planId: inactivePlan.id })).status).toBe(404);

    const activePlan = await createPlan(prisma, fixture.ownerA.organizationId, product.id, true);
    const archivedPlan = await createPlan(prisma, fixture.ownerA.organizationId, product.id, true);
    await prisma.productPlan.update({
      where: {
        organizationId_productId_id: {
          organizationId: fixture.ownerA.organizationId,
          productId: product.id,
          id: archivedPlan.id,
        },
      },
      data: { deletedAt: new Date() },
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, book.id, product.id, {
      planId: archivedPlan.id,
    });
    expect((await resolvePrice(token, product.id, { planId: archivedPlan.id })).status).toBe(404);

    const inactiveVariant = await createVariant(
      prisma,
      fixture.ownerA.organizationId,
      product.id,
      activePlan.id,
      false,
    );
    await createPriceEntry(prisma, fixture.ownerA.organizationId, book.id, product.id, {
      planId: activePlan.id,
      variantId: inactiveVariant.id,
      salePrice: '12.00',
    });
    expect(
      (
        await resolvePrice(token, product.id, {
          planId: activePlan.id,
          variantId: inactiveVariant.id,
        })
      ).status,
    ).toBe(404);

    const activeVariant = await createVariant(
      prisma,
      fixture.ownerA.organizationId,
      product.id,
      activePlan.id,
      true,
    );
    await createPriceEntry(prisma, fixture.ownerA.organizationId, book.id, product.id, {
      planId: activePlan.id,
      variantId: activeVariant.id,
      salePrice: '13.00',
    });
    expect((await resolvePrice(token, product.id, { variantId: activeVariant.id })).status).toBe(
      404,
    );
  });

  it('rejects plan and variant relations from another product or tenant', async () => {
    const tokenA = await login(fixture.ownerA);
    const productA = await createProduct(prisma, fixture.ownerA.organizationId, 'Product A');
    const productB = await createProduct(prisma, fixture.ownerA.organizationId, 'Product B');
    const planB = await createPlan(prisma, fixture.ownerA.organizationId, productB.id, true);
    const variantB = await createVariant(
      prisma,
      fixture.ownerA.organizationId,
      productB.id,
      null,
      true,
    );
    expect((await resolvePrice(tokenA, productA.id, { planId: planB.id })).status).toBe(404);
    expect((await resolvePrice(tokenA, productA.id, { variantId: variantB.id })).status).toBe(404);

    const foreignProduct = await createProduct(
      prisma,
      fixture.ownerB.organizationId,
      'Foreign relation',
    );
    const foreignPlan = await createPlan(
      prisma,
      fixture.ownerB.organizationId,
      foreignProduct.id,
      true,
    );
    expect((await resolvePrice(tokenA, productA.id, { planId: foreignPlan.id })).status).toBe(404);
  });

  it('protects costs consistently for Owner, Admin, Sales and Viewer', async () => {
    const ownerToken = await login(fixture.ownerA);
    const product = await createProduct(prisma, fixture.ownerA.organizationId, 'Costos');
    const book = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Costos book');
    await createPriceEntry(prisma, fixture.ownerA.organizationId, book.id, product.id, {
      costPrice: '2.00',
      minimumPrice: '5.00',
      salePrice: '10.00',
    });
    const admin = await createRoleUser(prisma, fixture.ownerA.organizationId, 'Admin', [
      'catalog.prices.read',
      'catalog.costs.read',
    ]);
    const sales = await createRoleUser(prisma, fixture.ownerA.organizationId, 'Sales', [
      'catalog.prices.read',
    ]);
    const viewer = await createRoleUser(prisma, fixture.ownerA.organizationId, 'Viewer', [
      'catalog.prices.read',
    ]);

    const ownerResponse = await resolvePrice(ownerToken, product.id, { includeCosts: true });
    const adminResponse = await resolvePrice(await login(admin), product.id, {
      includeCosts: true,
    });
    const salesResponse = await resolvePrice(await login(sales), product.id, {
      includeCosts: true,
    });
    const viewerResponse = await resolvePrice(await login(viewer), product.id, {
      includeCosts: true,
    });
    const ownerOffers = await authorized(
      'get',
      '/api/v1/catalog/offers?customerSegment=END_CUSTOMER&currency=USD&includeCosts=true',
      ownerToken,
    );
    const salesOffers = await authorized(
      'get',
      '/api/v1/catalog/offers?customerSegment=END_CUSTOMER&currency=USD&includeCosts=true',
      await login(sales),
    );

    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.body.price.costPrice).toBe('2.00');
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.price.minimumPrice).toBe('5.00');
    expect(salesResponse.status).toBe(403);
    expect(viewerResponse.status).toBe(403);
    expect(ownerOffers.status).toBe(200);
    expect(ownerOffers.body.data[0].price.price.costPrice).toBe('2.00');
    expect(salesOffers.status).toBe(403);
  });

  it('does not create two defaults during concurrent creation', async () => {
    const token = await login(fixture.ownerA);
    const responses = await Promise.all([
      authorized('post', '/api/v1/catalog/price-books', token).send({
        name: 'Concurrent A',
        status: 'ACTIVE',
        customerSegment: 'ANY',
        currency: 'USD',
        isDefault: true,
      }),
      authorized('post', '/api/v1/catalog/price-books', token).send({
        name: 'Concurrent B',
        status: 'ACTIVE',
        customerSegment: 'ANY',
        currency: 'USD',
        isDefault: true,
      }),
    ]);
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(
      await prisma.priceBook.count({
        where: {
          organizationId: fixture.ownerA.organizationId,
          isDefault: true,
          status: PriceBookStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
      }),
    ).toBe(1);
  });

  it('allows different valid periods but rejects concurrent exact duplicates', async () => {
    const token = await login(fixture.ownerA);
    const product = await createProduct(prisma, fixture.ownerA.organizationId, 'Period duplicates');
    const book = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Period book');
    const payload = { productId: product.id, salePrice: '15.00' };
    const responses = await Promise.all([
      authorized('post', `/api/v1/catalog/price-books/${book.id}/entries`, token).send(payload),
      authorized('post', `/api/v1/catalog/price-books/${book.id}/entries`, token).send(payload),
    ]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);

    const nextPeriod = await authorized(
      'post',
      `/api/v1/catalog/price-books/${book.id}/entries`,
      token,
    ).send({
      ...payload,
      validFrom: '2027-01-01T00:00:00.000Z',
      validUntil: '2027-02-01T00:00:00.000Z',
    });
    expect(nextPeriod.status).toBe(201);
  });

  it('keeps offers coherent with pricing validity and active relations', async () => {
    const token = await login(fixture.ownerA);
    const product = await createProduct(prisma, fixture.ownerA.organizationId, 'Offer active');
    const inactiveProduct = await createProduct(
      prisma,
      fixture.ownerA.organizationId,
      'Offer inactive',
      ProductStatus.INACTIVE,
    );
    const book = await createPriceBook(prisma, fixture.ownerA.organizationId, 'Offer book');
    await createPriceEntry(prisma, fixture.ownerA.organizationId, book.id, product.id, {
      salePrice: '20.00',
      validUntil: new Date('2020-01-01T00:00:00.000Z'),
    });
    await createPriceEntry(prisma, fixture.ownerA.organizationId, book.id, inactiveProduct.id, {
      salePrice: '30.00',
    });
    const offers = await authorized(
      'get',
      '/api/v1/catalog/offers?customerSegment=END_CUSTOMER&currency=USD',
      token,
    );
    expect(offers.status).toBe(200);
    expect(offers.body.data).toHaveLength(0);
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

async function createProduct(
  database: PrismaClient,
  organizationId: string,
  name: string,
  status: ProductStatus = ProductStatus.ACTIVE,
  active = true,
) {
  const suffix = randomUUID().slice(0, 8);
  return database.product.create({
    data: {
      organizationId,
      name: `${name} ${suffix}`,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
      type: 'SERVICE',
      fulfillmentMode: 'MANUAL',
      status,
      active,
    },
  });
}

async function createPriceBook(
  database: PrismaClient,
  organizationId: string,
  name: string,
  overrides: PriceBookOverrides = {},
) {
  return database.priceBook.create({
    data: {
      organizationId,
      name,
      status: PriceBookStatus.ACTIVE,
      customerSegment: CustomerSegment.ANY,
      countryCode: null,
      currency: 'USD',
      validFrom: null,
      validUntil: null,
      isDefault: false,
      priority: 0,
      ...overrides,
    },
  });
}

async function createPlan(
  database: PrismaClient,
  organizationId: string,
  productId: string,
  active: boolean,
) {
  const suffix = randomUUID().slice(0, 8);
  return database.productPlan.create({
    data: {
      organizationId,
      productId,
      name: `Plan ${suffix}`,
      code: `PLAN-${suffix.toUpperCase()}`,
      customerSegment: CustomerSegment.END_CUSTOMER,
      billingPeriodUnit: 'MONTH',
      billingPeriodCount: 1,
      order: 1,
      active,
    },
  });
}

async function createVariant(
  database: PrismaClient,
  organizationId: string,
  productId: string,
  planId: string | null,
  active: boolean,
) {
  const suffix = randomUUID().slice(0, 8);
  return database.productVariant.create({
    data: {
      organizationId,
      productId,
      planId,
      name: `Variant ${suffix}`,
      code: `VARIANT-${suffix.toUpperCase()}`,
      attributes: { source: 'catalog-e2e' },
      order: 1,
      active,
    },
  });
}

async function createPriceEntry(
  database: PrismaClient,
  organizationId: string,
  priceBookId: string,
  productId: string,
  overrides: PriceEntryOverrides = {},
) {
  return database.priceBookEntry.create({
    data: {
      organizationId,
      priceBookId,
      productId,
      planId: overrides.planId ?? null,
      variantId: overrides.variantId ?? null,
      salePrice: new Prisma.Decimal(overrides.salePrice ?? '10.00'),
      costPrice:
        overrides.costPrice === undefined || overrides.costPrice === null
          ? (overrides.costPrice ?? null)
          : new Prisma.Decimal(overrides.costPrice),
      minimumPrice:
        overrides.minimumPrice === undefined || overrides.minimumPrice === null
          ? (overrides.minimumPrice ?? null)
          : new Prisma.Decimal(overrides.minimumPrice),
      active: overrides.active ?? true,
      validFrom: overrides.validFrom ?? null,
      validUntil: overrides.validUntil ?? null,
    },
  });
}

async function createRoleUser(
  database: PrismaClient,
  organizationId: string,
  roleName: string,
  permissionKeys: readonly string[],
): Promise<FixtureUser> {
  const permissions = await database.permission.findMany({
    where: { key: { in: [...permissionKeys] } },
  });
  const role = await database.role.create({
    data: {
      organizationId,
      name: roleName,
      permissions: { connect: permissions.map((permission) => ({ id: permission.id })) },
    },
  });
  const email = `catalog-${roleName.toLowerCase()}-${randomUUID()}@example.com`;
  const user = await database.user.create({
    data: {
      organizationId,
      roleId: role.id,
      email,
      firstName: roleName,
      lastName: 'Catalog',
      passwordHash: await hashPassword(PASSWORD),
      status: UserStatus.ACTIVE,
    },
  });
  return { id: user.id, email, password: PASSWORD, organizationId };
}
