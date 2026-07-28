import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FollowUpStatus, PipelineStageCategory, PrismaClient, UserStatus } from '@prisma/client';
import { DateTime } from 'luxon';
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
  opportunityA: string;
  opportunitySalesA: string;
  opportunityB: string;
  stages: {
    newLead: string;
    credit: string;
    money: string;
    potential: string;
    won: string;
  };
}

interface AuthResponse {
  accessToken: string;
}

interface FollowUpResponse {
  id: string;
  status: FollowUpStatus;
  title: string;
  dueAt: string;
  responsible: { id: string };
  opportunity: { id: string; pipelineStage: { systemKey?: string | null } };
  organizationId?: string;
  deletedAt?: string;
  history?: Array<{ action: string }>;
}

function requireIsolatedDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.includes('schema=auth_test')) {
    throw new Error('Las pruebas de seguimientos requieren DATABASE_URL con schema=auth_test.');
  }
}

describe('Follow-ups, agenda and my-day HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: ReturnType<typeof request>;
  let fixture: Fixture;
  let ipSequence = 700;

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
    await prisma.activity.deleteMany();
    await prisma.followUpHistory.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.renewal.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.opportunityStageHistory.deleteMany();
    await prisma.opportunity.deleteMany();
    await prisma.contactTag.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.product.deleteMany();
    await prisma.productCategory.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.pipelineStage.deleteMany();
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
    return `10.70.0.${ipSequence}`;
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

  function followUp(response: { body: unknown }): FollowUpResponse {
    return response.body as FollowUpResponse;
  }

  async function createFollowUp(
    token: string,
    opportunityId: string,
    dueAt: Date,
    overrides: Record<string, string> = {},
  ): Promise<request.Response> {
    return authorized('post', '/api/v1/follow-ups', token).send({
      opportunityId,
      title: '  Contactar   después de la demo  ',
      dueAt: dueAt.toISOString(),
      priority: 'HIGH',
      note: 'Confirmar avance comercial.',
      ...overrides,
    });
  }

  it('crea un seguimiento con historial, actividad, auditoría y actualización de contacto', async () => {
    const token = await login(fixture.ownerA);
    const response = await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );

    expect(response.status).toBe(201);
    expect(followUp(response).title).toBe('Contactar después de la demo');
    expect(followUp(response).status).toBe(FollowUpStatus.PENDING);
    expect(followUp(response).organizationId).toBeUndefined();
    expect(followUp(response).deletedAt).toBeUndefined();
    expect(
      await prisma.followUpHistory.count({ where: { followUpId: followUp(response).id } }),
    ).toBe(1);
    expect(
      await prisma.activity.count({
        where: { followUpId: followUp(response).id, type: 'FOLLOWUP' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { recordId: followUp(response).id, action: 'FOLLOW_UP_CREATED' },
      }),
    ).toBe(1);
    expect(
      (await prisma.contact.findUnique({ where: { id: fixture.contactA } }))?.lastActivityAt,
    ).not.toBeNull();
  });

  it('aplica responsable de oportunidad, autoasignación de Sales y políticas de tenant', async () => {
    const ownerToken = await login(fixture.ownerA);
    const salesToken = await login(fixture.salesA);
    const salesOwn = await createFollowUp(
      salesToken,
      fixture.opportunitySalesA,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    expect(salesOwn.status).toBe(201);
    expect(followUp(salesOwn).responsible.id).toBe(fixture.salesA.id);

    const wrongOpportunity = await createFollowUp(
      salesToken,
      fixture.opportunityA,
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    );
    expect(wrongOpportunity.status).toBe(403);

    const ownerCanCreate = await createFollowUp(
      ownerToken,
      fixture.opportunityB,
      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    );
    expect(ownerCanCreate.status).toBe(404);

    const otherTenant = await login(fixture.ownerB);
    const hidden = await authorized(
      'get',
      `/api/v1/follow-ups/${followUp(salesOwn).id}`,
      otherTenant,
    );
    expect(hidden.status).toBe(404);
  });

  it('rechaza creación sin permiso y sin autenticación', async () => {
    const viewerToken = await login(fixture.viewerA);
    const forbidden = await createFollowUp(
      viewerToken,
      fixture.opportunityA,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    expect(forbidden.status).toBe(403);
    expect((await api.get('/api/v1/follow-ups')).status).toBe(401);
  });

  it('protege duplicados activos y concurrencia con el índice parcial', async () => {
    const token = await login(fixture.ownerA);
    const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const responses = await Promise.all([
      createFollowUp(token, fixture.opportunityA, dueAt),
      createFollowUp(token, fixture.opportunityA, dueAt),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.code).toBe(
      'FOLLOW_UP_ALREADY_EXISTS',
    );
    expect(
      await prisma.followUp.count({
        where: {
          organizationId: fixture.organizationA,
          opportunityId: fixture.opportunityA,
          status: FollowUpStatus.PENDING,
          archivedAt: null,
        },
      }),
    ).toBe(1);
  });

  it('lista con paginación, filtros de prioridad y vencimiento', async () => {
    const token = await login(fixture.ownerA);
    await createFollowUp(token, fixture.opportunityA, new Date(Date.now() - 60 * 60 * 1000));
    await createFollowUp(token, fixture.opportunityA, new Date(Date.now() + 60 * 60 * 1000), {
      priority: 'URGENT',
    });

    const overdue = await authorized('get', '/api/v1/follow-ups?overdue=true&limit=1', token);
    expect(overdue.status).toBe(200);
    expect(overdue.body.data).toHaveLength(1);
    expect(overdue.body.pagination.total).toBe(1);
    expect(overdue.body.data[0].isOverdue).toBe(true);

    const urgent = await authorized('get', '/api/v1/follow-ups?priority=URGENT', token);
    expect(urgent.status).toBe(200);
    expect(urgent.body.pagination.total).toBe(1);
  });

  it('actualiza solo campos permitidos y rechaza cambios de dueAt por PATCH', async () => {
    const token = await login(fixture.ownerA);
    const created = await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const id = followUp(created).id;
    const updated = await authorized('patch', `/api/v1/follow-ups/${id}`, token).send({
      title: '  Título   normalizado ',
      note: 'Nueva nota',
    });
    expect(updated.status).toBe(200);
    expect(followUp(updated).title).toBe('Título normalizado');

    const dueAtPatch = await authorized('patch', `/api/v1/follow-ups/${id}`, token).send({
      dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(dueAtPatch.status).toBe(400);
  });

  it('completa y cancela con transiciones atómicas e idempotencia', async () => {
    const token = await login(fixture.ownerA);
    const completeTarget = await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const completed = await authorized(
      'post',
      `/api/v1/follow-ups/${followUp(completeTarget).id}/complete`,
      token,
    ).send({ completionNote: 'Confirmado.' });
    const completedAgain = await authorized(
      'post',
      `/api/v1/follow-ups/${followUp(completeTarget).id}/complete`,
      token,
    ).send({});
    expect(completed.status).toBe(201);
    expect(completedAgain.status).toBe(201);
    expect(followUp(completedAgain).status).toBe(FollowUpStatus.COMPLETED);

    const cancelTarget = await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    );
    const cancelled = await authorized(
      'post',
      `/api/v1/follow-ups/${followUp(cancelTarget).id}/cancel`,
      token,
    ).send({ reason: 'Cliente pidió esperar.' });
    const cancelledAgain = await authorized(
      'post',
      `/api/v1/follow-ups/${followUp(cancelTarget).id}/cancel`,
      token,
    ).send({ reason: 'Repetido.' });
    expect(cancelled.status).toBe(201);
    expect(cancelledAgain.status).toBe(201);
    expect(followUp(cancelledAgain).status).toBe(FollowUpStatus.CANCELLED);
  });

  it('reprograma conservando el original, crea reemplazo e historial', async () => {
    const token = await login(fixture.ownerA);
    const originalResponse = await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const originalId = followUp(originalResponse).id;
    const rescheduled = await authorized(
      'post',
      `/api/v1/follow-ups/${originalId}/reschedule`,
      token,
    ).send({
      dueAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      reason: 'Cliente pidió otro horario.',
    });

    expect(rescheduled.status).toBe(201);
    expect((rescheduled.body.original as FollowUpResponse).status).toBe(FollowUpStatus.RESCHEDULED);
    expect((rescheduled.body.replacement as FollowUpResponse).status).toBe(FollowUpStatus.PENDING);
    expect(await prisma.followUpHistory.count({ where: { followUpId: originalId } })).toBe(2);
    expect(
      await prisma.followUp.count({
        where: { rescheduledFromId: originalId, status: FollowUpStatus.PENDING },
      }),
    ).toBe(1);
  });

  it('solo permite una reprogramación concurrente', async () => {
    const token = await login(fixture.ownerA);
    const created = await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const id = followUp(created).id;
    const responses = await Promise.all([
      authorized('post', `/api/v1/follow-ups/${id}/reschedule`, token).send({
        dueAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        reason: 'Primer cambio.',
      }),
      authorized('post', `/api/v1/follow-ups/${id}/reschedule`, token).send({
        dueAt: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
        reason: 'Segundo cambio.',
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.followUp.count({ where: { rescheduledFromId: id } })).toBe(1);
  });

  it('archiva, restaura y rechaza restauración con duplicado activo', async () => {
    const token = await login(fixture.ownerA);
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const archivedTarget = await createFollowUp(token, fixture.opportunityA, dueAt);
    const archivedId = followUp(archivedTarget).id;
    const archived = await authorized(
      'post',
      `/api/v1/follow-ups/${archivedId}/archive`,
      token,
    ).send({
      reason: 'Creado por error.',
    });
    expect(archived.status).toBe(201);
    expect(followUp(archived).status).toBe(FollowUpStatus.PENDING);

    const active = await createFollowUp(token, fixture.opportunityA, dueAt);
    expect(active.status).toBe(201);
    const conflict = await authorized(
      'post',
      `/api/v1/follow-ups/${archivedId}/restore`,
      token,
    ).send({});
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('FOLLOW_UP_RESTORE_CONFLICT');

    const archivedAgain = await authorized(
      'post',
      `/api/v1/follow-ups/${archivedId}/archive`,
      token,
    ).send({});
    expect(archivedAgain.status).toBe(201);
    expect(await prisma.followUpHistory.count({ where: { followUpId: archivedId } })).toBe(2);
  });

  it('expone detalle e historial paginado sin datos internos', async () => {
    const token = await login(fixture.ownerA);
    const created = await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const id = followUp(created).id;
    await authorized('patch', `/api/v1/follow-ups/${id}`, token).send({ title: 'Editado' });
    const detail = await authorized('get', `/api/v1/follow-ups/${id}`, token);
    const history = await authorized('get', `/api/v1/follow-ups/${id}/history?limit=1`, token);
    expect(detail.status).toBe(200);
    expect(detail.body.organizationId).toBeUndefined();
    expect(detail.body.deletedAt).toBeUndefined();
    expect(detail.body.history).toHaveLength(2);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.pagination.total).toBe(2);
  });

  it('agenda convierte correctamente el día de Santiago a un rango UTC', async () => {
    const token = await login(fixture.ownerA);
    const onAugustFirst = await createFollowUp(
      token,
      fixture.opportunityA,
      new Date('2026-08-02T03:30:00.000Z'),
    );
    await createFollowUp(token, fixture.opportunityA, new Date('2026-08-02T04:30:00.000Z'));
    const agenda = await authorized(
      'get',
      '/api/v1/agenda?date=2026-08-01&timezone=America%2FSantiago',
      token,
    );
    expect(agenda.status).toBe(200);
    expect(agenda.body.timezone).toBe('America/Santiago');
    expect(agenda.body.data).toHaveLength(1);
    expect(agenda.body.data[0].id).toBe(followUp(onAugustFirst).id);

    const summary = await authorized(
      'get',
      '/api/v1/agenda/summary?dateFrom=2026-08-01&dateTo=2026-08-02&timezone=America%2FSantiago',
      token,
    );
    expect(summary.status).toBe(200);
    expect(summary.body.days).toHaveLength(2);
    expect(summary.body.days[0].total).toBe(1);
  });

  it('Mi Día reúne seguimientos, etapas por systemKey y resumen por conteos', async () => {
    const token = await login(fixture.ownerA);
    const now = Date.now();
    const dayStartUtc = DateTime.now()
      .setZone('America/Santiago')
      .startOf('day')
      .toUTC()
      .toJSDate();
    const sectionCreatedAt = new Date(now - 60 * 60 * 1000);
    await Promise.all([
      prisma.opportunity.create({
        data: {
          organizationId: fixture.organizationA,
          contactId: fixture.contactA,
          pipelineStageId: fixture.stages.credit,
          title: 'Awaiting credits',
          userId: fixture.ownerA.id,
          createdAt: sectionCreatedAt,
          lastStageChangedAt: sectionCreatedAt,
        },
      }),
      prisma.opportunity.create({
        data: {
          organizationId: fixture.organizationA,
          contactId: fixture.contactA,
          pipelineStageId: fixture.stages.money,
          title: 'Awaiting money',
          userId: fixture.ownerA.id,
          createdAt: sectionCreatedAt,
          lastStageChangedAt: sectionCreatedAt,
        },
      }),
      prisma.opportunity.create({
        data: {
          organizationId: fixture.organizationA,
          contactId: fixture.contactA,
          pipelineStageId: fixture.stages.potential,
          title: 'Potential buyer',
          userId: fixture.ownerA.id,
          createdAt: sectionCreatedAt,
          lastStageChangedAt: sectionCreatedAt,
        },
      }),
      prisma.opportunity.create({
        data: {
          organizationId: fixture.organizationA,
          contactId: fixture.contactA,
          pipelineStageId: fixture.stages.won,
          title: 'Recent win',
          userId: fixture.ownerA.id,
          createdAt: sectionCreatedAt,
          lastStageChangedAt: sectionCreatedAt,
          wonAt: new Date(now - 60 * 60 * 1000),
        },
      }),
    ]);
    await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(dayStartUtc.getTime() - 60 * 60 * 1000),
    );
    await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(dayStartUtc.getTime() + 2 * 60 * 60 * 1000),
    );
    await createFollowUp(
      token,
      fixture.opportunityA,
      new Date(dayStartUtc.getTime() + 26 * 60 * 60 * 1000),
    );

    const myDay = await authorized(
      'get',
      '/api/v1/my-day?timezone=America%2FSantiago&limitPerSection=10',
      token,
    );
    expect(myDay.status).toBe(200);
    expect(myDay.body.sections.overdueFollowUps.total).toBeGreaterThanOrEqual(1);
    expect(myDay.body.sections.todayFollowUps.total).toBeGreaterThanOrEqual(1);
    expect(myDay.body.sections.upcomingFollowUps.total).toBeGreaterThanOrEqual(1);
    expect(myDay.body.sections.newLeads.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pipelineStage: expect.objectContaining({ systemKey: 'NEW_LEAD' }),
        }),
      ]),
    );
    expect(myDay.body.sections.awaitingCreditUsage.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pipelineStage: expect.objectContaining({ systemKey: 'AWAITING_CREDIT_USAGE' }),
        }),
      ]),
    );
    expect(myDay.body.sections.awaitingMoney.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pipelineStage: expect.objectContaining({ systemKey: 'AWAITING_MONEY' }),
        }),
      ]),
    );
    expect(myDay.body.sections.potentialBuyers.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pipelineStage: expect.objectContaining({ systemKey: 'POTENTIAL_BUYER' }),
        }),
      ]),
    );
    expect(myDay.body.sections.recentWins.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pipelineStage: expect.objectContaining({ systemKey: 'WON' }) }),
      ]),
    );

    const summary = await authorized(
      'get',
      '/api/v1/my-day/summary?timezone=America%2FSantiago',
      token,
    );
    expect(summary.status).toBe(200);
    expect(summary.body.overdueFollowUps).toBeGreaterThanOrEqual(1);
    expect(summary.body.newLeads).toBeGreaterThanOrEqual(1);
    expect(summary.body.recentWins).toBeGreaterThanOrEqual(1);
  });
});

async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const [organizationA, organizationB] = await Promise.all([
    prisma.organization.create({
      data: { name: 'Follow-up Org A', slug: `followup-a-${Date.now()}` },
    }),
    prisma.organization.create({
      data: { name: 'Follow-up Org B', slug: `followup-b-${Date.now()}` },
    }),
  ]);
  const permissionKeys = [
    'followups.read',
    'followups.create',
    'followups.update',
    'followups.delete',
  ];
  const permissions = await Promise.all(
    permissionKeys.map((key) => prisma.permission.create({ data: { key, name: key } })),
  );
  const allPermissions = permissions.map((permission) => ({ id: permission.id }));
  const readPermissions = [{ id: permissions[0]!.id }];
  const salesPermissions = permissions.slice(0, 3).map((permission) => ({ id: permission.id }));
  const [ownerRoleA, salesRoleA, viewerRoleA, ownerRoleB] = await Promise.all([
    prisma.role.create({
      data: {
        organizationId: organizationA.id,
        name: 'Owner',
        permissions: { connect: allPermissions },
      },
    }),
    prisma.role.create({
      data: {
        organizationId: organizationA.id,
        name: 'Sales',
        permissions: { connect: salesPermissions },
      },
    }),
    prisma.role.create({
      data: {
        organizationId: organizationA.id,
        name: 'Viewer',
        permissions: { connect: readPermissions },
      },
    }),
    prisma.role.create({
      data: {
        organizationId: organizationB.id,
        name: 'Owner',
        permissions: { connect: allPermissions },
      },
    }),
  ]);
  const passwordHash = await hashPassword(PASSWORD);
  const [ownerA, salesA, viewerA, ownerB] = await Promise.all([
    prisma.user.create({
      data: {
        organizationId: organizationA.id,
        roleId: ownerRoleA.id,
        email: `owner-a-${Date.now()}@example.com`,
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
        email: `sales-a-${Date.now()}@example.com`,
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
        email: `viewer-a-${Date.now()}@example.com`,
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
        email: `owner-b-${Date.now()}@example.com`,
        firstName: 'Owner',
        lastName: 'B',
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    }),
  ]);
  const stageDefinitions = [
    ['Nuevo Lead', 'NEW_LEAD', PipelineStageCategory.OPEN],
    ['Debe gastar créditos', 'AWAITING_CREDIT_USAGE', PipelineStageCategory.OPEN],
    ['Debe juntar dinero', 'AWAITING_MONEY', PipelineStageCategory.OPEN],
    ['Posible comprador', 'POTENTIAL_BUYER', PipelineStageCategory.OPEN],
    ['Compró', 'WON', PipelineStageCategory.WON],
  ] as const;
  const stages = await Promise.all(
    stageDefinitions.map(([name, systemKey, category], index) =>
      prisma.pipelineStage.create({
        data: {
          organizationId: organizationA.id,
          name,
          systemKey,
          category,
          order: index + 1,
          color: '#123456',
        },
      }),
    ),
  );
  const stageB = await prisma.pipelineStage.create({
    data: {
      organizationId: organizationB.id,
      name: 'Nuevo Lead B',
      systemKey: 'NEW_LEAD',
      category: PipelineStageCategory.OPEN,
      order: 1,
      color: '#123456',
    },
  });
  const contactA = await prisma.contact.create({
    data: {
      organizationId: organizationA.id,
      firstName: 'Contact',
      lastName: 'A',
      phone: '+56970000001',
      phoneNormalized: '+56970000001',
      country: 'CL',
    },
  });
  const contactB = await prisma.contact.create({
    data: {
      organizationId: organizationB.id,
      firstName: 'Contact',
      lastName: 'B',
      phone: '+56970000002',
      phoneNormalized: '+56970000002',
      country: 'CL',
    },
  });
  const createdAt = new Date(Date.now() - 60 * 60 * 1000);
  const [opportunityA, opportunitySalesA, opportunityB] = await Promise.all([
    prisma.opportunity.create({
      data: {
        organizationId: organizationA.id,
        contactId: contactA.id,
        pipelineStageId: stages[0]!.id,
        title: 'Opportunity A',
        userId: ownerA.id,
        createdAt,
        lastStageChangedAt: createdAt,
      },
    }),
    prisma.opportunity.create({
      data: {
        organizationId: organizationA.id,
        contactId: contactA.id,
        pipelineStageId: stages[0]!.id,
        title: 'Opportunity Sales A',
        userId: salesA.id,
        createdAt,
        lastStageChangedAt: createdAt,
      },
    }),
    prisma.opportunity.create({
      data: {
        organizationId: organizationB.id,
        contactId: contactB.id,
        pipelineStageId: stageB.id,
        title: 'Opportunity B',
        userId: ownerB.id,
        createdAt,
        lastStageChangedAt: createdAt,
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
    opportunityA: opportunityA.id,
    opportunitySalesA: opportunitySalesA.id,
    opportunityB: opportunityB.id,
    stages: {
      newLead: stages[0]!.id,
      credit: stages[1]!.id,
      money: stages[2]!.id,
      potential: stages[3]!.id,
      won: stages[4]!.id,
    },
  };
}
