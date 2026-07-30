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

interface AuthBody {
  accessToken: string;
}

describe('WhatsApp Cloud API HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let organizationId: string;
  let email: string;

  beforeAll(async () => {
    if (!(process.env.DATABASE_URL ?? '').includes('schema=auth_test')) {
      throw new Error('Las pruebas de WhatsApp requieren el esquema PostgreSQL aislado auth_test.');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const configuration = moduleRef.get(ConfigService).getOrThrow<AppConfiguration>('app');
    configureApplication(app, configuration);
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const organization = await prisma.organization.create({
      data: { name: 'WhatsApp Test', slug: `whatsapp-${Date.now()}` },
    });
    organizationId = organization.id;
    const permission = await prisma.permission.create({
      data: { key: 'whatsapp.read', name: 'WhatsApp read' },
    });
    const managePermission = await prisma.permission.create({
      data: { key: 'whatsapp.manage', name: 'WhatsApp manage' },
    });
    const reportsPermission = await prisma.permission.create({
      data: { key: 'reports.read', name: 'Reports read' },
    });
    const role = await prisma.role.create({
      data: {
        organizationId,
        name: 'Owner',
        permissions: {
          connect: [
            { id: permission.id },
            { id: managePermission.id },
            { id: reportsPermission.id },
          ],
        },
      },
    });
    email = `owner-${Date.now()}@example.com`;
    await prisma.user.create({
      data: {
        organizationId,
        roleId: role.id,
        email,
        firstName: 'Owner',
        status: UserStatus.ACTIVE,
        passwordHash: await hashPassword('OwnerPassword1!'),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function token(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'OwnerPassword1!' });
    expect(response.status).toBe(200);
    return (response.body as AuthBody).accessToken;
  }

  it('protege la configuración y enmascara secretos', async () => {
    const accessToken = await token();
    const initial = await request(app.getHttpServer())
      .get('/api/v1/integrations/whatsapp/connection')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(initial.status).toBe(200);
    expect(initial.body).toEqual({});
    const saved = await request(app.getHttpServer())
      .put('/api/v1/integrations/whatsapp/connection')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        wabaId: 'waba-1',
        phoneNumberId: 'phone-1',
        businessPhoneNumber: '+56912345678',
        accessToken: 'meta-access',
        appSecret: 'app-secret',
        webhookVerifyToken: 'verify-token',
        graphApiVersion: 'v23.0',
      });
    expect(saved.status).toBe(200);
    expect(saved.body.accessToken).toBe('••••••••');
    expect(saved.body.appSecret).toBe('••••••••');
    const persisted = await prisma.whatsAppConnection.findFirst({ where: { organizationId } });
    expect(persisted?.accessTokenEncrypted).not.toContain('meta-access');
  });

  it('expone el health del canal y no realiza llamadas externas al verificar configuración', async () => {
    const accessToken = await token();
    const health = await request(app.getHttpServer())
      .get('/api/v1/communication/channels/whatsapp/health')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      channel: 'WHATSAPP',
      provider: 'META_CLOUD_API',
      status: 'PENDING_CONFIGURATION',
    });
    expect(health.body).not.toHaveProperty('accessToken');
    expect(health.body).not.toHaveProperty('appSecret');

    const verification = await request(app.getHttpServer())
      .post('/api/v1/communication/channels/whatsapp/verify')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(verification.status).toBe(200);
    expect(verification.body).toMatchObject({
      channel: 'WHATSAPP',
      externalRequestMade: false,
    });
  });

  it('expone sincronización, checkpoint y métricas exclusivamente de lectura', async () => {
    const accessToken = await token();
    const health = await request(app.getHttpServer())
      .get('/api/v1/communication/channels/whatsapp-read-only/health')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      channel: 'WHATSAPP_READ_ONLY',
      readOnly: true,
      externalWriteEnabled: false,
      externalRequestMade: false,
    });

    const status = await request(app.getHttpServer())
      .get('/api/v1/communication/channels/whatsapp-read-only/sync-status')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(status.status).toBe(200);
    expect(status.body.readOnly).toBe(true);

    const sync = await request(app.getHttpServer())
      .post('/api/v1/communication/channels/whatsapp-read-only/sync')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(sync.status).toBe(200);
    expect(sync.body).toMatchObject({
      status: 'SUCCEEDED',
      readOnly: true,
      externalWriteEnabled: false,
    });

    const reindex = await request(app.getHttpServer())
      .post('/api/v1/communication/channels/whatsapp-read-only/reindex')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(reindex.status).toBe(200);
    expect(reindex.body.readOnly).toBe(true);

    const metrics = await request(app.getHttpServer())
      .get('/api/v1/revenue-intelligence/communication')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(metrics.status).toBe(200);
    expect(metrics.body).toMatchObject({ messagesToday: 0, conversationsToday: 0 });
  });

  it('verifica el callback público y rechaza firma inválida', async () => {
    const accessToken = await token();
    await request(app.getHttpServer())
      .put('/api/v1/integrations/whatsapp/connection')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        wabaId: 'waba-1',
        phoneNumberId: 'phone-1',
        businessPhoneNumber: '+56912345678',
        accessToken: 'meta-access',
        appSecret: 'app-secret',
        webhookVerifyToken: 'verify-token',
      });
    const verification = await request(app.getHttpServer())
      .get('/api/v1/integrations/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-token',
        'hub.challenge': 'challenge-1',
      });
    expect(verification.status).toBe(200);
    expect(verification.text).toBe('challenge-1');
    const foundationVerification = await request(app.getHttpServer())
      .get('/api/v1/integrations/communication/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-token',
        'hub.challenge': 'challenge-foundation',
      });
    expect(foundationVerification.status).toBe(200);
    expect(foundationVerification.text).toBe('challenge-foundation');
    const invalid = await request(app.getHttpServer())
      .post('/api/v1/integrations/whatsapp/webhook')
      .set('x-hub-signature-256', 'sha256=bad')
      .send({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-1' } } }] }] });
    expect(invalid.status).toBe(401);
  });
});
