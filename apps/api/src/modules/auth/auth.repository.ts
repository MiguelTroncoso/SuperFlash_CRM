import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const authUserInclude = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: {
    organization: true,
    role: {
      include: {
        permissions: {
          where: { deletedAt: null },
          orderBy: { key: 'asc' },
        },
      },
    },
  },
});

export type AuthUserRecord = Prisma.UserGetPayload<typeof authUserInclude>;

const sessionInclude = Prisma.validator<Prisma.AuthSessionDefaultArgs>()({
  include: {
    user: {
      ...authUserInclude,
    },
  },
});

export type AuthSessionRecord = Prisma.AuthSessionGetPayload<typeof sessionInclude>;

const resetTokenInclude = Prisma.validator<Prisma.PasswordResetTokenDefaultArgs>()({
  include: {
    user: {
      ...authUserInclude,
    },
  },
});

export type PasswordResetTokenRecord = Prisma.PasswordResetTokenGetPayload<
  typeof resetTokenInclude
>;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findFirst({
      where: { email },
      ...authUserInclude,
    });
  }

  findActiveSession(
    sessionId: string,
    organizationId: string,
    userId: string,
  ): Promise<AuthSessionRecord | null> {
    return this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        organizationId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      ...sessionInclude,
    });
  }

  findSessionByRefreshTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    return this.prisma.authSession.findFirst({
      where: { refreshTokenHash: tokenHash },
      ...sessionInclude,
    });
  }

  createSession(data: Prisma.AuthSessionUncheckedCreateInput): Promise<{ id: string }> {
    return this.prisma.authSession.create({
      data,
      select: { id: true },
    });
  }

  findResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    return this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      ...resetTokenInclude,
    });
  }
}
