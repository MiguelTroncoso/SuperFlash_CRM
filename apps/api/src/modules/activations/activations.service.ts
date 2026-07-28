import { HttpStatus, Injectable } from '@nestjs/common';
import { ActivationStatus, FulfillmentStatus, Prisma, SubscriptionStatus } from '@prisma/client';

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
import { CreateActivationDto, ListActivationsQueryDto } from './dto/activations.dto';

@Injectable()
export class ActivationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    dto: CreateActivationDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    assertNoSecrets(dto.metadata);
    const organizationId = context.user.organizationId;
    const record = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "Fulfillment" WHERE "organizationId" = ${organizationId}::uuid AND id = ${dto.fulfillmentId}::uuid FOR UPDATE`,
      );
      const fulfillment = await transaction.fulfillment.findFirst({
        where: { id: dto.fulfillmentId, organizationId, deletedAt: null },
      });
      if (!fulfillment)
        throw operationsException(
          HttpStatus.NOT_FOUND,
          OPERATIONS_ERROR_CODES.FULFILLMENT_NOT_FOUND,
          'Fulfillment no encontrado.',
        );
      if (fulfillment.status !== FulfillmentStatus.COMPLETED)
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'El fulfillment debe estar completado.',
        );
      const existing = await transaction.activation.findFirst({
        where: {
          organizationId,
          fulfillmentId: dto.fulfillmentId,
          deletedAt: null,
          status: {
            in: [ActivationStatus.PENDING, ActivationStatus.ACTIVE, ActivationStatus.SUSPENDED],
          },
        },
      });
      if (existing) return existing;
      const providerId = fulfillment.providerId;
      if (!providerId)
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.PROVIDER_NOT_FOUND,
          'El fulfillment no tiene proveedor.',
        );
      if (dto.subscriptionId) {
        const subscription = await transaction.subscription.findFirst({
          where: {
            id: dto.subscriptionId,
            organizationId,
            saleId: fulfillment.saleId,
            deletedAt: null,
          },
        });
        if (!subscription)
          throw operationsException(
            HttpStatus.NOT_FOUND,
            OPERATIONS_ERROR_CODES.NOT_FOUND,
            'Suscripción no encontrada.',
          );
      }
      const created = await transaction.activation.create({
        data: {
          organizationId,
          fulfillmentId: dto.fulfillmentId,
          subscriptionId: dto.subscriptionId ?? fulfillment.subscriptionId,
          providerId,
          status: ActivationStatus.PENDING,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          externalReference: dto.externalReference?.trim() ?? null,
          ...(dto.metadata ? { metadata: safeObject(dto.metadata) } : {}),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await transaction.activity.create({
        data: {
          organizationId,
          userId: context.user.userId,
          saleId: fulfillment.saleId,
          type: 'SYSTEM',
          title: 'Activación creada',
          metadata: safeObject({ activationId: created.id, fulfillmentId: dto.fulfillmentId }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'ACTIVATION_CREATED',
        tableName: 'Activation',
        recordId: created.id,
        newValue: safeObject({
          fulfillmentId: dto.fulfillmentId,
          providerId,
          status: created.status,
        }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      await this.event(transaction, 'ActivationCreated', created.id, context, {
        fulfillmentId: dto.fulfillmentId,
        status: created.status,
      });
      return created;
    });
    return this.map(record);
  }

  async list(
    query: ListActivationsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const records = await this.prisma.activation.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.fulfillmentId ? { fulfillmentId: query.fulfillmentId } : {}),
        ...(query.subscriptionId ? { subscriptionId: query.subscriptionId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
    return { data: records.map((record) => this.map(record)) };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const record = await this.prisma.activation.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!record)
      throw operationsException(
        HttpStatus.NOT_FOUND,
        OPERATIONS_ERROR_CODES.ACTIVATION_NOT_FOUND,
        'Activación no encontrada.',
      );
    return this.map(record);
  }

  async transition(
    id: string,
    status: ActivationStatus,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    const record = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "Activation" WHERE "organizationId" = ${context.user.organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`,
      );
      const current = await transaction.activation.findFirst({
        where: { id, organizationId: context.user.organizationId, deletedAt: null },
      });
      if (!current)
        throw operationsException(
          HttpStatus.NOT_FOUND,
          OPERATIONS_ERROR_CODES.ACTIVATION_NOT_FOUND,
          'Activación no encontrada.',
        );
      const allowed: Record<ActivationStatus, ActivationStatus[]> = {
        PENDING: [ActivationStatus.ACTIVE, ActivationStatus.FAILED, ActivationStatus.REVOKED],
        ACTIVE: [ActivationStatus.SUSPENDED, ActivationStatus.EXPIRED, ActivationStatus.REVOKED],
        SUSPENDED: [ActivationStatus.ACTIVE, ActivationStatus.REVOKED],
        EXPIRED: [ActivationStatus.REVOKED],
        REVOKED: [],
        FAILED: [ActivationStatus.PENDING],
      };
      if (!allowed[current.status].includes(status) && current.status !== status)
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'Transición de activación no válida.',
        );
      const updated = await transaction.activation.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status,
          activatedAt:
            status === ActivationStatus.ACTIVE
              ? (current.activatedAt ?? new Date())
              : current.activatedAt,
        },
      });
      if (status === ActivationStatus.ACTIVE && updated.subscriptionId)
        await transaction.subscription.updateMany({
          where: {
            organizationId: context.user.organizationId,
            id: updated.subscriptionId,
            status: { in: [SubscriptionStatus.PENDING, SubscriptionStatus.SUSPENDED] },
          },
          data: { status: SubscriptionStatus.ACTIVE, activatedAt: new Date() },
        });
      if (status === ActivationStatus.SUSPENDED && updated.subscriptionId)
        await transaction.subscription.updateMany({
          where: {
            organizationId: context.user.organizationId,
            id: updated.subscriptionId,
            status: SubscriptionStatus.ACTIVE,
          },
          data: { status: SubscriptionStatus.SUSPENDED },
        });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          type: 'SYSTEM',
          title: `Activación ${status.toLowerCase()}`,
          metadata: safeObject({ activationId: id, status }),
          requestId: context.metadata.requestId ?? null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: `ACTIVATION_${status}`,
        tableName: 'Activation',
        recordId: id,
        previousValue: safeObject({ status: current.status }),
        newValue: safeObject({ status }),
        ip: context.metadata.ipAddress,
        requestId: context.metadata.requestId,
      });
      const event =
        status === ActivationStatus.ACTIVE
          ? 'ActivationActivated'
          : status === ActivationStatus.SUSPENDED
            ? 'ActivationSuspended'
            : status === ActivationStatus.REVOKED
              ? 'ActivationRevoked'
              : null;
      if (event) await this.event(transaction, event, id, context, { status });
      return updated;
    });
    return this.map(record);
  }

  private async event(
    transaction: Prisma.TransactionClient,
    eventType:
      'ActivationCreated' | 'ActivationActivated' | 'ActivationSuspended' | 'ActivationRevoked',
    id: string,
    context: OperationsRequestContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.outbox.enqueueWithClient(transaction, {
      eventType,
      organizationId: context.user.organizationId,
      aggregateType: 'Activation',
      aggregateId: id,
      actorId: context.user.userId,
      requestId: context.metadata.requestId ?? id,
      payload: safeObject(payload),
    });
  }
  private map(record: {
    id: string;
    fulfillmentId: string;
    subscriptionId: string | null;
    providerId: string;
    status: ActivationStatus;
    activatedAt: Date | null;
    expiresAt: Date | null;
    externalReference: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): Record<string, unknown> {
    return {
      id: record.id,
      fulfillmentId: record.fulfillmentId,
      subscriptionId: record.subscriptionId,
      providerId: record.providerId,
      status: record.status,
      activatedAt: record.activatedAt,
      expiresAt: record.expiresAt,
      externalReference: record.externalReference,
      metadata: record.metadata,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
