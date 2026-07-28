import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@prisma/client';
import request from 'supertest';

import { configureApplication } from '../src/app-setup';
import { AppModule } from '../src/app.module';
import { AppConfiguration } from '../src/config/configuration';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { createOpaqueToken, hashOpaqueToken, hashPassword } from '../src/modules/auth/auth.crypto';

interface LoginBody {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
    organization: { id: string; name: string; slug: string };
    role: { id: string; name: string };
    permissions: string[];
  };
  passwordHash?: string;
  refreshTokenHash?: string;
}

interface Fixture {
  organizationA: { id: string; name: string; slug: string };
  organizationB: { id: string; name: string; slug: string };
  ownerA: { id: string; roleId: string; organizationId: string; email: string };
  viewerA: { id: string; roleId: string; organizationId: string; email: string };
  ownerB: { id: string; roleId: string; organizationId: string; email: string };
}

interface CookieHeaders {
  headers: {
    'set-cookie'?: string[];
  };
}

const TEST_PASSWORD = 'OwnerPassword1!';
const NEW_PASSWORD = 'NewOwnerPassword1!';

function requireIsolatedDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.includes('schema=auth_test')) {
    throw new Error(
      'Las pruebas de integración requieren DATABASE_URL con schema=auth_test para no usar la base de desarrollo.',
    );
  }
}

function cookieFromResponse(response: CookieHeaders): string {
  return cookieHeaderFromResponse(response).split(';')[0] ?? '';
}

function cookieHeaderFromResponse(response: CookieHeaders): string {
  const cookie = response.headers['set-cookie']?.find((value) =>
    value.startsWith('superflash_refresh_token='),
  );
  if (!cookie) {
    throw new Error('La respuesta no estableció la cookie de refresh.');
  }
  return cookie;
}

function bodyOf(response: { body: unknown }): LoginBody {
  return response.body as LoginBody;
}

describe('Auth HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let fixture: Fixture;
  let api: ReturnType<typeof request>;
  let ipSequence = 0;

  beforeAll(async () => {
    requireIsolatedDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const configService = moduleRef.get(ConfigService);
    const configuration = configService.getOrThrow<AppConfiguration>('app');
    configureApplication(app, configuration);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwtService = moduleRef.get(JwtService);
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

  function nextIp(): string {
    ipSequence += 1;
    return `10.0.0.${ipSequence}`;
  }

  async function login(
    email: string,
    password: string = TEST_PASSWORD,
  ): Promise<{
    accessToken: string;
    cookie: string;
  }> {
    const response = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password });
    expect(response.status).toBe(200);
    const body = bodyOf(response);
    return { accessToken: body.accessToken, cookie: cookieFromResponse(response) };
  }

  it('1. permite login correcto y no expone hashes ni refresh token', async () => {
    const response = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: fixture.ownerA.email, password: TEST_PASSWORD });
    const body = bodyOf(response);

    expect(response.status).toBe(200);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.expiresIn).toBe(900);
    expect(body.user.email).toBe(fixture.ownerA.email);
    expect(body.passwordHash).toBeUndefined();
    expect(body.refreshTokenHash).toBeUndefined();
    expect((body as unknown as { refreshToken?: string }).refreshToken).toBeUndefined();
    expect(cookieFromResponse(response)).toContain('superflash_refresh_token=');
    expect(cookieHeaderFromResponse(response)).toContain('HttpOnly');
    expect(cookieHeaderFromResponse(response)).toContain('Path=/api/v1/auth');
    await expect(prisma.auditLog.count({ where: { action: 'AUTH_LOGIN_SUCCESS' } })).resolves.toBe(
      1,
    );
  });

  it('2. devuelve la misma respuesta para contraseña incorrecta y correo inexistente', async () => {
    const wrongPassword = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: fixture.ownerA.email, password: 'WrongPassword1!' });
    const unknownEmail = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'unknown@example.com', password: 'WrongPassword1!' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('3. rechaza usuarios suspendidos', async () => {
    await prisma.user.update({
      where: { id: fixture.ownerA.id },
      data: { status: UserStatus.SUSPENDED },
    });
    const response = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: fixture.ownerA.email, password: TEST_PASSWORD });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('4. rechaza usuarios cuya organización fue eliminada lógicamente', async () => {
    await prisma.organization.update({
      where: { id: fixture.organizationA.id },
      data: { deletedAt: new Date() },
    });
    const response = await api
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: fixture.ownerA.email, password: TEST_PASSWORD });
    expect(response.status).toBe(401);
  });

  it('5. rota correctamente el refresh token', async () => {
    const first = await login(fixture.ownerA.email);
    const response = await api.post('/api/v1/auth/refresh').set('Cookie', first.cookie);
    const body = bodyOf(response);

    expect(response.status).toBe(200);
    expect(body.accessToken).not.toBe(first.accessToken);
    expect(cookieFromResponse(response)).not.toBe(first.cookie);
    await expect(prisma.authSession.count({ where: { revokeReason: 'ROTATED' } })).resolves.toBe(1);
  });

  it('6. detecta reutilización y revoca toda la familia', async () => {
    const first = await login(fixture.ownerA.email);
    const rotated = await api.post('/api/v1/auth/refresh').set('Cookie', first.cookie);
    const secondCookie = cookieFromResponse(rotated);
    const reuse = await api.post('/api/v1/auth/refresh').set('Cookie', first.cookie);
    const afterReuse = await api.post('/api/v1/auth/refresh').set('Cookie', secondCookie);

    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('AUTH_REFRESH_TOKEN_REUSE_DETECTED');
    expect(afterReuse.status).toBe(401);
    expect(await prisma.authSession.count({ where: { revokedAt: null } })).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { action: 'AUTH_REFRESH_REUSE_DETECTED' } }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('7. logout revoca la sesión y es idempotente', async () => {
    const session = await login(fixture.ownerA.email);
    const firstLogout = await api.post('/api/v1/auth/logout').set('Cookie', session.cookie);
    const secondLogout = await api.post('/api/v1/auth/logout').set('Cookie', session.cookie);
    const refresh = await api.post('/api/v1/auth/refresh').set('Cookie', session.cookie);

    expect(firstLogout.status).toBe(204);
    expect(secondLogout.status).toBe(204);
    expect(refresh.status).toBe(401);
  });

  it('8. logout-all revoca todas las sesiones del usuario', async () => {
    const first = await login(fixture.ownerA.email);
    const second = await login(fixture.ownerA.email);
    const logoutAll = await api
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send();
    const firstRefresh = await api.post('/api/v1/auth/refresh').set('Cookie', first.cookie);
    const secondRefresh = await api.post('/api/v1/auth/refresh').set('Cookie', second.cookie);

    expect(logoutAll.status).toBe(204);
    expect(firstRefresh.status).toBe(401);
    expect(secondRefresh.status).toBe(401);
  });

  it('9. GET /me requiere JWT y retorna el contexto autenticado', async () => {
    const withoutToken = await api.get('/api/v1/auth/me');
    const session = await login(fixture.ownerA.email);
    const withToken = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(withoutToken.status).toBe(401);
    expect(withToken.status).toBe(200);
    expect(withToken.body.email).toBe(fixture.ownerA.email);
    expect(withToken.body.organization.id).toBe(fixture.organizationA.id);
    expect(withToken.body.permissions).toContain('audit.read');
    expect(withToken.body.passwordHash).toBeUndefined();
  });

  it('10. PermissionsGuard rechaza permisos faltantes y permite audit.read', async () => {
    const viewer = await login(fixture.viewerA.email, 'ViewerPassword1!');
    const owner = await login(fixture.ownerA.email);
    const denied = await api
      .get('/api/v1/auth/security-check')
      .set('Authorization', `Bearer ${viewer.accessToken}`);
    const allowed = await api
      .get('/api/v1/auth/security-check')
      .set('Authorization', `Bearer ${owner.accessToken}`);

    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('AUTH_FORBIDDEN');
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({
      authenticated: true,
      organizationId: fixture.organizationA.id,
      userId: fixture.ownerA.id,
      permission: 'audit.read',
    });
  });

  it('11. impide reutilizar un sessionId de otro tenant', async () => {
    const session = await login(fixture.ownerA.email);
    const authSession = await prisma.authSession.findFirstOrThrow({
      where: { userId: fixture.ownerA.id },
    });
    const forgedToken = await jwtService.signAsync({
      sub: fixture.ownerA.id,
      organizationId: fixture.organizationB.id,
      sessionId: authSession.id,
      roleId: fixture.ownerA.roleId,
    });
    const response = await api.get('/api/v1/auth/me').set('Authorization', `Bearer ${forgedToken}`);

    expect(session.accessToken).not.toBe(forgedToken);
    expect(response.status).toBe(401);
  });

  it('12. reset-password funciona una vez y revoca sesiones', async () => {
    const session = await login(fixture.ownerA.email);
    const rawToken = createOpaqueToken();
    await prisma.passwordResetToken.create({
      data: {
        organizationId: fixture.ownerA.organizationId,
        userId: fixture.ownerA.id,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const reset = await api
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: NEW_PASSWORD });
    const reused = await api
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: NEW_PASSWORD });
    const oldSession = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    const newLogin = await login(fixture.ownerA.email, NEW_PASSWORD);

    expect(reset.status).toBe(204);
    expect(reused.status).toBe(400);
    expect(oldSession.status).toBe(401);
    expect(newLogin.accessToken).toEqual(expect.any(String));
    expect(await prisma.auditLog.count({ where: { action: 'PASSWORD_RESET_COMPLETED' } })).toBe(1);
  });

  it('13. rechaza tokens de recuperación expirados', async () => {
    const rawToken = createOpaqueToken();
    await prisma.passwordResetToken.create({
      data: {
        organizationId: fixture.ownerA.organizationId,
        userId: fixture.ownerA.id,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const response = await api
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: NEW_PASSWORD });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('AUTH_INVALID_RESET_TOKEN');
  });

  it('14. forgot-password evita enumeración y audita solo cuentas elegibles', async () => {
    const existing = await api
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', nextIp())
      .send({ email: fixture.ownerA.email });
    const unknown = await api
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', nextIp())
      .send({ email: 'unknown@example.com' });

    expect(existing.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(existing.body).toEqual(unknown.body);
    expect(await prisma.passwordResetToken.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'PASSWORD_RESET_REQUESTED' } })).toBe(1);
  });

  it('15. ValidationPipe rechaza campos DTO no permitidos', async () => {
    const response = await api.post('/api/v1/auth/login').set('X-Forwarded-For', nextIp()).send({
      email: fixture.ownerA.email,
      password: TEST_PASSWORD,
      organizationId: fixture.organizationA.id,
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('16. rechaza JWT expirado', async () => {
    const session = await login(fixture.ownerA.email);
    const authSession = await prisma.authSession.findFirstOrThrow({
      where: { userId: fixture.ownerA.id },
    });
    const expiredToken = await jwtService.signAsync(
      {
        sub: fixture.ownerA.id,
        organizationId: fixture.organizationA.id,
        sessionId: authSession.id,
        roleId: fixture.ownerA.roleId,
      },
      { expiresIn: -1 },
    );
    const response = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(session.accessToken).not.toBe(expiredToken);
    expect(response.status).toBe(401);
  });

  it('17. las sesiones existentes se rechazan con usuario eliminado u organización eliminada', async () => {
    const session = await login(fixture.ownerA.email);
    await prisma.user.update({ where: { id: fixture.ownerA.id }, data: { deletedAt: new Date() } });
    const deletedUser = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(deletedUser.status).toBe(401);

    await prisma.user.update({ where: { id: fixture.ownerA.id }, data: { deletedAt: null } });
    await prisma.organization.update({
      where: { id: fixture.organizationA.id },
      data: { deletedAt: new Date() },
    });
    const deletedOrganization = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(deletedOrganization.status).toBe(401);
  });

  it('18. un rol eliminado invalida las sesiones existentes', async () => {
    const session = await login(fixture.ownerA.email);
    await prisma.role.update({
      where: { id: fixture.ownerA.roleId },
      data: { deletedAt: new Date() },
    });
    const response = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(response.status).toBe(401);
  });

  it('19. no acepta reset-password con una contraseña débil', async () => {
    const rawToken = createOpaqueToken();
    await prisma.passwordResetToken.create({
      data: {
        organizationId: fixture.ownerA.organizationId,
        userId: fixture.ownerA.id,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const response = await api
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, password: 'weak' });
    expect(response.status).toBe(400);
  });

  it('20. registra eventos de seguridad sin almacenar tokens en auditoría', async () => {
    const session = await login(fixture.ownerA.email);
    await api.post('/api/v1/auth/logout').set('Cookie', session.cookie);
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    const serialized = JSON.stringify(logs);

    expect(logs.map((log) => log.action)).toContain('AUTH_LOGIN_SUCCESS');
    expect(logs.map((log) => log.action)).toContain('AUTH_LOGOUT');
    expect(serialized).not.toContain(session.cookie);
    expect(serialized).not.toContain('refreshTokenHash');
  });
});

async function createFixture(database: PrismaClient): Promise<Fixture> {
  const [permissionAudit, permissionContactRead] = await Promise.all([
    database.permission.create({ data: { key: 'audit.read', name: 'Leer auditoría' } }),
    database.permission.create({ data: { key: 'contacts.read', name: 'Leer contactos' } }),
  ]);
  const organizationA = await database.organization.create({
    data: { name: 'Tenant A', slug: `tenant-a-${Date.now()}` },
  });
  const organizationB = await database.organization.create({
    data: { name: 'Tenant B', slug: `tenant-b-${Date.now()}` },
  });
  const ownerRoleA = await database.role.create({
    data: {
      organizationId: organizationA.id,
      name: 'Owner',
      permissions: { connect: [{ id: permissionAudit.id }, { id: permissionContactRead.id }] },
    },
  });
  const viewerRoleA = await database.role.create({
    data: {
      organizationId: organizationA.id,
      name: 'Viewer',
      permissions: { connect: [{ id: permissionContactRead.id }] },
    },
  });
  const ownerRoleB = await database.role.create({
    data: {
      organizationId: organizationB.id,
      name: 'Owner',
      permissions: { connect: [{ id: permissionAudit.id }] },
    },
  });
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const viewerPasswordHash = await hashPassword('ViewerPassword1!');
  const ownerA = await database.user.create({
    data: {
      organizationId: organizationA.id,
      roleId: ownerRoleA.id,
      email: 'owner-a@example.com',
      firstName: 'Owner',
      lastName: 'A',
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });
  const viewerA = await database.user.create({
    data: {
      organizationId: organizationA.id,
      roleId: viewerRoleA.id,
      email: 'viewer-a@example.com',
      firstName: 'Viewer',
      lastName: 'A',
      passwordHash: viewerPasswordHash,
      status: UserStatus.ACTIVE,
    },
  });
  const ownerB = await database.user.create({
    data: {
      organizationId: organizationB.id,
      roleId: ownerRoleB.id,
      email: 'owner-b@example.com',
      firstName: 'Owner',
      lastName: 'B',
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });

  return {
    organizationA,
    organizationB,
    ownerA: {
      id: ownerA.id,
      roleId: ownerRoleA.id,
      organizationId: organizationA.id,
      email: ownerA.email,
    },
    viewerA: {
      id: viewerA.id,
      roleId: viewerRoleA.id,
      organizationId: organizationA.id,
      email: viewerA.email,
    },
    ownerB: {
      id: ownerB.id,
      roleId: ownerRoleB.id,
      organizationId: organizationB.id,
      email: ownerB.email,
    },
  };
}
