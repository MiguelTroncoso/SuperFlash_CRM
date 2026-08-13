import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { hashPassword } from '../src/modules/auth/auth.crypto';
import { resetDatabase } from './test-database';

const OWNER_PASSWORD = 'OwnerPassword1!';
const SALES_PASSWORD = 'SalesPassword1!';
const VIEWER_PASSWORD = 'ViewerPassword1!';

interface UserFixture {
  id: string;
  email: string;
  password: string;
  organizationId: string;
  roleId: string;
}

interface Fixture {
  organizationA: { id: string; slug: string };
  organizationB: { id: string; slug: string };
  ownerA: UserFixture;
  salesA: UserFixture;
  viewerA: UserFixture;
  ownerB: UserFixture;
  campaignA: string;
  campaignB: string;
  productA: string;
  productB: string;
  tagA: string;
}

interface ContactResponse {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  activeOpportunity: { id: string } | null;
  warnings?: Array<{ code: string; existingContactId: string }>;
  tags?: Array<{ id: string; name: string }>;
  organizationId?: string;
}

interface AuthResponse {
  accessToken: string;
}

function requireIsolatedDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.includes('schema=auth_test')) {
    throw new Error('Las pruebas de contactos requieren DATABASE_URL con schema=auth_test.');
  }
}

describe('Contacts and lead intake HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let fixture: Fixture;
  let ipSequence = 100;

  beforeAll(async () => {
    requireIsolatedDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const configService = moduleRef.get(ConfigService);
    const configuration = configService.getOrThrow<AppConfiguration>('app');
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

  function nextIp(): string {
    ipSequence += 1;
    return `10.20.0.${ipSequence}`;
  }

  async function login(user: UserFixture): Promise<string> {
    const response = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: user.email, password: user.password });
    expect(response.status).toBe(200);
    return (response.body as AuthResponse).accessToken;
  }

  function authorized(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    token: string,
  ): request.Test {
    return api[method](path)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp());
  }

  function contact(response: { body: unknown }): ContactResponse {
    return response.body as ContactResponse;
  }

  it('crea leads solo con teléfono, solo con email y crea oportunidad por defecto', async () => {
    const token = await login(fixture.ownerA);
    const phoneLead = await authorized('post', '/api/v1/contacts', token).send({
      phone: '9 1234 5678',
      country: 'CL',
    });
    const emailLead = await authorized('post', '/api/v1/contacts', token).send({
      email: 'email-only@example.com',
    });

    expect(phoneLead.status).toBe(201);
    expect(contact(phoneLead).phoneNormalized).toBe('+56912345678');
    expect(contact(phoneLead).activeOpportunity).not.toBeNull();
    expect(emailLead.status).toBe(201);
    expect(contact(emailLead).activeOpportunity).not.toBeNull();
    const initialHistory = await prisma.opportunityStageHistory.findFirst({
      where: { opportunityId: contact(phoneLead).activeOpportunity?.id },
    });
    expect(initialHistory?.fromStageId).toBeNull();
    expect(initialHistory?.reason).toBe('Oportunidad creada');
    expect(contact(phoneLead).organizationId).toBeUndefined();
  });

  it('rechaza identidad ausente y teléfonos inválidos', async () => {
    const token = await login(fixture.ownerA);
    const noIdentity = await authorized('post', '/api/v1/contacts', token).send({
      notes: 'sin datos',
    });
    const invalidPhone = await authorized('post', '/api/v1/contacts', token).send({
      phone: '1234',
      country: 'CL',
    });

    expect(noIdentity.status).toBe(400);
    expect(noIdentity.body.code).toBe('CONTACT_MINIMUM_IDENTITY_REQUIRED');
    expect(invalidPhone.status).toBe(400);
    expect(invalidPhone.body.code).toBe('CONTACT_INVALID_PHONE');
  });

  it('protege teléfonos duplicados, archivados y carreras concurrentes', async () => {
    const token = await login(fixture.ownerA);
    const first = await authorized('post', '/api/v1/contacts', token).send({
      phone: '+56911112222',
    });
    const duplicate = await authorized('post', '/api/v1/contacts', token).send({
      phone: '+56 9 1111 2222',
    });
    const archived = await authorized(
      'post',
      `/api/v1/contacts/${contact(first).id}/archive`,
      token,
    ).send({ reason: 'No interesado' });
    const duplicateArchived = await authorized('post', '/api/v1/contacts', token).send({
      phone: '+56911112222',
    });
    const concurrentPhone = '+56933334444';
    const concurrent = await Promise.all([
      authorized('post', '/api/v1/contacts', token).send({ phone: concurrentPhone }),
      authorized('post', '/api/v1/contacts', token).send({ phone: concurrentPhone }),
    ]);

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CONTACT_PHONE_ALREADY_EXISTS');
    expect(archived.status).toBe(201);
    expect(duplicateArchived.status).toBe(409);
    expect(duplicateArchived.body.code).toBe('CONTACT_PHONE_ARCHIVED');
    expect(concurrent.filter((response) => response.status === 201)).toHaveLength(1);
    expect(concurrent.filter((response) => response.status === 409)).toHaveLength(1);
    expect(await prisma.contact.count({ where: { phoneNormalized: concurrentPhone } })).toBe(1);
  });

  it('permite el mismo teléfono en otro tenant y advierte duplicado de email', async () => {
    const ownerA = await login(fixture.ownerA);
    const ownerB = await login(fixture.ownerB);
    const a = await authorized('post', '/api/v1/contacts', ownerA).send({ phone: '+56955556666' });
    const b = await authorized('post', '/api/v1/contacts', ownerB).send({ phone: '+56955556666' });
    const firstEmail = await authorized('post', '/api/v1/contacts', ownerA).send({
      email: 'same@example.com',
      phone: '+56977778888',
    });
    const warning = await authorized('post', '/api/v1/contacts', ownerA).send({
      email: ' SAME@example.com ',
      phone: '+56999990000',
    });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(firstEmail.status).toBe(201);
    expect(warning.status).toBe(201);
    expect(contact(warning).warnings?.[0]?.code).toBe('CONTACT_EMAIL_POSSIBLE_DUPLICATE');
  });

  it('crea o no crea oportunidad y valida campaña/producto por tenant', async () => {
    const token = await login(fixture.ownerA);
    const withoutOpportunity = await authorized('post', '/api/v1/contacts', token).send({
      email: 'without-opportunity@example.com',
      createOpportunity: false,
    });
    const withRelations = await authorized('post', '/api/v1/contacts', token).send({
      email: 'with-relations@example.com',
      campaignId: fixture.campaignA,
      productId: fixture.productA,
    });
    const foreignCampaign = await authorized('post', '/api/v1/contacts', token).send({
      email: 'foreign-campaign@example.com',
      campaignId: fixture.campaignB,
    });
    const foreignProduct = await authorized('post', '/api/v1/contacts', token).send({
      email: 'foreign-product@example.com',
      productId: fixture.productB,
    });

    expect(withoutOpportunity.status).toBe(201);
    expect(contact(withoutOpportunity).activeOpportunity).toBeNull();
    expect(withRelations.status).toBe(201);
    expect(contact(withRelations).activeOpportunity).not.toBeNull();
    expect(foreignCampaign.status).toBe(404);
    expect(foreignCampaign.body.code).toBe('CONTACT_CAMPAIGN_NOT_FOUND');
    expect(foreignProduct.status).toBe(404);
    expect(foreignProduct.body.code).toBe('CONTACT_PRODUCT_NOT_FOUND');
  });

  it('lista con paginación, filtros, tags y búsquedas por nombre y teléfono', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/contacts', token).send({
      firstName: 'María',
      lastName: 'Pérez',
      phone: '+56988889999',
      country: 'CL',
      source: 'META_ADS',
      tagIds: [fixture.tagA],
    });
    await authorized('post', '/api/v1/contacts', token).send({
      firstName: 'Carlos',
      country: 'CL',
    });
    const byName = await authorized(
      'get',
      '/api/v1/contacts?search=mar%C3%ADa&page=1&limit=1',
      token,
    );
    const byPhone = await authorized('get', '/api/v1/contacts?search=%2B56988889999', token);
    const byCountry = await authorized(
      'get',
      '/api/v1/contacts?country=cl&source=META_ADS&tagId=' + fixture.tagA,
      token,
    );

    expect(created.status).toBe(201);
    expect(byName.status).toBe(200);
    expect((byName.body as { pagination: { total: number; limit: number } }).pagination.limit).toBe(
      1,
    );
    expect((byName.body as { data: ContactResponse[] }).data[0]?.firstName).toBe('María');
    expect((byPhone.body as { data: ContactResponse[] }).data[0]?.phoneNormalized).toBe(
      '+56988889999',
    );
    expect((byCountry.body as { pagination: { total: number } }).pagination.total).toBe(1);
  });

  it('obtiene detalle, oculta otro tenant y actualiza parcialmente', async () => {
    const ownerA = await login(fixture.ownerA);
    const ownerB = await login(fixture.ownerB);
    const created = await authorized('post', '/api/v1/contacts', ownerA).send({
      firstName: 'Detalle',
      phone: '+56912340000',
    });
    const foreign = await authorized('post', '/api/v1/contacts', ownerB).send({
      email: 'foreign-detail@example.com',
    });
    const detail = await authorized('get', `/api/v1/contacts/${contact(created).id}`, ownerA);
    const hidden = await authorized('get', `/api/v1/contacts/${contact(foreign).id}`, ownerA);
    const updated = await authorized(
      'patch',
      `/api/v1/contacts/${contact(created).id}`,
      ownerA,
    ).send({ firstName: 'Detalle actualizado', phone: '+56912340001' });
    const duplicateTarget = await authorized('post', '/api/v1/contacts', ownerA).send({
      email: 'duplicate-target@example.com',
    });
    const duplicate = await authorized(
      'patch',
      `/api/v1/contacts/${contact(duplicateTarget).id}`,
      ownerA,
    ).send({ phone: '+56912340001' });

    expect(detail.status).toBe(200);
    expect(
      (detail.body as { recentActivities: unknown[] }).recentActivities.length,
    ).toBeLessThanOrEqual(20);
    expect(hidden.status).toBe(404);
    expect(updated.status).toBe(200);
    expect(contact(updated).phoneNormalized).toBe('+56912340001');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CONTACT_PHONE_ALREADY_EXISTS');
  });

  it('aplica asignación, aislamiento y política de vendedor', async () => {
    const ownerToken = await login(fixture.ownerA);
    const salesToken = await login(fixture.salesA);
    const created = await authorized('post', '/api/v1/contacts', ownerToken).send({
      email: 'assignment@example.com',
    });
    const assigned = await authorized(
      'patch',
      `/api/v1/contacts/${contact(created).id}/assignee`,
      ownerToken,
    ).send({ assignedUserId: fixture.salesA.id });
    const salesCanUpdate = await authorized(
      'patch',
      `/api/v1/contacts/${contact(created).id}`,
      salesToken,
    ).send({ firstName: 'Vendedor' });
    const ownerCanUpdate = await authorized(
      'patch',
      `/api/v1/contacts/${contact(created).id}`,
      ownerToken,
    ).send({ lastName: 'Owner' });
    const invalidAssignee = await authorized(
      'patch',
      `/api/v1/contacts/${contact(created).id}/assignee`,
      ownerToken,
    ).send({ assignedUserId: fixture.ownerB.id });

    expect(assigned.status).toBe(200);
    expect(salesCanUpdate.status).toBe(200);
    expect(ownerCanUpdate.status).toBe(200);
    expect(invalidAssignee.status).toBe(404);
    expect(invalidAssignee.body.code).toBe('CONTACT_ASSIGNEE_NOT_FOUND');
  });

  it('archiva y restaura idempotentemente, y administra tags con soft delete', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/contacts', token).send({
      email: 'archive-tags@example.com',
    });
    const id = contact(created).id;
    const archive = await authorized('post', `/api/v1/contacts/${id}/archive`, token).send({
      reason: 'Pausa',
    });
    const archiveAgain = await authorized('post', `/api/v1/contacts/${id}/archive`, token).send();
    const restore = await authorized('post', `/api/v1/contacts/${id}/restore`, token).send();
    const tag = await authorized('post', '/api/v1/tags', token).send({
      name: '  Prioridad  ',
      color: '#2563eb',
    });
    const duplicateTag = await authorized('post', '/api/v1/tags', token).send({
      name: 'prioridad',
    });
    const add = await authorized(
      'post',
      `/api/v1/contacts/${id}/tags/${tag.body.id}`,
      token,
    ).send();
    const addAgain = await authorized(
      'post',
      `/api/v1/contacts/${id}/tags/${tag.body.id}`,
      token,
    ).send();
    const remove = await authorized(
      'delete',
      `/api/v1/contacts/${id}/tags/${tag.body.id}`,
      token,
    ).send();
    const addRestored = await authorized(
      'post',
      `/api/v1/contacts/${id}/tags/${tag.body.id}`,
      token,
    ).send();
    const tags = await authorized('get', '/api/v1/tags', token);

    expect(archive.status).toBe(201);
    expect(archiveAgain.status).toBe(201);
    expect(restore.status).toBe(201);
    expect(tag.status).toBe(201);
    expect(tag.body.color).toBe('#2563EB');
    expect(duplicateTag.status).toBe(409);
    expect(add.status).toBe(201);
    expect(addAgain.status).toBe(201);
    expect(remove.status).toBe(200);
    expect(addRestored.status).toBe(201);
    expect(tags.status).toBe(200);
    expect((tags.body as Array<{ name: string }>).some((item) => item.name === 'Prioridad')).toBe(
      true,
    );
  });

  it('rechaza permisos faltantes, requiere JWT y registra auditoría sin organizationId', async () => {
    const viewerToken = await login(fixture.viewerA);
    const deniedCreate = await authorized('post', '/api/v1/contacts', viewerToken).send({
      email: 'denied@example.com',
    });
    const deniedLead = await authorized('post', '/api/v1/contacts/leads', viewerToken).send({
      phone: '+56911112222',
      country: 'CL',
    });
    const unauthenticated = await api.get('/api/v1/contacts').set('X-Forwarded-For', nextIp());
    const ownerToken = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/contacts', ownerToken).send({
      email: 'audited@example.com',
    });
    const audits = await prisma.auditLog.findMany({ where: { action: 'CONTACT_CREATED' } });

    expect(deniedCreate.status).toBe(403);
    expect(deniedLead.status).toBe(403);
    expect(unauthenticated.status).toBe(401);
    expect(created.status).toBe(201);
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0])).not.toContain('password');
  });

  it('completa el flujo operativo de lead con estado, interés, seguimiento y trazabilidad', async () => {
    const token = await login(fixture.ownerA);
    const customState = await authorized('post', '/api/v1/pipeline/stages', token).send({
      name: 'ChatGPT / Plus',
      systemKey: 'CUSTOM_CHATGPT_PLUS',
      color: '#64748B',
      category: 'OPEN',
      order: 2,
    });
    const categoryCreate = await authorized('post', '/api/v1/catalog/categories/quick', token).send(
      {
        name: 'ChatGPT',
      },
    );
    const categoryReuse = await authorized('post', '/api/v1/catalog/categories/quick', token).send({
      name: ' chatgpt ',
    });
    const category = await prisma.productCategory.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, name: 'ChatGPT' },
    });
    const productCreate = await authorized('post', '/api/v1/catalog/products/quick', token).send({
      name: 'Plus',
      categoryId: category.id,
      type: 'DIGITAL_ACCESS',
      fulfillmentMode: 'MANUAL',
      currency: 'USD',
      status: 'ACTIVE',
      active: true,
    });
    const product = await prisma.product.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, name: 'Plus' },
    });
    const demoStage = await prisma.pipelineStage.create({
      data: {
        organizationId: fixture.organizationA.id,
        name: 'Demo enviada',
        systemKey: 'DEMO_SENT',
        order: 3,
        color: '#3B82F6',
        category: 'OPEN',
      },
    });
    const waitingStage = await prisma.pipelineStage.create({
      data: {
        organizationId: fixture.organizationA.id,
        name: 'Esperando respuesta',
        systemKey: 'WAITING_CUSTOMER',
        order: 4,
        color: '#F59E0B',
        category: 'OPEN',
      },
    });
    const created = await authorized('post', '/api/v1/contacts/leads', token).send({
      firstName: 'Test Lead',
      phone: '9 1234 5678',
      country: 'CL',
      source: 'MANUAL',
      categoryId: category.id,
      productId: product.id,
      pipelineStageId: demoStage.id,
      note: 'Lead de prueba operativa',
    });
    const second = await authorized('post', '/api/v1/contacts/leads', token).send({
      firstName: 'Segundo Lead',
      phone: '+56999998888',
      country: 'CL',
      source: 'MANUAL',
      categoryId: category.id,
      productId: product.id,
      pipelineStageId: customState.body.id,
    });
    const waiting = await authorized('post', '/api/v1/contacts/leads', token).send({
      firstName: 'Waiting Lead',
      phone: '+56977776666',
      country: 'CL',
      pipelineStageId: waitingStage.id,
    });

    expect(customState.status).toBe(201);
    expect(categoryCreate.status).toBe(201);
    expect(categoryReuse.status).toBe(201);
    expect(categoryReuse.body.id).toBe(categoryCreate.body.id);
    expect(productCreate.status).toBe(201);
    expect(created.status).toBe(201);
    expect(created.body.state).toBe('DEMO_SENT');
    expect(created.body.autoSuggested).toBe(true);
    expect(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        hour12: false,
      }).format(new Date(created.body.nextFollowUpAt)),
    ).toBe('10');
    expect(second.status).toBe(201);
    expect(second.body.state).toBe('CUSTOM_CHATGPT_PLUS');
    expect(waiting.status).toBe(201);
    expect(waiting.body.state).toBe('WAITING_CUSTOMER');
    expect(
      await prisma.productCategory.count({ where: { organizationId: fixture.organizationA.id } }),
    ).toBe(1);
    expect(
      await prisma.product.count({ where: { organizationId: fixture.organizationA.id } }),
    ).toBe(2);

    const contactRecord = await prisma.contact.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, phoneNormalized: '+56912345678' },
    });
    const opportunity = await prisma.opportunity.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, contactId: contactRecord.id },
    });
    const followUp = await prisma.followUp.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, opportunityId: opportunity.id },
    });
    expect(opportunity.categoryId).toBe(category.id);
    expect(opportunity.productId).toBe(product.id);
    expect(followUp.autoSuggested).toBe(true);
    expect(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        hour12: false,
      }).format(followUp.dueAt),
    ).toBe('10');
    expect(
      await prisma.activity.findFirst({
        where: { organizationId: fixture.organizationA.id, opportunityId: opportunity.id },
      }),
    ).not.toBeNull();
    expect(
      await prisma.auditLog.findFirst({
        where: { organizationId: fixture.organizationA.id, action: 'LEAD_CREATED' },
      }),
    ).not.toBeNull();

    const pipeline = await authorized('get', '/api/v1/pipeline', token);
    const pipelineJson = JSON.stringify(pipeline.body);
    expect(pipelineJson).toContain(opportunity.id);
    const myDay = await authorized('get', '/api/v1/my-day', token);
    expect(myDay.status).toBe(200);
    const customer360 = await authorized('get', `/api/v1/customer-360/${contactRecord.id}`, token);
    const categories = await authorized('get', '/api/v1/catalog/categories', token);
    const products = await authorized('get', '/api/v1/catalog/products?limit=100', token);
    expect(customer360.status).toBe(200);
    expect(JSON.stringify(customer360.body)).toContain(category.id);
    expect(categories.status).toBe(200);
    expect(JSON.stringify(categories.body)).toContain('ChatGPT');
    expect(products.status).toBe(200);
    expect(JSON.stringify(products.body)).toContain('Plus');

    const waitingContact = await prisma.contact.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, phoneNormalized: '+56977776666' },
    });
    const waitingOpportunity = await prisma.opportunity.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, contactId: waitingContact.id },
    });
    const waitingFollowUp = await prisma.followUp.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, opportunityId: waitingOpportunity.id },
    });
    expect(waitingFollowUp.autoSuggested).toBe(true);
    expect(waitingFollowUp.dueAt.getTime()).toBeGreaterThan(Date.now() + 3 * 24 * 60 * 60 * 1000);
    expect(waitingFollowUp.dueAt.getTime()).toBeLessThan(Date.now() + 5 * 24 * 60 * 60 * 1000);
    expect(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Santiago',
        hour: '2-digit',
        hour12: false,
      }).format(waitingFollowUp.dueAt),
    ).toBe('10');

    const manualDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const manualLead = await authorized('post', '/api/v1/contacts/leads', token).send({
      firstName: 'Manual Followup',
      phone: '+56988887777',
      country: 'CL',
      nextFollowUpAt: manualDate.toISOString(),
    });
    const manualContact = await prisma.contact.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, phoneNormalized: '+56988887777' },
    });
    const manualOpportunity = await prisma.opportunity.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, contactId: manualContact.id },
    });
    const manualFollowUp = await prisma.followUp.findFirstOrThrow({
      where: { organizationId: fixture.organizationA.id, opportunityId: manualOpportunity.id },
    });
    await authorized('patch', `/api/v1/contacts/${manualContact.id}`, token).send({
      firstName: 'Manual Followup Updated',
    });
    const manualAfterUpdate = await prisma.followUp.findUniqueOrThrow({
      where: {
        organizationId_id: { organizationId: fixture.organizationA.id, id: manualFollowUp.id },
      },
    });
    const movedManual = await authorized(
      'post',
      `/api/v1/opportunities/${manualOpportunity.id}/move`,
      token,
    ).send({ pipelineStageId: demoStage.id });
    const manualAfterMove = await prisma.followUp.findUniqueOrThrow({
      where: {
        organizationId_id: { organizationId: fixture.organizationA.id, id: manualFollowUp.id },
      },
    });
    expect(manualLead.status).toBe(201);
    expect(movedManual.status).toBe(201);
    expect(manualAfterUpdate.dueAt.getTime()).toBe(manualDate.getTime());
    expect(manualAfterMove.dueAt.getTime()).toBe(manualDate.getTime());
    expect(manualAfterUpdate.autoSuggested).toBe(false);
  });
});

async function createFixture(database: PrismaClient): Promise<Fixture> {
  const permissionKeys = [
    'contacts.read',
    'contacts.create',
    'contacts.update',
    'contacts.delete',
    'opportunities.read',
    'opportunities.create',
    'opportunities.update',
    'followups.read',
    'followups.create',
    'marketing.attribution.manage',
    'catalog.read',
    'catalog.create',
  ] as const;
  const permissions = await Promise.all(
    permissionKeys.map((key) => database.permission.create({ data: { key, name: key } })),
  );
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
  const organizationA = await database.organization.create({
    data: { name: 'Tenant A', slug: `contacts-a-${Date.now()}` },
  });
  const organizationB = await database.organization.create({
    data: { name: 'Tenant B', slug: `contacts-b-${Date.now()}` },
  });
  const allPermissions = permissions.map((permission) => ({ id: permission.id }));
  const ownerRoleA = await database.role.create({
    data: {
      organizationId: organizationA.id,
      name: 'Owner',
      permissions: { connect: allPermissions },
    },
  });
  const salesRoleA = await database.role.create({
    data: {
      organizationId: organizationA.id,
      name: 'Sales',
      permissions: { connect: allPermissions },
    },
  });
  const viewerRoleA = await database.role.create({
    data: {
      organizationId: organizationA.id,
      name: 'Viewer',
      permissions: { connect: [{ id: permissionByKey.get('contacts.read') ?? '' }] },
    },
  });
  const ownerRoleB = await database.role.create({
    data: {
      organizationId: organizationB.id,
      name: 'Owner',
      permissions: { connect: allPermissions },
    },
  });
  const ownerHash = await hashPassword(OWNER_PASSWORD);
  const salesHash = await hashPassword(SALES_PASSWORD);
  const viewerHash = await hashPassword(VIEWER_PASSWORD);

  const ownerARecord = await database.user.create({
    data: {
      organizationId: organizationA.id,
      roleId: ownerRoleA.id,
      email: 'contacts-owner-a@example.com',
      firstName: 'Owner',
      lastName: 'A',
      passwordHash: ownerHash,
      status: UserStatus.ACTIVE,
    },
  });
  const salesARecord = await database.user.create({
    data: {
      organizationId: organizationA.id,
      roleId: salesRoleA.id,
      email: 'contacts-sales-a@example.com',
      firstName: 'Sales',
      lastName: 'A',
      passwordHash: salesHash,
      status: UserStatus.ACTIVE,
    },
  });
  const viewerARecord = await database.user.create({
    data: {
      organizationId: organizationA.id,
      roleId: viewerRoleA.id,
      email: 'contacts-viewer-a@example.com',
      firstName: 'Viewer',
      lastName: 'A',
      passwordHash: viewerHash,
      status: UserStatus.ACTIVE,
    },
  });
  const ownerBRecord = await database.user.create({
    data: {
      organizationId: organizationB.id,
      roleId: ownerRoleB.id,
      email: 'contacts-owner-b@example.com',
      firstName: 'Owner',
      lastName: 'B',
      passwordHash: ownerHash,
      status: UserStatus.ACTIVE,
    },
  });

  const stageA = await database.pipelineStage.create({
    data: {
      organizationId: organizationA.id,
      name: 'Nuevo Lead',
      order: 1,
      color: '#64748B',
      category: 'OPEN',
    },
  });
  await database.pipelineStage.create({
    data: {
      organizationId: organizationB.id,
      name: 'Nuevo Lead',
      order: 1,
      color: '#64748B',
      category: 'OPEN',
    },
  });
  const campaignA = await database.campaign.create({
    data: {
      organizationId: organizationA.id,
      name: 'Campaña A',
      source: 'META',
      platform: 'META_ADS',
      active: true,
    },
  });
  const campaignB = await database.campaign.create({
    data: {
      organizationId: organizationB.id,
      name: 'Campaña B',
      source: 'META',
      platform: 'META_ADS',
      active: true,
    },
  });
  const productA = await database.product.create({
    data: {
      organizationId: organizationA.id,
      name: 'Producto A',
      slug: 'producto-a',
      price: new Prisma.Decimal('100'),
      currency: 'USD',
      active: true,
    },
  });
  const productB = await database.product.create({
    data: {
      organizationId: organizationB.id,
      name: 'Producto B',
      slug: 'producto-b',
      price: new Prisma.Decimal('100'),
      currency: 'USD',
      active: true,
    },
  });
  const tagA = await database.tag.create({
    data: { organizationId: organizationA.id, name: 'Fixture' },
  });
  void stageA;

  return {
    organizationA: { id: organizationA.id, slug: organizationA.slug },
    organizationB: { id: organizationB.id, slug: organizationB.slug },
    ownerA: {
      id: ownerARecord.id,
      email: ownerARecord.email,
      password: OWNER_PASSWORD,
      organizationId: organizationA.id,
      roleId: ownerRoleA.id,
    },
    salesA: {
      id: salesARecord.id,
      email: salesARecord.email,
      password: SALES_PASSWORD,
      organizationId: organizationA.id,
      roleId: salesRoleA.id,
    },
    viewerA: {
      id: viewerARecord.id,
      email: viewerARecord.email,
      password: VIEWER_PASSWORD,
      organizationId: organizationA.id,
      roleId: viewerRoleA.id,
    },
    ownerB: {
      id: ownerBRecord.id,
      email: ownerBRecord.email,
      password: OWNER_PASSWORD,
      organizationId: organizationB.id,
      roleId: ownerRoleB.id,
    },
    campaignA: campaignA.id,
    campaignB: campaignB.id,
    productA: productA.id,
    productB: productB.id,
    tagA: tagA.id,
  };
}
