import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient, PipelineStageCategory, UserStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { hashPassword } from '../src/modules/auth/auth.crypto';

const PASSWORD = 'OwnerPassword1!';

interface UserFixture {
  id: string;
  email: string;
  password: string;
  organizationId: string;
}

interface Fixture {
  organizationA: string;
  organizationB: string;
  ownerA: UserFixture;
  salesA: UserFixture;
  viewerA: UserFixture;
  ownerB: UserFixture;
  contactA: string;
  contactB: string;
  campaignA: string;
  campaignB: string;
  productA: string;
  productB: string;
  openA: string;
  openA2: string;
  wonA: string;
  lostA: string;
}

interface AuthResponse {
  accessToken: string;
}

interface OpportunityResponse {
  id: string;
  status: string;
  title: string;
  organizationId?: string;
  pipelineStage: { id: string; category: string };
  expectedAmount: string | null;
  currency: string | null;
}

function requireIsolatedDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.includes('schema=auth_test')) {
    throw new Error('Las pruebas de oportunidades requieren DATABASE_URL con schema=auth_test.');
  }
}

describe('Opportunities and pipeline HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let fixture: Fixture;
  let ipSequence = 150;

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
    await prisma.auditLog.deleteMany();
    await prisma.contactTag.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.opportunityStageHistory.deleteMany();
    await prisma.opportunity.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.product.deleteMany();
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

  function nextIp(): string {
    ipSequence += 1;
    return `10.30.0.${ipSequence}`;
  }

  async function login(user: UserFixture): Promise<string> {
    const response = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: user.email, password: user.password });
    expect(response.status).toBe(200);
    return (response.body as AuthResponse).accessToken;
  }

  function authorized(method: 'get' | 'post' | 'patch', path: string, token: string): request.Test {
    return api[method](path)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp());
  }

  function body(response: { body: unknown }): OpportunityResponse {
    return response.body as OpportunityResponse;
  }

  it('crea una oportunidad, genera historial inicial y expone detalle acotado', async () => {
    const token = await login(fixture.ownerA);
    const response = await authorized('post', '/api/v1/opportunities', token).send({
      contactId: fixture.contactA,
      title: '  Panel   reseller  ',
      expectedAmount: '150000.00',
      currency: 'clp',
      pipelineStageId: fixture.openA,
      campaignId: fixture.campaignA,
      productId: fixture.productA,
      notes: 'Interés inicial',
    });

    expect(response.status).toBe(201);
    expect(body(response).title).toBe('Panel reseller');
    expect(body(response).expectedAmount).toBe('150000');
    expect(body(response).currency).toBe('CLP');
    expect(body(response).organizationId).toBeUndefined();
    const history = await prisma.opportunityStageHistory.findMany({
      where: { opportunityId: body(response).id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]?.fromStageId).toBeNull();
    expect(history[0]?.toStageId).toBe(fixture.openA);
    const detail = await authorized('get', `/api/v1/opportunities/${body(response).id}`, token);
    expect(detail.status).toBe(200);
    expect(detail.body.stageHistory).toHaveLength(1);
    expect(detail.body.activities).toHaveLength(1);
  });

  it('mantiene aislamiento multiempresa para contacto, etapa, campaña y producto', async () => {
    const token = await login(fixture.ownerA);
    const wrongContact = await authorized('post', '/api/v1/opportunities', token).send({
      contactId: fixture.contactB,
      title: 'Tenant B',
    });
    const wrongStage = await authorized('post', '/api/v1/opportunities', token).send({
      contactId: fixture.contactA,
      title: 'Wrong stage',
      pipelineStageId: fixture.openA,
    });
    expect(wrongContact.status).toBe(404);
    expect(wrongContact.body.code).toBe('OPPORTUNITY_CONTACT_NOT_FOUND');
    expect(wrongStage.status).toBe(201);
    const crossTenant = await authorized(
      'patch',
      `/api/v1/opportunities/${body(wrongStage).id}`,
      token,
    ).send({ campaignId: fixture.campaignB });
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body.code).toBe('OPPORTUNITY_CAMPAIGN_NOT_FOUND');
    const crossProduct = await authorized(
      'patch',
      `/api/v1/opportunities/${body(wrongStage).id}`,
      token,
    ).send({ productId: fixture.productB });
    expect(crossProduct.status).toBe(404);
    expect(crossProduct.body.code).toBe('OPPORTUNITY_PRODUCT_NOT_FOUND');
  });

  it('actualiza campos permitidos y conserva el modelo monetario decimal', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/opportunities', token).send({
      contactId: fixture.contactA,
      title: 'Actualizable',
    });
    const updated = await authorized(
      'patch',
      `/api/v1/opportunities/${body(created).id}`,
      token,
    ).send({ expectedAmount: '999.90', currency: 'USD', campaignId: fixture.campaignA });
    expect(updated.status).toBe(200);
    expect(body(updated).expectedAmount).toBe('999.9');
    expect(body(updated).currency).toBe('USD');
    const cleared = await authorized(
      'patch',
      `/api/v1/opportunities/${body(created).id}`,
      token,
    ).send({ expectedAmount: null, campaignId: null });
    expect(cleared.status).toBe(200);
    expect(body(cleared).expectedAmount).toBeNull();
    expect(body(cleared).campaign).toBeNull();
    const invalid = await authorized(
      'patch',
      `/api/v1/opportunities/${body(created).id}`,
      token,
    ).send({ expectedAmount: '1.999' });
    expect(invalid.status).toBe(400);
  });

  it('aplica ownership de Sales y valida responsables del tenant', async () => {
    const ownerToken = await login(fixture.ownerA);
    const salesToken = await login(fixture.salesA);
    const created = await authorized('post', '/api/v1/opportunities', ownerToken).send({
      contactId: fixture.contactA,
      title: 'Ownership',
      assignedUserId: fixture.ownerA.id,
    });
    const sellerCannotEdit = await authorized(
      'patch',
      `/api/v1/opportunities/${body(created).id}`,
      salesToken,
    ).send({ title: 'No autorizado' });
    expect(sellerCannotEdit.status).toBe(403);
    const unassigned = await authorized('post', '/api/v1/opportunities', ownerToken).send({
      contactId: fixture.contactA,
      title: 'Sin responsable',
      assignedUserId: null,
    });
    const sellerCanEdit = await authorized(
      'patch',
      `/api/v1/opportunities/${body(unassigned).id}`,
      salesToken,
    ).send({ title: 'Editado por vendedor' });
    expect(sellerCanEdit.status).toBe(200);
    const wrongAssignee = await authorized(
      'patch',
      `/api/v1/opportunities/${body(unassigned).id}/assignee`,
      salesToken,
    ).send({ assignedUserId: fixture.ownerB.id });
    expect(wrongAssignee.status).toBe(403);
  });

  it('mueve etapas, exige motivo LOST y registra cada transición', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/opportunities', token).send({
      contactId: fixture.contactA,
      title: 'Lifecycle',
    });
    const won = await authorized(
      'post',
      `/api/v1/opportunities/${body(created).id}/move`,
      token,
    ).send({ pipelineStageId: fixture.wonA });
    expect(won.status).toBe(201);
    expect(body(won).status).toBe('WON');
    expect(
      (
        await authorized('post', `/api/v1/opportunities/${body(created).id}/move`, token).send({
          pipelineStageId: fixture.lostA,
        })
      ).status,
    ).toBe(400);
    const lost = await authorized(
      'post',
      `/api/v1/opportunities/${body(created).id}/move`,
      token,
    ).send({ pipelineStageId: fixture.lostA, reason: 'No presupuesto' });
    expect(lost.status).toBe(201);
    expect(body(lost).status).toBe('LOST');
    const openMove = await authorized(
      'post',
      `/api/v1/opportunities/${body(created).id}/move`,
      token,
    ).send({ pipelineStageId: fixture.openA });
    expect(openMove.status).toBe(409);
    expect(openMove.body.code).toBe('OPPORTUNITY_CLOSED_REQUIRES_REOPEN');
    const reopened = await authorized(
      'post',
      `/api/v1/opportunities/${body(created).id}/reopen`,
      token,
    ).send({ pipelineStageId: fixture.openA, reason: 'Retomar contacto' });
    expect(reopened.status).toBe(201);
    expect(body(reopened).status).toBe('OPEN');
    expect(
      await prisma.opportunityStageHistory.count({ where: { opportunityId: body(created).id } }),
    ).toBe(4);
  });

  it('rechaza reabrir con venta activa y permite solo transiciones explícitas', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/opportunities', token).send({
      contactId: fixture.contactA,
      title: 'Active sale',
    });
    await authorized('post', `/api/v1/opportunities/${body(created).id}/move`, token).send({
      pipelineStageId: fixture.wonA,
    });
    await prisma.sale.create({
      data: {
        organizationId: fixture.organizationA,
        opportunityId: body(created).id,
        status: 'WON',
        subtotal: new Prisma.Decimal('10'),
        total: new Prisma.Decimal('10'),
        currency: 'USD',
      },
    });
    const reopened = await authorized(
      'post',
      `/api/v1/opportunities/${body(created).id}/reopen`,
      token,
    ).send({ pipelineStageId: fixture.openA });
    expect(reopened.status).toBe(409);
    expect(reopened.body.code).toBe('OPPORTUNITY_HAS_ACTIVE_SALE');
  });

  it('archiva y restaura de forma idempotente sin eliminar la oportunidad', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/opportunities', token).send({
      contactId: fixture.contactA,
      title: 'Archive me',
    });
    const archive = await authorized(
      'post',
      `/api/v1/opportunities/${body(created).id}/archive`,
      token,
    ).send({ reason: 'Pausa' });
    const archiveAgain = await authorized(
      'post',
      `/api/v1/opportunities/${body(created).id}/archive`,
      token,
    ).send({});
    expect(archive.status).toBe(201);
    expect(archiveAgain.status).toBe(201);
    expect(body(archive).status).toBe('ARCHIVED');
    const restore = await authorized(
      'post',
      `/api/v1/opportunities/${body(created).id}/restore`,
      token,
    ).send({});
    const restoreAgain = await authorized(
      'post',
      `/api/v1/opportunities/${body(created).id}/restore`,
      token,
    ).send({});
    expect(restore.status).toBe(201);
    expect(restoreAgain.status).toBe(201);
    expect(body(restore).status).toBe('OPEN');
    expect(
      await prisma.opportunity.count({ where: { id: body(created).id, deletedAt: null } }),
    ).toBe(1);
  });

  it('lista, busca, filtra y pagina oportunidades sin exponer organizationId', async () => {
    const token = await login(fixture.ownerA);
    for (const title of ['Alpha lead', 'Beta lead', 'Gamma lead']) {
      await authorized('post', '/api/v1/opportunities', token).send({
        contactId: fixture.contactA,
        title,
        expectedAmount: '10',
        currency: 'CLP',
      });
    }
    const searched = await authorized('get', '/api/v1/opportunities?search=beta&limit=1', token);
    expect(searched.status).toBe(200);
    expect(searched.body.data).toHaveLength(1);
    expect(searched.body.data[0].title).toBe('Beta lead');
    expect(searched.body.data[0].organizationId).toBeUndefined();
    const paged = await authorized(
      'get',
      '/api/v1/opportunities?page=1&limit=2&sortBy=createdAt&sortOrder=desc',
      token,
    );
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.pagination.total).toBe(3);
    const filtered = await authorized(
      'get',
      '/api/v1/opportunities?currency=CLP&stageCategory=OPEN',
      token,
    );
    expect(filtered.body.data).toHaveLength(3);
  });

  it('sirve pipeline por columnas, cursor y resumen separado por moneda', async () => {
    const token = await login(fixture.ownerA);
    for (const amount of ['10', '20', '30']) {
      await authorized('post', '/api/v1/opportunities', token).send({
        contactId: fixture.contactA,
        title: `Cursor ${amount}`,
        pipelineStageId: fixture.openA,
        expectedAmount: amount,
        currency: amount === '20' ? 'USD' : 'CLP',
      });
    }
    const first = await authorized(
      'get',
      `/api/v1/pipeline/stages/${fixture.openA}/opportunities?limit=2`,
      token,
    );
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await authorized(
      'get',
      `/api/v1/pipeline/stages/${fixture.openA}/opportunities?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      token,
    );
    expect(second.status).toBe(200);
    expect(second.body.data).toHaveLength(1);
    const pipeline = await authorized('get', '/api/v1/pipeline?limit=2', token);
    expect(pipeline.status).toBe(200);
    expect(pipeline.body.stages.some((stage: { id: string }) => stage.id === fixture.openA)).toBe(
      true,
    );
    const summary = await authorized('get', '/api/v1/pipeline/summary', token);
    expect(summary.status).toBe(200);
    expect(summary.body.totalsByCurrency).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'CLP' }),
        expect.objectContaining({ currency: 'USD' }),
      ]),
    );
  });

  it('administra etapas con unicidad, reordenamiento y bloqueo por oportunidades activas', async () => {
    const token = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/pipeline/stages', token).send({
      name: '  Calificación  ',
      color: '#123456',
      category: 'OPEN',
      order: 2,
    });
    expect(created.status).toBe(201);
    const duplicate = await authorized('post', '/api/v1/pipeline/stages', token).send({
      name: 'calificación',
      color: '#654321',
      category: 'OPEN',
      order: 3,
    });
    expect(duplicate.status).toBe(409);
    const reorder = await authorized(
      'post',
      `/api/v1/pipeline/stages/${(created.body as { id: string }).id}/reorder`,
      token,
    ).send({ order: 1 });
    expect(reorder.status).toBe(201);
    const withOpportunity = await authorized('post', '/api/v1/opportunities', token).send({
      contactId: fixture.contactA,
      title: 'Stage in use',
      pipelineStageId: (created.body as { id: string }).id,
    });
    expect(withOpportunity.status).toBe(201);
    const archiveInUse = await authorized(
      'post',
      `/api/v1/pipeline/stages/${(created.body as { id: string }).id}/archive`,
      token,
    ).send({});
    expect(archiveInUse.status).toBe(409);
    expect(archiveInUse.body.code).toBe('PIPELINE_STAGE_IN_USE');
  });

  it('mantiene órdenes únicos bajo reordenamientos concurrentes y permite restaurar etapas', async () => {
    const token = await login(fixture.ownerA);
    const concurrent = await Promise.all([
      authorized('post', `/api/v1/pipeline/stages/${fixture.openA}/reorder`, token).send({
        order: 4,
      }),
      authorized('post', `/api/v1/pipeline/stages/${fixture.openA2}/reorder`, token).send({
        order: 1,
      }),
    ]);
    expect(concurrent.every((response) => response.status === 201)).toBe(true);
    const stages = await prisma.pipelineStage.findMany({
      where: { organizationId: fixture.organizationA, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    expect(stages.map((stage) => stage.order)).toEqual([1, 2, 3, 4]);
    const archived = await authorized(
      'post',
      `/api/v1/pipeline/stages/${fixture.openA2}/archive`,
      token,
    ).send({});
    expect(archived.status).toBe(201);
    expect((archived.body as { active: boolean }).active).toBe(false);
    const restored = await authorized(
      'post',
      `/api/v1/pipeline/stages/${fixture.openA2}/restore`,
      token,
    ).send({});
    expect(restored.status).toBe(201);
    expect((restored.body as { active: boolean }).active).toBe(true);
  });

  it('protege endpoints, permisos y auditoría multiempresa', async () => {
    const noAuth = await api.get('/api/v1/opportunities');
    expect(noAuth.status).toBe(401);
    const viewerToken = await login(fixture.viewerA);
    const forbidden = await authorized('post', '/api/v1/opportunities', viewerToken).send({
      contactId: fixture.contactA,
      title: 'No',
    });
    expect(forbidden.status).toBe(403);
    const ownerToken = await login(fixture.ownerA);
    const created = await authorized('post', '/api/v1/opportunities', ownerToken).send({
      contactId: fixture.contactA,
      title: 'Auditable',
    });
    expect(created.status).toBe(201);
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId: fixture.organizationA,
          action: 'OPPORTUNITY_CREATED',
          recordId: body(created).id,
        },
      }),
    ).toBe(1);
    const otherTenantDetail = await authorized(
      'get',
      `/api/v1/opportunities/${body(created).id}`,
      await login(fixture.ownerB),
    );
    expect(otherTenantDetail.status).toBe(404);
  });
});

async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const [organizationA, organizationB] = await Promise.all([
    prisma.organization.create({
      data: { name: 'Opportunity Org A', slug: `opportunity-a-${Date.now()}` },
    }),
    prisma.organization.create({
      data: { name: 'Opportunity Org B', slug: `opportunity-b-${Date.now()}` },
    }),
  ]);
  const permissionKeys = [
    'opportunities.read',
    'opportunities.create',
    'opportunities.update',
    'opportunities.delete',
    'settings.manage',
  ];
  const permissions = await Promise.all(
    permissionKeys.map((key) => prisma.permission.create({ data: { key, name: key } })),
  );
  const permissionConnect = permissions.map((permission) => ({ id: permission.id }));
  const [ownerRoleA, salesRoleA, viewerRoleA, ownerRoleB] = await Promise.all([
    prisma.role.create({
      data: {
        organizationId: organizationA.id,
        name: 'Owner',
        permissions: { connect: permissionConnect },
      },
    }),
    prisma.role.create({
      data: {
        organizationId: organizationA.id,
        name: 'Sales',
        permissions: { connect: permissionConnect.filter((_, index) => index < 4) },
      },
    }),
    prisma.role.create({
      data: {
        organizationId: organizationA.id,
        name: 'Viewer',
        permissions: { connect: [{ id: permissions[0]!.id }] },
      },
    }),
    prisma.role.create({
      data: {
        organizationId: organizationB.id,
        name: 'Owner',
        permissions: { connect: permissionConnect },
      },
    }),
  ]);
  const passwordHash = await hashPassword(PASSWORD);
  const [ownerA, salesA, viewerA, ownerB] = await Promise.all([
    prisma.user.create({
      data: {
        organizationId: organizationA.id,
        roleId: ownerRoleA.id,
        email: 'owner-opportunities-a@example.com',
        firstName: 'Owner',
        lastName: 'A',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organizationA.id,
        roleId: salesRoleA.id,
        email: 'sales-opportunities-a@example.com',
        firstName: 'Sales',
        lastName: 'A',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organizationA.id,
        roleId: viewerRoleA.id,
        email: 'viewer-opportunities-a@example.com',
        firstName: 'Viewer',
        lastName: 'A',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    }),
    prisma.user.create({
      data: {
        organizationId: organizationB.id,
        roleId: ownerRoleB.id,
        email: 'owner-opportunities-b@example.com',
        firstName: 'Owner',
        lastName: 'B',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    }),
  ]);
  const [openA, openA2, wonA, lostA] = await Promise.all([
    prisma.pipelineStage.create({
      data: {
        organizationId: organizationA.id,
        name: 'Open A',
        order: 1,
        color: '#111111',
        category: PipelineStageCategory.OPEN,
      },
    }),
    prisma.pipelineStage.create({
      data: {
        organizationId: organizationA.id,
        name: 'Open A2',
        order: 2,
        color: '#222222',
        category: PipelineStageCategory.OPEN,
      },
    }),
    prisma.pipelineStage.create({
      data: {
        organizationId: organizationA.id,
        name: 'Won A',
        order: 3,
        color: '#333333',
        category: PipelineStageCategory.WON,
      },
    }),
    prisma.pipelineStage.create({
      data: {
        organizationId: organizationA.id,
        name: 'Lost A',
        order: 4,
        color: '#444444',
        category: PipelineStageCategory.LOST,
      },
    }),
  ]);
  await prisma.pipelineStage.create({
    data: {
      organizationId: organizationB.id,
      name: 'Open B',
      order: 1,
      color: '#111111',
      category: PipelineStageCategory.OPEN,
    },
  });
  const [campaignA, campaignB] = await Promise.all([
    prisma.campaign.create({
      data: {
        organizationId: organizationA.id,
        name: 'Campaign A',
        source: 'META',
        platform: 'META_ADS',
      },
    }),
    prisma.campaign.create({
      data: {
        organizationId: organizationB.id,
        name: 'Campaign B',
        source: 'META',
        platform: 'META_ADS',
      },
    }),
  ]);
  const [productA, productB] = await Promise.all([
    prisma.product.create({
      data: {
        organizationId: organizationA.id,
        name: 'Product A',
        price: new Prisma.Decimal('100'),
        currency: 'CLP',
      },
    }),
    prisma.product.create({
      data: {
        organizationId: organizationB.id,
        name: 'Product B',
        price: new Prisma.Decimal('100'),
        currency: 'CLP',
      },
    }),
  ]);
  const [contactA, contactB] = await Promise.all([
    prisma.contact.create({
      data: {
        organizationId: organizationA.id,
        firstName: 'Contact',
        lastName: 'A',
        email: 'contact-a@example.com',
        phone: '+56911110001',
        phoneNormalized: '+56911110001',
        country: 'CL',
      },
    }),
    prisma.contact.create({
      data: {
        organizationId: organizationB.id,
        firstName: 'Contact',
        lastName: 'B',
        email: 'contact-b@example.com',
        phone: '+56911110002',
        phoneNormalized: '+56911110002',
        country: 'CL',
      },
    }),
  ]);
  return {
    organizationA: organizationA.id,
    organizationB: organizationB.id,
    ownerA: {
      id: ownerA.id,
      email: ownerA.email,
      password: PASSWORD,
      organizationId: organizationA.id,
    },
    salesA: {
      id: salesA.id,
      email: salesA.email,
      password: PASSWORD,
      organizationId: organizationA.id,
    },
    viewerA: {
      id: viewerA.id,
      email: viewerA.email,
      password: PASSWORD,
      organizationId: organizationA.id,
    },
    ownerB: {
      id: ownerB.id,
      email: ownerB.email,
      password: PASSWORD,
      organizationId: organizationB.id,
    },
    contactA: contactA.id,
    contactB: contactB.id,
    campaignA: campaignA.id,
    campaignB: campaignB.id,
    productA: productA.id,
    productB: productB.id,
    openA: openA.id,
    openA2: openA2.id,
    wonA: wonA.id,
    lostA: lostA.id,
  };
}
