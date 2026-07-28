import { HttpStatus, Injectable } from '@nestjs/common';
import { CredentialStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { operationsException, OPERATIONS_ERROR_CODES } from '../operations/operations.errors';
import {
  assertNoSecrets,
  OperationsRequestContext,
  safeObject,
} from '../operations/operations.types';
import { CreateCredentialDto, ListCredentialsQueryDto } from './dto/credentials.dto';
import { CredentialEncryptionService } from './credential-encryption.service';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: CredentialEncryptionService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    dto: CreateCredentialDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    assertNoSecrets(dto.metadata);
    if (!dto.username && !dto.password && !dto.url && !dto.token)
      throw operationsException(
        HttpStatus.BAD_REQUEST,
        OPERATIONS_ERROR_CODES.CREDENTIAL_INVALID,
        'Debe existir al menos un valor de credencial.',
      );
    const organizationId = context.user.organizationId;
    const relations = await this.assertRelations(dto, organizationId);
    const credential = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.credentialRecord.create({
        data: {
          organizationId,
          fulfillmentId: dto.fulfillmentId ?? null,
          activationId: dto.activationId ?? null,
          subscriptionId: dto.subscriptionId ?? null,
          credentialKey: `${relations.fulfillmentId ?? relations.activationId ?? relations.subscriptionId ?? 'credential'}:${randomUUID()}`,
          encryptedUsername: this.encryption.encrypt(dto.username ?? ''),
          encryptedPassword: this.encryption.encrypt(dto.password ?? ''),
          encryptedUrl: this.encryption.encrypt(dto.url ?? ''),
          encryptedToken: dto.token ? this.encryption.encrypt(dto.token) : null,
          expiration: dto.expiresAt ? new Date(dto.expiresAt) : null,
          instructions: dto.instructions?.trim() ?? null,
          ...(dto.metadata ? { metadata: safeObject(dto.metadata) } : {}),
          keyVersion: 1,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'CREDENTIAL_CREATED',
        tableName: 'CredentialRecord',
        recordId: created.id,
        newValue: safeObject({
          credentialId: created.id,
          fulfillmentId: created.fulfillmentId,
          activationId: created.activationId,
          subscriptionId: created.subscriptionId,
        }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'CredentialCreated',
        organizationId,
        aggregateType: 'CredentialRecord',
        aggregateId: created.id,
        actorId: context.user.userId,
        requestId: context.metadata.requestId ?? created.id,
        payload: safeObject({ credentialId: created.id }),
      });
      return created;
    });
    return this.mapMasked(credential);
  }

  async list(
    query: ListCredentialsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const records = await this.prisma.credentialRecord.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(query.fulfillmentId ? { fulfillmentId: query.fulfillmentId } : {}),
        ...(query.activationId ? { activationId: query.activationId } : {}),
        ...(query.subscriptionId ? { subscriptionId: query.subscriptionId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { data: records.map((item) => this.mapMasked(item)) };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const record = await this.prisma.credentialRecord.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!record)
      throw operationsException(
        HttpStatus.NOT_FOUND,
        OPERATIONS_ERROR_CODES.CREDENTIAL_NOT_FOUND,
        'Credencial no encontrada.',
      );
    return this.mapMasked(record);
  }

  async reveal(id: string, context: OperationsRequestContext): Promise<Record<string, unknown>> {
    const organizationId = context.user.organizationId;
    const record = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "CredentialRecord" WHERE "organizationId" = ${organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`,
      );
      const current = await transaction.credentialRecord.findFirst({
        where: { id, organizationId, deletedAt: null },
      });
      if (!current)
        throw operationsException(
          HttpStatus.NOT_FOUND,
          OPERATIONS_ERROR_CODES.CREDENTIAL_NOT_FOUND,
          'Credencial no encontrada.',
        );
      if (
        current.status !== CredentialStatus.ACTIVE ||
        (current.expiration && current.expiration <= new Date())
      )
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.CREDENTIAL_INVALID,
          'La credencial no está vigente.',
        );
      await transaction.credentialRecord.update({
        where: { organizationId_id: { organizationId, id } },
        data: {
          lastRevealedAt: new Date(),
          revealCount: { increment: 1 },
          revealedByUserId: context.user.userId,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'CREDENTIAL_REVEALED',
        tableName: 'CredentialRecord',
        recordId: id,
        newValue: safeObject({ credentialId: id, revealed: true }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.outbox.enqueueWithClient(transaction, {
        eventType: 'CredentialRevealed',
        organizationId,
        aggregateType: 'CredentialRecord',
        aggregateId: id,
        actorId: context.user.userId,
        requestId: context.metadata.requestId ?? id,
        payload: safeObject({ credentialId: id, action: 'reveal' }),
      });
      return current;
    });
    return {
      id: record.id,
      username: record.encryptedUsername ? this.encryption.decrypt(record.encryptedUsername) : null,
      password: record.encryptedPassword ? this.encryption.decrypt(record.encryptedPassword) : null,
      url: record.encryptedUrl ? this.encryption.decrypt(record.encryptedUrl) : null,
      token: record.encryptedToken ? this.encryption.decrypt(record.encryptedToken) : null,
      expiresAt: record.expiration,
      instructions: record.instructions,
    };
  }

  async revoke(id: string, context: OperationsRequestContext): Promise<void> {
    await this.prisma.credentialRecord.updateMany({
      where: { id, organizationId: context.user.organizationId, deletedAt: null },
      data: { status: CredentialStatus.REVOKED, revokedAt: new Date() },
    });
    await this.audit.record({
      organizationId: context.user.organizationId,
      userId: context.user.userId,
      action: 'CREDENTIAL_REVOKED',
      tableName: 'CredentialRecord',
      recordId: id,
      newValue: safeObject({ status: CredentialStatus.REVOKED }),
      ip: context.metadata.ipAddress,
      requestId: context.metadata.requestId,
    });
  }

  private async assertRelations(
    dto: CreateCredentialDto,
    organizationId: string,
  ): Promise<{
    fulfillmentId: string | null;
    activationId: string | null;
    subscriptionId: string | null;
  }> {
    if (dto.fulfillmentId) {
      const item = await this.prisma.fulfillment.findFirst({
        where: { id: dto.fulfillmentId, organizationId, deletedAt: null },
      });
      if (!item)
        throw operationsException(
          HttpStatus.NOT_FOUND,
          OPERATIONS_ERROR_CODES.FULFILLMENT_NOT_FOUND,
          'Fulfillment no encontrado.',
        );
    }
    if (dto.activationId) {
      const item = await this.prisma.activation.findFirst({
        where: { id: dto.activationId, organizationId, deletedAt: null },
      });
      if (!item)
        throw operationsException(
          HttpStatus.NOT_FOUND,
          OPERATIONS_ERROR_CODES.ACTIVATION_NOT_FOUND,
          'Activación no encontrada.',
        );
    }
    if (dto.subscriptionId) {
      const item = await this.prisma.subscription.findFirst({
        where: { id: dto.subscriptionId, organizationId, deletedAt: null },
      });
      if (!item)
        throw operationsException(
          HttpStatus.NOT_FOUND,
          OPERATIONS_ERROR_CODES.NOT_FOUND,
          'Suscripción no encontrada.',
        );
    }
    return {
      fulfillmentId: dto.fulfillmentId ?? null,
      activationId: dto.activationId ?? null,
      subscriptionId: dto.subscriptionId ?? null,
    };
  }

  private mapMasked(record: {
    id: string;
    fulfillmentId: string | null;
    activationId: string | null;
    subscriptionId: string | null;
    expiration: Date | null;
    instructions: string | null;
    status: CredentialStatus;
    revealCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): Record<string, unknown> {
    return {
      id: record.id,
      fulfillmentId: record.fulfillmentId,
      activationId: record.activationId,
      subscriptionId: record.subscriptionId,
      username: '••••',
      password: '••••',
      url: '••••',
      token: record.status === CredentialStatus.ACTIVE ? '••••' : null,
      expiresAt: record.expiration,
      instructions: record.instructions,
      status: record.status,
      revealCount: record.revealCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
