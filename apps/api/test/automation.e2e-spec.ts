import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutomationTrigger, PrismaClient, UserStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { AutomationService } from '../src/modules/automation/automation.service';
import { hashPassword } from '../src/modules/auth/auth.crypto';
import { resetDatabase } from './test-database';

const PASSWORD = 'AutomationPassword1!';

interface UserFixture {
  id: string;
  email: string;
  organizationId: string;
}

interface Fixture {
  userA: UserFixture;
  userB: UserFixture;
}

function requireIsolatedDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.includes('schema=auth_test')) {
    throw new Error('Las pruebas de automatización requieren DATABASE_URL con schema=auth_test.');
  }
}

describe('Communications and automation HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let automation: AutomationService;
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
    automation = moduleRef.get(AutomationService);
    api = request(app.getHttpServer());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fixture = await createFixture(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(user: UserFixture): Promise<string> {
    const response = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `10.40.0.${Math.floor(Math.random() * 200) + 1}`)
      .send({ email: user.email, password: PASSWORD });
    expect(response.status).toBe(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function createContact(user: UserFixture): Promise<string> {
    const contact = await prisma.contact.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        firstName: 'Ana',
        lastName: 'Automation',
        email: 'ana@example.com',
      },
    });
    return contact.id;
  }

  it('crea, lista y previsualiza plantillas con variables dinámicas', async () => {
    const token = await login(fixture.userA);
    const created = await api
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-ID', 'request-template-create')
      .send({
        name: 'Nuevo lead',
        slug: 'nuevo-lead',
        channel: 'INTERNAL',
        subject: 'Hola {{contact.name}}',
        body: 'Tu venta es {{sale.total}}.',
      });
    expect(created.status).toBe(201);
    expect(created.body.variables).toEqual(['contact.name', 'sale.total']);
    expect(created.body.passwordHash).toBeUndefined();

    const listed = await api.get('/api/v1/templates').set('Authorization', `Bearer ${token}`);
    const preview = await api
      .post('/api/v1/templates/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        templateId: created.body.id,
        context: { contact: { name: 'Ana' }, sale: { total: '50' } },
      });
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(preview.status).toBe(201);
    expect(preview.body.body).toBe('Tu venta es 50.');
  });

  it('rechaza campos no permitidos en plantillas', async () => {
    const token = await login(fixture.userA);
    const response = await api
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Plantilla',
        slug: 'plantilla',
        channel: 'INTERNAL',
        body: 'Hola',
        unknown: true,
      });
    expect(response.status).toBe(400);
  });

  it('crea reglas, encola una sola ejecución por evento y crea una notificación', async () => {
    const token = await login(fixture.userA);
    const ruleResponse = await api
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-ID', 'request-rule-create')
      .send({
        name: 'Avisar contactos nuevos',
        trigger: AutomationTrigger.CONTACT_CREATED,
        active: true,
        actions: [
          {
            actionOrder: 1,
            type: 'CREATE_NOTIFICATION',
            config: { title: 'Nuevo lead', body: 'Revisar {{contact.name}}' },
          },
        ],
      });
    expect(ruleResponse.status).toBe(201);
    const contactId = await createContact(fixture.userA);
    const event = {
      eventId: randomUUID(),
      occurredAt: new Date(),
      organizationId: fixture.userA.organizationId,
      aggregateType: 'Contact',
      aggregateId: contactId,
      actorUserId: fixture.userA.id,
      requestId: 'request-event-1',
      payload: { contact: { id: contactId } },
    };
    await automation.enqueueFromEvent('ContactCreated', event);
    await automation.enqueueFromEvent('ContactCreated', event);
    expect(await prisma.automationExecution.count()).toBe(1);
    await automation.processAvailable();

    const notifications = await prisma.notification.findMany({
      where: { organizationId: fixture.userA.organizationId },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).toBe('Revisar Ana Automation');
    expect(notifications[0]?.requestId).toBe('request-event-1');
    expect(await prisma.automationExecution.count({ where: { status: 'SUCCEEDED' } })).toBe(1);
  });

  it('expone historial, estado de acciones y permite gestionar notificaciones', async () => {
    const token = await login(fixture.userA);
    await prisma.notification.create({
      data: {
        organizationId: fixture.userA.organizationId,
        userId: fixture.userA.id,
        type: 'AUTOMATION',
        title: 'Aviso',
        body: 'Contenido',
        requestId: 'request-notification',
      },
    });
    const list = await api.get('/api/v1/notifications').set('Authorization', `Bearer ${token}`);
    const notificationId = list.body.data[0].id as string;
    const read = await api
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${token}`);
    const executions = await api
      .get('/api/v1/automation-executions')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.unread).toBe(1);
    expect(read.status).toBe(201);
    expect(executions.status).toBe(200);
    expect(executions.body.pagination).toEqual(expect.objectContaining({ page: 1, limit: 25 }));
  });

  it('no permite acceder a reglas de otra organización', async () => {
    const tokenA = await login(fixture.userA);
    const tokenB = await login(fixture.userB);
    const created = await api
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Regla privada',
        trigger: 'CONTACT_CREATED',
        actions: [{ actionOrder: 1, type: 'ADD_ACTIVITY', config: {} }],
      });
    const response = await api
      .get(`/api/v1/automations/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(response.status).toBe(404);
  });

  it('registra fallos de acciones y conserva el error en el historial', async () => {
    const token = await login(fixture.userA);
    await api
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Regla con destinatario inválido',
        trigger: 'CONTACT_CREATED',
        active: true,
        actions: [
          {
            actionOrder: 1,
            type: 'CREATE_NOTIFICATION',
            config: { userId: fixture.userB.id, body: 'No debe cruzar tenant' },
          },
        ],
      });
    const contactId = await createContact(fixture.userA);
    await automation.enqueueFromEvent('ContactCreated', {
      eventId: randomUUID(),
      occurredAt: new Date(),
      organizationId: fixture.userA.organizationId,
      aggregateType: 'Contact',
      aggregateId: contactId,
      actorUserId: fixture.userA.id,
      requestId: 'request-failure',
      payload: {},
    });
    await automation.processAvailable();
    const execution = await prisma.automationExecution.findFirstOrThrow();
    const action = await prisma.automationExecutionAction.findFirstOrThrow();
    expect(execution.status).toBe('FAILED');
    expect(action.status).toBe('FAILED');
    expect(action.errorMessage).toContain('destinatario');
  });
});

async function createFixture(database: PrismaClient): Promise<Fixture> {
  const permissionKeys = [
    'automations.read',
    'automations.create',
    'automations.update',
    'automations.delete',
    'automation_executions.read',
    'templates.read',
    'templates.create',
    'templates.update',
    'templates.delete',
    'notifications.read',
    'notifications.update',
    'contacts.read',
  ];
  const permissions = await Promise.all(
    permissionKeys.map((key) => database.permission.create({ data: { key, name: key } })),
  );
  const organizationA = await database.organization.create({
    data: { name: 'Automation A', slug: `automation-a-${Date.now()}` },
  });
  const organizationB = await database.organization.create({
    data: { name: 'Automation B', slug: `automation-b-${Date.now()}` },
  });
  const roleA = await database.role.create({
    data: {
      organizationId: organizationA.id,
      name: 'Owner',
      permissions: { connect: permissions.map(({ id }) => ({ id })) },
    },
  });
  const roleB = await database.role.create({
    data: {
      organizationId: organizationB.id,
      name: 'Owner',
      permissions: { connect: permissions.map(({ id }) => ({ id })) },
    },
  });
  const passwordHash = await hashPassword(PASSWORD);
  const userA = await database.user.create({
    data: {
      organizationId: organizationA.id,
      roleId: roleA.id,
      email: `automation-a-${Date.now()}@example.com`,
      firstName: 'Owner',
      lastName: 'A',
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });
  const userB = await database.user.create({
    data: {
      organizationId: organizationB.id,
      roleId: roleB.id,
      email: `automation-b-${Date.now()}@example.com`,
      firstName: 'Owner',
      lastName: 'B',
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });
  return {
    userA: { id: userA.id, email: userA.email, organizationId: organizationA.id },
    userB: { id: userB.id, email: userB.email, organizationId: organizationB.id },
  };
}
