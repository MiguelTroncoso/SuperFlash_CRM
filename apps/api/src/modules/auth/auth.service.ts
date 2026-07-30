import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { CookieOptions } from 'express';
import { randomUUID } from 'node:crypto';

import { AppConfiguration } from '../../config/configuration';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { authException, AUTH_ERROR_CODES } from './auth.errors';
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  isOpaqueTokenFormat,
  isStrongPassword,
  normalizeEmail,
  PASSWORD_POLICY_MESSAGE,
  verifyPassword,
} from './auth.crypto';
import { AuthRepository, AuthSessionRecord, AuthUserRecord } from './auth.repository';
import {
  AccessTokenPayload,
  AuthenticatedUser,
  PublicAuthenticatedUser,
  RequestMetadata,
} from './auth.types';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

export const REFRESH_COOKIE_NAME = 'superflash_refresh_token';

export interface AuthTokenResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: PublicAuthenticatedUser;
}

export interface ForgotPasswordResult {
  message: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AuthRepository,
    private readonly audit: AuditService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  getRefreshCookieOptions(): CookieOptions {
    const configuration = this.configuration;
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: configuration.cookieSecure,
      path: '/api/v1/auth',
      maxAge: configuration.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    };
  }

  async login(dto: LoginDto, metadata: RequestMetadata): Promise<AuthTokenResult> {
    const email = normalizeEmail(dto.email);
    const user = await this.repository.findUserByEmail(email);
    const validPassword = await this.verifyLoginPassword(user, dto.password);

    if (!user || !this.isEligibleUser(user) || !validPassword) {
      await this.recordLoginFailure(user, metadata);
      throw authException(
        HttpStatus.UNAUTHORIZED,
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        'Correo o contraseña incorrectos.',
      );
    }

    const now = new Date();
    const refreshToken = createOpaqueToken();
    const session = await this.repository.createSession({
      organizationId: user.organizationId,
      userId: user.id,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      familyId: randomUUID(),
      ...(metadata.userAgent ? { userAgent: metadata.userAgent } : {}),
      ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
      expiresAt: this.refreshExpiration(now),
      lastUsedAt: now,
    });
    const accessToken = await this.createAccessToken(user, session.id);

    await this.audit.recordSecurity({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      recordId: session.id,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
      metadata: { event: 'login' },
    });

    return {
      accessToken,
      expiresIn: this.configuration.jwtAccessTtlSeconds,
      refreshToken,
      user: this.toPublicUser(user),
    };
  }

  async refresh(
    refreshToken: string | undefined,
    metadata: RequestMetadata,
  ): Promise<AuthTokenResult> {
    if (!refreshToken || !isOpaqueTokenFormat(refreshToken)) {
      throw authException(
        HttpStatus.UNAUTHORIZED,
        AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
        'La sesión de renovación no es válida.',
      );
    }

    const tokenHash = hashOpaqueToken(refreshToken);
    const session = await this.repository.findSessionByRefreshTokenHash(tokenHash);
    if (!session) {
      throw authException(
        HttpStatus.UNAUTHORIZED,
        AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
        'La sesión de renovación no es válida.',
      );
    }

    if (session.revokedAt) {
      await this.handleRefreshReuse(session, metadata);
    }

    if (session.expiresAt <= new Date() || !this.isEligibleUser(session.user)) {
      await this.prisma.authSession.updateMany({
        where: { id: session.id, organizationId: session.organizationId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'EXPIRED_OR_INACTIVE' },
      });
      throw authException(
        HttpStatus.UNAUTHORIZED,
        AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
        'La sesión de renovación ya expiró o no está activa.',
      );
    }

    const now = new Date();
    const nextRefreshToken = createOpaqueToken();
    const nextSessionId = await this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.authSession.updateMany({
        where: {
          id: session.id,
          organizationId: session.organizationId,
          refreshTokenHash: tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokeReason: 'ROTATED',
          lastUsedAt: now,
        },
      });

      if (revoked.count !== 1) {
        return null;
      }

      const nextSession = await transaction.authSession.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          refreshTokenHash: hashOpaqueToken(nextRefreshToken),
          familyId: session.familyId,
          ...(metadata.userAgent ? { userAgent: metadata.userAgent } : {}),
          ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
          expiresAt: this.refreshExpiration(now),
          lastUsedAt: now,
        },
        select: { id: true },
      });

      return nextSession.id;
    });

    if (!nextSessionId) {
      return this.handleRefreshReuse(session, metadata);
    }

    const accessToken = await this.createAccessToken(session.user, nextSessionId);
    await this.audit.recordSecurity({
      organizationId: session.organizationId,
      userId: session.userId,
      action: 'AUTH_REFRESH',
      recordId: nextSessionId,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
      metadata: { event: 'refresh_rotated', familyId: session.familyId },
    });

    return {
      accessToken,
      expiresIn: this.configuration.jwtAccessTtlSeconds,
      refreshToken: nextRefreshToken,
      user: this.toPublicUser(session.user),
    };
  }

  async logout(refreshToken: string | undefined, metadata: RequestMetadata): Promise<void> {
    if (!refreshToken || !isOpaqueTokenFormat(refreshToken)) {
      return;
    }

    const session = await this.repository.findSessionByRefreshTokenHash(
      hashOpaqueToken(refreshToken),
    );
    if (!session || session.revokedAt) {
      return;
    }

    await this.prisma.authSession.updateMany({
      where: { id: session.id, organizationId: session.organizationId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'LOGOUT', lastUsedAt: new Date() },
    });
    await this.audit.recordSecurity({
      organizationId: session.organizationId,
      userId: session.userId,
      action: 'AUTH_LOGOUT',
      recordId: session.id,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
      metadata: { event: 'logout' },
    });
  }

  async logoutAll(authenticatedUser: AuthenticatedUser, metadata: RequestMetadata): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        organizationId: authenticatedUser.organizationId,
        userId: authenticatedUser.userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date(), revokeReason: 'LOGOUT_ALL' },
    });
    await this.audit.recordSecurity({
      organizationId: authenticatedUser.organizationId,
      userId: authenticatedUser.userId,
      action: 'AUTH_LOGOUT_ALL',
      recordId: authenticatedUser.userId,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
      metadata: { event: 'logout_all' },
    });
  }

  async getMe(authenticatedUser: AuthenticatedUser): Promise<PublicAuthenticatedUser> {
    const session = await this.repository.findActiveSession(
      authenticatedUser.sessionId,
      authenticatedUser.organizationId,
      authenticatedUser.userId,
    );
    if (!session || session.user.role.id !== authenticatedUser.roleId) {
      throw authException(
        HttpStatus.UNAUTHORIZED,
        AUTH_ERROR_CODES.UNAUTHORIZED,
        'La sesión ya no está activa.',
      );
    }
    return this.toPublicUser(session.user);
  }

  async updateProfile(
    authenticatedUser: AuthenticatedUser,
    dto: UpdateProfileDto,
    metadata: RequestMetadata,
  ): Promise<PublicAuthenticatedUser> {
    if (dto.firstName !== undefined && dto.firstName.length === 0) {
      throw authException(
        HttpStatus.BAD_REQUEST,
        AUTH_ERROR_CODES.INVALID_REQUEST,
        'El nombre es obligatorio.',
      );
    }
    if (dto.timezone !== undefined) {
      try {
        Intl.DateTimeFormat('en-US', { timeZone: dto.timezone }).format();
      } catch {
        throw authException(
          HttpStatus.BAD_REQUEST,
          AUTH_ERROR_CODES.INVALID_REQUEST,
          'La zona horaria no es válida.',
        );
      }
    }
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.user.findFirst({
        where: {
          id: authenticatedUser.userId,
          organizationId: authenticatedUser.organizationId,
          deletedAt: null,
        },
        select: { firstName: true, lastName: true, phone: true, timezone: true },
      });
      if (!current) {
        throw authException(
          HttpStatus.UNAUTHORIZED,
          AUTH_ERROR_CODES.UNAUTHORIZED,
          'La sesión ya no está activa.',
        );
      }
      const updated = await transaction.user.update({
        where: {
          organizationId_id: {
            organizationId: authenticatedUser.organizationId,
            id: authenticatedUser.userId,
          },
        },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName || null } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        },
        select: { firstName: true, lastName: true, phone: true, timezone: true },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: authenticatedUser.organizationId,
        userId: authenticatedUser.userId,
        action: 'USER_PROFILE_UPDATED',
        tableName: 'User',
        recordId: authenticatedUser.userId,
        previousValue: current,
        newValue: updated,
        requestId: metadata.requestId,
        ip: metadata.ipAddress,
      });
    });
    return this.getMe(authenticatedUser);
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    metadata: RequestMetadata,
  ): Promise<ForgotPasswordResult> {
    const user = await this.repository.findUserByEmail(normalizeEmail(dto.email));
    if (user && this.isEligibleUser(user)) {
      const token = createOpaqueToken();
      await this.prisma.passwordResetToken.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(Date.now() + this.configuration.passwordResetTtlMinutes * 60 * 1000),
        },
      });
      await this.audit.recordSecurity({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        recordId: user.id,
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
        metadata: { event: 'password_reset_requested' },
      });

      if (this.configuration.nodeEnv === 'production') {
        this.logger.log(`Password reset token generated for user ${user.id}.`);
      } else {
        this.logger.warn(`Development password reset token for user ${user.id}: ${token}`);
      }
    }

    return {
      message: 'Si la cuenta existe, recibirás instrucciones para restablecer la contraseña.',
    };
  }

  async resetPassword(dto: ResetPasswordDto, metadata: RequestMetadata): Promise<void> {
    if (!isOpaqueTokenFormat(dto.token) || !isStrongPassword(dto.password)) {
      throw authException(
        HttpStatus.BAD_REQUEST,
        AUTH_ERROR_CODES.INVALID_RESET_TOKEN,
        PASSWORD_POLICY_MESSAGE,
      );
    }

    const tokenHash = hashOpaqueToken(dto.token);
    const resetToken = await this.repository.findResetToken(tokenHash);
    if (!resetToken || !this.isEligibleUser(resetToken.user)) {
      throw authException(
        HttpStatus.BAD_REQUEST,
        AUTH_ERROR_CODES.INVALID_RESET_TOKEN,
        'El token de recuperación no es válido o ya expiró.',
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const marked = await transaction.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          organizationId: resetToken.organizationId,
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (marked.count !== 1) {
        throw authException(
          HttpStatus.BAD_REQUEST,
          AUTH_ERROR_CODES.INVALID_RESET_TOKEN,
          'El token de recuperación no es válido o ya expiró.',
        );
      }

      const updatedUser = await transaction.user.updateMany({
        where: {
          id: resetToken.userId,
          organizationId: resetToken.organizationId,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        data: { passwordHash },
      });
      if (updatedUser.count !== 1) {
        throw authException(
          HttpStatus.BAD_REQUEST,
          AUTH_ERROR_CODES.INVALID_RESET_TOKEN,
          'El token de recuperación no es válido o ya expiró.',
        );
      }

      await transaction.authSession.updateMany({
        where: {
          organizationId: resetToken.organizationId,
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: { revokedAt: now, revokeReason: 'PASSWORD_RESET' },
      });
    });

    await this.audit.recordSecurity({
      organizationId: resetToken.organizationId,
      userId: resetToken.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      recordId: resetToken.id,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
      metadata: { event: 'password_reset_completed' },
    });
  }

  async validateAccessToken(payload: AccessTokenPayload): Promise<AuthenticatedUser | null> {
    const session = await this.repository.findActiveSession(
      payload.sessionId,
      payload.organizationId,
      payload.sub,
    );
    if (!session || !this.isEligibleUser(session.user) || session.user.role.id !== payload.roleId) {
      return null;
    }

    return {
      userId: session.user.id,
      organizationId: session.organizationId,
      sessionId: session.id,
      roleId: session.user.role.id,
      roleName: session.user.role.name,
      permissions: session.user.role.permissions.map((permission) => permission.key),
    };
  }

  private get configuration(): AppConfiguration {
    return this.configService.getOrThrow<AppConfiguration>('app');
  }

  private async verifyLoginPassword(
    user: AuthUserRecord | null,
    password: string,
  ): Promise<boolean> {
    if (!user?.passwordHash) {
      await hashPassword(password);
      return false;
    }

    try {
      return await verifyPassword(user.passwordHash, password);
    } catch {
      return false;
    }
  }

  private isEligibleUser(user: AuthUserRecord): boolean {
    return (
      user.status === UserStatus.ACTIVE &&
      user.deletedAt === null &&
      user.organization.deletedAt === null &&
      user.role.deletedAt === null &&
      user.passwordHash !== null
    );
  }

  private async recordLoginFailure(
    user: AuthUserRecord | null,
    metadata: RequestMetadata,
  ): Promise<void> {
    await this.audit.recordSecurity({
      ...(user
        ? { organizationId: user.organizationId, userId: user.id }
        : { organizationId: undefined, userId: undefined }),
      action: 'AUTH_LOGIN_FAILED',
      recordId: user?.id ?? 'anonymous',
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
      metadata: { event: 'invalid_credentials' },
    });
  }

  private async handleRefreshReuse(
    session: AuthSessionRecord,
    metadata: RequestMetadata,
  ): Promise<never> {
    await this.prisma.authSession.updateMany({
      where: {
        organizationId: session.organizationId,
        familyId: session.familyId,
        revokedAt: null,
      },
      data: { revokedAt: new Date(), revokeReason: 'REFRESH_TOKEN_REUSE_DETECTED' },
    });
    await this.audit.recordSecurity({
      organizationId: session.organizationId,
      userId: session.userId,
      action: 'AUTH_REFRESH_REUSE_DETECTED',
      recordId: session.familyId,
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
      metadata: { event: 'refresh_token_reuse_detected' },
    });
    throw authException(
      HttpStatus.UNAUTHORIZED,
      AUTH_ERROR_CODES.REFRESH_TOKEN_REUSE,
      'La sesión de renovación fue reutilizada y la familia completa fue revocada.',
    );
  }

  private async createAccessToken(user: AuthUserRecord, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      sessionId,
      roleId: user.role.id,
    };
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configuration.jwtAccessTtlSeconds,
    });
  }

  private refreshExpiration(from: Date): Date {
    return new Date(from.getTime() + this.configuration.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  }

  private toPublicUser(user: AuthUserRecord): PublicAuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      timezone: user.timezone ?? 'America/Santiago',
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
      role: {
        id: user.role.id,
        name: user.role.name,
      },
      permissions: user.role.permissions.map((permission) => permission.key),
    };
  }
}
