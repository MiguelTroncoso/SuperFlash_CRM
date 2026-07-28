import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  FulfillmentExecutionMode,
  FulfillmentStatus,
  Prisma,
  ProviderStatus,
  SaleStatus,
  ProvisioningAttemptStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { CommercialEventName } from '../../infrastructure/events/application-event-bus';
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
import { ProvidersService } from '../providers/providers.service';
import {
  ProviderAdapterResolver,
  PROVIDER_ADAPTER_RESOLVER,
} from './adapters/provider-adapter.registry';
import { ProvisioningResult } from './adapters/provider-adapter';
import {
  AssignFulfillmentDto,
  CompleteFulfillmentDto,
  CreateFulfillmentDto,
  FailFulfillmentDto,
  ListFulfillmentsQueryDto,
  ListProvisioningAttemptsQueryDto,
  ProvisionFulfillmentDto,
} from './dto/fulfillment.dto';

type FulfillmentRecord = Prisma.FulfillmentGetPayload<Prisma.FulfillmentDefaultArgs>;

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function requestKey(context: OperationsRequestContext): string {
  return context.metadata.requestId ?? randomUUID();
}

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly providers: ProvidersService,
    @Inject(PROVIDER_ADAPTER_RESOLVER) private readonly adapters: ProviderAdapterResolver,
  ) {}

  async create(
    dto: CreateFulfillmentDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    const organizationId = context.user.organizationId;
    const requestId = requestKey(context);
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const saleItem = await transaction.saleItem.findFirst({
          where: { id: dto.saleItemId, organizationId, deletedAt: null },
          include: { sale: true },
        });
        if (!saleItem)
          throw operationsException(
            HttpStatus.NOT_FOUND,
            OPERATIONS_ERROR_CODES.FULFILLMENT_NOT_FOUND,
            'Ítem de venta no encontrado.',
          );
        if (
          saleItem.sale.status !== SaleStatus.CONFIRMED &&
          saleItem.sale.status !== SaleStatus.FULFILLED
        )
          throw operationsException(
            HttpStatus.CONFLICT,
            OPERATIONS_ERROR_CODES.INVALID_STATE,
            'La venta no está lista para fulfillment.',
          );
        await this.lockSaleItem(transaction, organizationId, saleItem.id);
        if (dto.idempotencyKey) {
          const keyed = await transaction.fulfillment.findUnique({
            where: {
              organizationId_idempotencyKey: {
                organizationId,
                idempotencyKey: dto.idempotencyKey,
              },
            },
          });
          if (
            keyed &&
            (keyed.saleItemId !== dto.saleItemId ||
              keyed.providerId !== (dto.providerId ?? keyed.providerId) ||
              keyed.subscriptionId !== (dto.subscriptionId ?? null))
          )
            throw operationsException(
              HttpStatus.CONFLICT,
              OPERATIONS_ERROR_CODES.CONFLICT,
              'La idempotency key ya fue utilizada con otro payload.',
            );
          if (keyed) return keyed;
        }
        const identityKey = `${saleItem.id}:${dto.subscriptionId ?? 'one-time'}`;
        const existing = await transaction.fulfillment.findUnique({
          where: { organizationId_identityKey: { organizationId, identityKey } },
        });
        if (existing && !existing.deletedAt) return existing;
        const providerId =
          dto.providerId ??
          (
            await this.providers.resolveMapping(
              organizationId,
              saleItem.productId ?? '',
              saleItem.planId,
              saleItem.variantId,
            )
          )?.providerId ??
          null;
        const provider = providerId
          ? await transaction.provider.findFirst({
              where: { id: providerId, organizationId, deletedAt: null },
            })
          : null;
        if (dto.providerId && !provider)
          throw operationsException(
            HttpStatus.NOT_FOUND,
            OPERATIONS_ERROR_CODES.PROVIDER_NOT_FOUND,
            'Proveedor no encontrado.',
          );
        if (provider && provider.status !== ProviderStatus.ACTIVE)
          throw operationsException(
            HttpStatus.CONFLICT,
            OPERATIONS_ERROR_CODES.PROVIDER_INACTIVE,
            'El proveedor no está activo.',
          );
        if (dto.assignedUserId) {
          const assignee = await transaction.user.findFirst({
            where: {
              id: dto.assignedUserId,
              organizationId,
              status: 'ACTIVE',
              deletedAt: null,
              role: { deletedAt: null },
            },
          });
          if (!assignee)
            throw operationsException(
              HttpStatus.CONFLICT,
              OPERATIONS_ERROR_CODES.CONFLICT,
              'El responsable no es válido.',
            );
        }
        if (dto.subscriptionId) {
          const subscription = await transaction.subscription.findFirst({
            where: {
              id: dto.subscriptionId,
              organizationId,
              saleId: saleItem.saleId,
              saleItemId: saleItem.id,
              deletedAt: null,
            },
          });
          if (!subscription)
            throw operationsException(
              HttpStatus.CONFLICT,
              OPERATIONS_ERROR_CODES.CONFLICT,
              'La suscripción no pertenece al ítem de venta.',
            );
        }
        const snapshot = this.snapshotForFulfillment(saleItem);
        const fulfillment = await transaction.fulfillment.create({
          data: {
            organizationId,
            saleId: saleItem.saleId,
            saleItemId: saleItem.id,
            subscriptionId: dto.subscriptionId ?? null,
            providerId,
            assignedUserId: dto.assignedUserId ?? null,
            status:
              dto.providerId || providerId ? FulfillmentStatus.ASSIGNED : FulfillmentStatus.PENDING,
            mode:
              dto.mode ??
              (provider?.fulfillmentMode === 'DIGITAL_DELIVERY'
                ? FulfillmentExecutionMode.DIGITAL_DELIVERY
                : provider?.fulfillmentMode === 'AUTOMATIC'
                  ? FulfillmentExecutionMode.AUTOMATIC
                  : FulfillmentExecutionMode.MANUAL),
            quantity: saleItem.quantity,
            identityKey,
            idempotencyKey: dto.idempotencyKey ?? null,
            requestSnapshot: snapshot,
            attemptCount: 0,
            requestId,
            assignedAt: providerId ? new Date() : null,
          },
        });
        await transaction.activity.create({
          data: {
            organizationId,
            userId: context.user.userId,
            contactId: saleItem.sale.contactId,
            opportunityId: saleItem.sale.opportunityId,
            saleId: saleItem.saleId,
            type: 'SYSTEM',
            title: 'Fulfillment creado',
            metadata: safeObject({ fulfillmentId: fulfillment.id, status: fulfillment.status }),
            requestId,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'FULFILLMENT_CREATED',
          tableName: 'Fulfillment',
          recordId: fulfillment.id,
          newValue: safeObject({
            saleId: fulfillment.saleId,
            saleItemId: fulfillment.saleItemId,
            providerId: fulfillment.providerId,
            status: fulfillment.status,
          }),
          ip: context.metadata.ipAddress,
          requestId,
        });
        await this.event(transaction, 'FulfillmentCreated', fulfillment.id, context, requestId, {
          status: fulfillment.status,
          saleId: fulfillment.saleId,
          saleItemId: fulfillment.saleItemId,
        });
        return fulfillment;
      });
      return this.map(result);
    } catch (error: unknown) {
      if (isUnique(error)) {
        if (dto.idempotencyKey) {
          const keyed = await this.prisma.fulfillment.findUnique({
            where: {
              organizationId_idempotencyKey: {
                organizationId,
                idempotencyKey: dto.idempotencyKey,
              },
            },
          });
          if (
            keyed &&
            (keyed.saleItemId !== dto.saleItemId ||
              keyed.providerId !== (dto.providerId ?? keyed.providerId) ||
              keyed.subscriptionId !== (dto.subscriptionId ?? null))
          )
            throw operationsException(
              HttpStatus.CONFLICT,
              OPERATIONS_ERROR_CODES.CONFLICT,
              'La idempotency key ya fue utilizada con otro payload.',
            );
          if (keyed) return this.map(keyed);
        }
        const existing = await this.prisma.fulfillment.findUnique({
          where: {
            organizationId_identityKey: {
              organizationId,
              identityKey: `${dto.saleItemId}:${dto.subscriptionId ?? 'one-time'}`,
            },
          },
        });
        if (existing) return this.map(existing);
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.FULFILLMENT_DUPLICATE,
          'El fulfillment ya existe.',
        );
      }
      throw error;
    }
  }

  async list(
    query: ListFulfillmentsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const where: Prisma.FulfillmentWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
      ...(query.providerId ? { providerId: query.providerId } : {}),
      ...(query.search
        ? {
            OR: [
              { identityKey: { contains: query.search, mode: 'insensitive' } },
              { failureReason: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.fulfillment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.fulfillment.count({ where }),
    ]);
    return {
      data: records.map((record) => this.map(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const record = await this.prisma.fulfillment.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: {
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 10,
          select: {
            id: true,
            attemptNumber: true,
            status: true,
            errorCode: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
          },
        },
        provider: { select: { id: true, name: true, type: true, status: true } },
      },
    });
    if (!record)
      throw operationsException(
        HttpStatus.NOT_FOUND,
        OPERATIONS_ERROR_CODES.FULFILLMENT_NOT_FOUND,
        'Fulfillment no encontrado.',
      );
    return { ...this.map(record), provider: record.provider, attempts: record.attempts };
  }

  async assign(
    id: string,
    dto: AssignFulfillmentDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    const organizationId = context.user.organizationId;
    const requestId = requestKey(context);
    const fulfillment = await this.prisma.$transaction(async (transaction) => {
      const current = await this.lockFulfillment(transaction, organizationId, id);
      if (
        current.status === FulfillmentStatus.COMPLETED ||
        current.status === FulfillmentStatus.CANCELLED
      )
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'El fulfillment no admite nuevas asignaciones.',
        );
      const providerId = dto.providerId ?? current.providerId;
      if (providerId) {
        const provider = await transaction.provider.findFirst({
          where: { id: providerId, organizationId, deletedAt: null, status: ProviderStatus.ACTIVE },
        });
        if (!provider)
          throw operationsException(
            HttpStatus.CONFLICT,
            OPERATIONS_ERROR_CODES.PROVIDER_INACTIVE,
            'El proveedor no está activo o no pertenece a la organización.',
          );
      }
      if (dto.assignedUserId) {
        const user = await transaction.user.findFirst({
          where: {
            id: dto.assignedUserId,
            organizationId,
            deletedAt: null,
            status: 'ACTIVE',
            role: { deletedAt: null },
          },
        });
        if (!user)
          throw operationsException(
            HttpStatus.CONFLICT,
            OPERATIONS_ERROR_CODES.CONFLICT,
            'El responsable no es válido.',
          );
      }
      const updated = await transaction.fulfillment.update({
        where: { organizationId_id: { organizationId, id } },
        data: {
          providerId,
          ...(dto.assignedUserId !== undefined
            ? {
                assignedUserId: dto.assignedUserId,
                assignedAt: dto.assignedUserId ? new Date() : null,
              }
            : {}),
          status: providerId ? FulfillmentStatus.ASSIGNED : FulfillmentStatus.PENDING,
        },
      });
      await transaction.activity.create({
        data: {
          organizationId,
          userId: context.user.userId,
          saleId: updated.saleId,
          type: 'SYSTEM',
          title: 'Fulfillment asignado',
          metadata: safeObject({ fulfillmentId: id, providerId: providerId ?? null }),
          requestId,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'FULFILLMENT_ASSIGNED',
        tableName: 'Fulfillment',
        recordId: id,
        previousValue: safeObject({ providerId: current.providerId }),
        newValue: safeObject({ providerId }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.event(transaction, 'FulfillmentAssigned', id, context, requestId, {
        providerId: providerId ?? null,
      });
      return updated;
    });
    return this.map(fulfillment);
  }

  async start(id: string, context: OperationsRequestContext): Promise<Record<string, unknown>> {
    const requestId = requestKey(context);
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await this.lockFulfillment(transaction, context.user.organizationId, id);
      if (
        current.status !== FulfillmentStatus.PENDING &&
        current.status !== FulfillmentStatus.ASSIGNED &&
        current.status !== FulfillmentStatus.FAILED
      )
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'El fulfillment no puede iniciarse en su estado actual.',
        );
      const updated = await transaction.fulfillment.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status: FulfillmentStatus.PROCESSING,
          startedAt: current.startedAt ?? new Date(),
          attemptCount: { increment: 1 },
          requestId,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FULFILLMENT_STARTED',
        tableName: 'Fulfillment',
        recordId: id,
        newValue: safeObject({ status: updated.status }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.event(transaction, 'FulfillmentStarted', id, context, requestId, {
        status: updated.status,
      });
      return updated;
    });
    return this.map(record);
  }

  async complete(
    id: string,
    dto: CompleteFulfillmentDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    assertNoSecrets(dto.resultSnapshot);
    const requestId = requestKey(context);
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await this.lockFulfillment(transaction, context.user.organizationId, id);
      if (
        current.status !== FulfillmentStatus.PROCESSING &&
        current.status !== FulfillmentStatus.ASSIGNED &&
        current.status !== FulfillmentStatus.PENDING
      )
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'El fulfillment no puede completarse en su estado actual.',
        );
      const updated = await transaction.fulfillment.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status: FulfillmentStatus.COMPLETED,
          resultSnapshot: dto.resultSnapshot ? safeObject(dto.resultSnapshot) : Prisma.JsonNull,
          completedAt: new Date(),
          failureReason: null,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FULFILLMENT_COMPLETED',
        tableName: 'Fulfillment',
        recordId: id,
        newValue: safeObject({ status: updated.status }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          saleId: updated.saleId,
          type: 'SYSTEM',
          title: 'Fulfillment completado',
          metadata: safeObject({ fulfillmentId: id }),
          requestId,
        },
      });
      await this.event(transaction, 'FulfillmentCompleted', id, context, requestId, {
        status: updated.status,
      });
      return updated;
    });
    return this.map(record);
  }

  async fail(
    id: string,
    dto: FailFulfillmentDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    const requestId = requestKey(context);
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await this.lockFulfillment(transaction, context.user.organizationId, id);
      if (
        current.status === FulfillmentStatus.COMPLETED ||
        current.status === FulfillmentStatus.CANCELLED
      )
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'El fulfillment no puede fallar en su estado actual.',
        );
      const updated = await transaction.fulfillment.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status: FulfillmentStatus.FAILED,
          failureReason: dto.reason.trim(),
          failedAt: new Date(),
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FULFILLMENT_FAILED',
        tableName: 'Fulfillment',
        recordId: id,
        newValue: safeObject({ status: updated.status, errorCode: dto.errorCode ?? null }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.event(transaction, 'FulfillmentFailed', id, context, requestId, {
        status: updated.status,
        errorCode: dto.errorCode ?? null,
      });
      return updated;
    });
    return this.map(record);
  }

  async cancel(id: string, context: OperationsRequestContext): Promise<Record<string, unknown>> {
    const requestId = requestKey(context);
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await this.lockFulfillment(transaction, context.user.organizationId, id);
      if (current.status === FulfillmentStatus.COMPLETED)
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'No se puede cancelar un fulfillment completado.',
        );
      if (current.status === FulfillmentStatus.CANCELLED) return current;
      const updated = await transaction.fulfillment.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { status: FulfillmentStatus.CANCELLED, cancelledAt: new Date() },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FULFILLMENT_CANCELLED',
        tableName: 'Fulfillment',
        recordId: id,
        previousValue: safeObject({ status: current.status }),
        newValue: safeObject({ status: updated.status }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      return updated;
    });
    return this.map(record);
  }

  async provision(
    id: string,
    dto: ProvisionFulfillmentDto,
    context: OperationsRequestContext,
  ): Promise<Record<string, unknown>> {
    const organizationId = context.user.organizationId;
    const requestId = requestKey(context);
    const started = await this.prisma.$transaction(async (transaction) => {
      const current = await this.lockFulfillment(transaction, organizationId, id);
      if (
        current.status !== FulfillmentStatus.PENDING &&
        current.status !== FulfillmentStatus.ASSIGNED &&
        current.status !== FulfillmentStatus.FAILED
      ) {
        if (current.status === FulfillmentStatus.COMPLETED) return { current, attempt: null };
        throw operationsException(
          HttpStatus.CONFLICT,
          OPERATIONS_ERROR_CODES.INVALID_STATE,
          'El fulfillment no puede provisionarse en su estado actual.',
        );
      }
      if (dto.idempotencyKey) {
        const existing = await transaction.provisioningAttempt.findFirst({
          where: { organizationId, fulfillmentId: id, requestId: dto.idempotencyKey },
          orderBy: { attemptNumber: 'desc' },
        });
        if (existing) return { current, attempt: null };
      }
      const provider = current.providerId
        ? await transaction.provider.findFirst({
            where: { id: current.providerId, organizationId, deletedAt: null },
          })
        : null;
      const attemptNumber = current.attemptCount + 1;
      await transaction.fulfillment.update({
        where: { organizationId_id: { organizationId, id } },
        data: {
          status: FulfillmentStatus.PROCESSING,
          attemptCount: { increment: 1 },
          startedAt: current.startedAt ?? new Date(),
          requestId,
        },
      });
      return {
        current: { ...current, status: FulfillmentStatus.PROCESSING, attemptCount: attemptNumber },
        attemptNumber,
        provider,
      };
    });
    if (!started.attemptNumber) return this.map(started.current);
    const provider = 'provider' in started ? started.provider : null;
    const adapter = this.adapters.resolve(provider ?? null);
    let result: ProvisioningResult;
    try {
      await adapter.validateConfiguration(provider ?? null);
      result = await adapter.provision(
        {
          snapshot: this.jsonRecord(started.current.requestSnapshot),
          quantity: started.current.quantity.toString(),
          context: {
            organizationId,
            providerId: started.current.providerId,
            fulfillmentId: id,
            requestId,
          },
        },
        provider ?? null,
      );
    } catch (error: unknown) {
      result = {
        success: false,
        retryable: true,
        errorCode: 'ADAPTER_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Adapter error',
      };
    }
    return this.finalizeProvisioning(
      id,
      started.attemptNumber,
      result,
      context,
      requestId,
      started.current.requestSnapshot,
    );
  }

  async listAttempts(
    query: ListProvisioningAttemptsQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const records = await this.prisma.provisioningAttempt.findMany({
      where: {
        organizationId: user.organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.fulfillmentId ? { fulfillmentId: query.fulfillmentId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        fulfillmentId: true,
        providerId: true,
        attemptNumber: true,
        requestId: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
      },
    });
    return { data: records };
  }

  private async finalizeProvisioning(
    id: string,
    attemptNumber: number,
    result: ProvisioningResult,
    context: OperationsRequestContext,
    requestId: string,
    requestSnapshot: Prisma.JsonValue,
  ): Promise<Record<string, unknown>> {
    const record = await this.prisma.$transaction(async (transaction) => {
      const current = await this.lockFulfillment(transaction, context.user.organizationId, id);
      const attemptStatus = result.success
        ? ProvisioningAttemptStatus.SUCCEEDED
        : result.retryable
          ? ProvisioningAttemptStatus.RETRYABLE
          : ProvisioningAttemptStatus.FAILED;
      const attempt = await transaction.provisioningAttempt.create({
        data: {
          organizationId: context.user.organizationId,
          fulfillmentId: id,
          providerId: current.providerId,
          attemptNumber,
          requestId,
          requestPayload: requestSnapshot as Prisma.InputJsonValue,
          responsePayload: result.resultSnapshot
            ? safeObject(result.resultSnapshot)
            : Prisma.JsonNull,
          status: attemptStatus,
          errorCode: result.errorCode ?? null,
          errorMessage: result.errorMessage ?? null,
          startedAt: current.startedAt,
          finishedAt: new Date(),
        },
      });
      const status = result.success ? FulfillmentStatus.COMPLETED : FulfillmentStatus.FAILED;
      const updated = await transaction.fulfillment.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: {
          status,
          resultSnapshot: result.resultSnapshot
            ? safeObject(result.resultSnapshot)
            : Prisma.JsonNull,
          failureReason: result.errorMessage ?? null,
          completedAt: result.success ? new Date() : null,
          failedAt: result.success ? null : new Date(),
        },
      });
      const eventName: CommercialEventName = result.success
        ? 'ProvisioningSucceeded'
        : 'ProvisioningFailed';
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: result.success ? 'PROVISIONING_SUCCEEDED' : 'PROVISIONING_FAILED',
        tableName: 'ProvisioningAttempt',
        recordId: attempt.id,
        newValue: safeObject({
          status: attemptStatus,
          fulfillmentId: id,
          errorCode: result.errorCode ?? null,
        }),
        ip: context.metadata.ipAddress,
        requestId,
      });
      await this.event(transaction, 'ProvisioningAttemptCreated', attempt.id, context, requestId, {
        fulfillmentId: id,
        attemptNumber,
        status: attemptStatus,
      });
      await this.event(transaction, eventName, attempt.id, context, requestId, {
        fulfillmentId: id,
        status: attemptStatus,
        errorCode: result.errorCode ?? null,
      });
      if (result.success)
        await this.event(transaction, 'FulfillmentCompleted', id, context, requestId, {
          status: updated.status,
        });
      else
        await this.event(transaction, 'FulfillmentFailed', id, context, requestId, {
          status: updated.status,
          errorCode: result.errorCode ?? null,
        });
      void current;
      return updated;
    });
    return this.map(record);
  }

  private async lockSaleItem(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM "SaleItem" WHERE "organizationId" = ${organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`,
    );
  }
  private async lockFulfillment(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<FulfillmentRecord> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM "Fulfillment" WHERE "organizationId" = ${organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`,
    );
    const record = await transaction.fulfillment.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!record)
      throw operationsException(
        HttpStatus.NOT_FOUND,
        OPERATIONS_ERROR_CODES.FULFILLMENT_NOT_FOUND,
        'Fulfillment no encontrado.',
      );
    return record;
  }

  private snapshotForFulfillment(item: {
    snapshotVersion: number;
    catalogSnapshot: Prisma.JsonValue;
    productNameSnapshot: string;
    skuSnapshot: string | null;
    quantity: Prisma.Decimal;
    currency: string;
  }): Prisma.InputJsonValue {
    return {
      snapshotVersion: item.snapshotVersion,
      catalogSnapshot: item.catalogSnapshot as Prisma.InputJsonValue,
      productName: item.productNameSnapshot,
      sku: item.skuSnapshot,
      quantity: item.quantity.toString(),
      currency: item.currency,
    };
  }

  private jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
  private async event(
    transaction: Prisma.TransactionClient,
    eventType: CommercialEventName,
    aggregateId: string,
    context: OperationsRequestContext,
    requestId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.outbox.enqueueWithClient(transaction, {
      eventType,
      organizationId: context.user.organizationId,
      aggregateType: eventType.startsWith('Provisioning') ? 'ProvisioningAttempt' : 'Fulfillment',
      aggregateId,
      actorId: context.user.userId,
      requestId,
      payload: safeObject(payload),
    });
  }
  private map(item: FulfillmentRecord): Record<string, unknown> {
    return {
      id: item.id,
      saleId: item.saleId,
      saleItemId: item.saleItemId,
      subscriptionId: item.subscriptionId,
      providerId: item.providerId,
      assignedUserId: item.assignedUserId,
      status: item.status,
      mode: item.mode,
      quantity: item.quantity.toString(),
      requestSnapshot: item.requestSnapshot,
      resultSnapshot: item.resultSnapshot,
      failureReason: item.failureReason,
      attemptCount: item.attemptCount,
      assignedAt: item.assignedAt,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      failedAt: item.failedAt,
      cancelledAt: item.cancelledAt,
      requestId: item.requestId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
