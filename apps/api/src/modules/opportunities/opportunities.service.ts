import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityType,
  FollowUpHistoryAction,
  FollowUpPriority,
  FollowUpStatus,
  PipelineStageCategory,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AppConfiguration } from '../../config/configuration';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { ContactAccessPolicy } from '../contacts/access/contact-access.policy';
import { OpportunityAccessPolicy } from './access/opportunity-access.policy';
import {
  OPPORTUNITY_ERROR_CODES,
  PIPELINE_ERROR_CODES,
  opportunityException,
} from './opportunities.errors';
import {
  OpportunityDetailRecord,
  OpportunityListRecord,
  OpportunityMutationRecord,
  OpportunitiesRepository,
  PipelineStageRecord,
} from './opportunities.repository';
import {
  PublicOpportunity,
  PublicOpportunityRelation,
  PublicOpportunityStage,
  PublicOpportunityUser,
  decodeCursor,
  encodeCursor,
  isValidExpectedAmount,
  normalizeCurrency,
  normalizeTitle,
  opportunityStatus,
} from './opportunities.types';
import { AssignOpportunityDto } from './dto/assign-opportunity.dto';
import { ArchiveOpportunityDto } from './dto/archive-opportunity.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { ListOpportunitiesQueryDto, OpportunitySortBy } from './dto/list-opportunities-query.dto';
import { MoveOpportunityDto } from './dto/move-opportunity.dto';
import { PipelineQueryDto } from './dto/pipeline-query.dto';
import { ReopenOpportunityDto } from './dto/reopen-opportunity.dto';
import { ReorderPipelineStageDto } from './dto/reorder-pipeline-stage.dto';
import { StageHistoryQueryDto } from './dto/stage-history-query.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';
import { followUpDaysForState, suggestedFollowUpAt } from './operational-states';

interface OpportunityRequestContext {
  user: AuthenticatedUser;
  metadata: RequestMetadata;
}

interface PublicPipelineStage extends PublicOpportunityStage {
  opportunities: PublicOpportunity[];
  nextCursor: string | null;
}

interface StageSnapshot {
  id: string;
  name: string;
  color: string;
  category: PipelineStageCategory;
}

function displayName(firstName: string | null, lastName: string | null): string | null {
  const value = [firstName, lastName].filter((item): item is string => Boolean(item)).join(' ');
  return value || null;
}

function asInputJson(value: Record<string, string | null>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null),
  ) as Prisma.InputJsonObject;
}

@Injectable()
export class OpportunitiesService {
  private readonly configuration: AppConfiguration;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: OpportunitiesRepository,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly accessPolicy: OpportunityAccessPolicy,
    private readonly contactAccessPolicy: ContactAccessPolicy,
    configService: ConfigService,
  ) {
    this.configuration = configService.getOrThrow<AppConfiguration>('app');
  }

  async create(
    dto: CreateOpportunityDto,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunity> {
    this.accessPolicy.assertCanCreate(context.user);
    const title = this.requireTitle(dto.title);
    const money = this.normalizeMoney(dto.expectedAmount, dto.currency);
    const organizationId = context.user.organizationId;

    try {
      const opportunityId = await this.prisma.$transaction(async (transaction) => {
        const contact = await transaction.contact.findFirst({
          where: { organizationId, id: dto.contactId, deletedAt: null },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            userId: true,
            archivedAt: true,
            deletedAt: true,
          },
        });
        if (!contact) {
          throw opportunityException(
            HttpStatus.NOT_FOUND,
            OPPORTUNITY_ERROR_CODES.CONTACT_NOT_FOUND,
            'El contacto no existe.',
          );
        }

        if (context.user.roleName === 'Sales' && contact.archivedAt) {
          throw opportunityException(
            HttpStatus.FORBIDDEN,
            OPPORTUNITY_ERROR_CODES.CONTACT_ARCHIVED_FORBIDDEN,
            'Un vendedor no puede crear oportunidades para contactos archivados.',
          );
        }
        if (!this.contactAccessPolicy.canCreateOpportunity(context.user, contact)) {
          throw opportunityException(
            HttpStatus.FORBIDDEN,
            OPPORTUNITY_ERROR_CODES.CONTACT_ACCESS_FORBIDDEN,
            'No tienes acceso al contacto para crear esta oportunidad.',
          );
        }

        const assignedUserId =
          dto.assignedUserId !== undefined
            ? (dto.assignedUserId ?? null)
            : (contact.userId ?? (context.user.roleName === 'Sales' ? context.user.userId : null));
        if (context.user.roleName === 'Sales' && assignedUserId !== context.user.userId) {
          throw opportunityException(
            HttpStatus.FORBIDDEN,
            OPPORTUNITY_ERROR_CODES.CONTACT_ACCESS_FORBIDDEN,
            'Un vendedor solo puede asignarse oportunidades a sí mismo.',
          );
        }
        if (assignedUserId) {
          const assignee = await transaction.user.findFirst({
            where: {
              organizationId,
              id: assignedUserId,
              status: 'ACTIVE',
              deletedAt: null,
              role: { deletedAt: null },
            },
            select: { id: true },
          });
          if (!assignee) {
            throw opportunityException(
              HttpStatus.NOT_FOUND,
              OPPORTUNITY_ERROR_CODES.ASSIGNEE_NOT_FOUND,
              'El responsable no existe o no está activo.',
            );
          }
        }

        const stage = dto.pipelineStageId
          ? await transaction.pipelineStage.findFirst({
              where: { organizationId, id: dto.pipelineStageId, active: true, deletedAt: null },
              select: {
                id: true,
                name: true,
                color: true,
                category: true,
                order: true,
              },
            })
          : await transaction.pipelineStage.findFirst({
              where: {
                organizationId,
                active: true,
                deletedAt: null,
                category: PipelineStageCategory.OPEN,
              },
              orderBy: { order: 'asc' },
              select: {
                id: true,
                name: true,
                color: true,
                category: true,
                order: true,
              },
            });
        if (!stage) {
          throw opportunityException(
            HttpStatus.NOT_FOUND,
            OPPORTUNITY_ERROR_CODES.STAGE_NOT_FOUND,
            'La etapa no existe o no está activa.',
          );
        }
        if (stage.category !== PipelineStageCategory.OPEN) {
          throw opportunityException(
            HttpStatus.BAD_REQUEST,
            OPPORTUNITY_ERROR_CODES.INITIAL_STAGE_MUST_BE_OPEN,
            'Una oportunidad nueva debe comenzar en una etapa abierta.',
          );
        }
        const interest = await this.resolveInterest(
          transaction,
          organizationId,
          dto.categoryId,
          dto.productId,
        );
        await this.assertRelations(transaction, organizationId, dto.campaignId);

        const now = new Date();
        const opportunity = await transaction.opportunity.create({
          data: {
            organizationId,
            contactId: contact.id,
            pipelineStageId: stage.id,
            title,
            notes: dto.notes ?? null,
            userId: assignedUserId,
            expectedAmount: money.amount,
            currency: money.currency,
            probability: dto.probability ?? 50,
            priority: dto.priority ?? 'NORMAL',
            ...(dto.campaignId ? { campaignId: dto.campaignId } : {}),
            ...(interest.categoryId ? { categoryId: interest.categoryId } : {}),
            ...(interest.productId ? { productId: interest.productId } : {}),
            lastStageChangedAt: now,
          },
          select: { id: true },
        });
        if (interest.categoryId || interest.productId) {
          await transaction.opportunityInterestHistory.create({
            data: {
              organizationId,
              opportunityId: opportunity.id,
              categoryId: interest.categoryId,
              productId: interest.productId,
              changedByUserId: context.user.userId,
              reason: 'Oportunidad creada',
            },
          });
        }

        await transaction.opportunityStageHistory.create({
          data: {
            organizationId,
            opportunityId: opportunity.id,
            toStageId: stage.id,
            changedByUserId: context.user.userId,
            reason: 'Oportunidad creada',
            changedAt: now,
          },
        });
        await transaction.activity.create({
          data: {
            organizationId,
            userId: context.user.userId,
            contactId: contact.id,
            opportunityId: opportunity.id,
            type: ActivityType.SYSTEM,
            title: 'Oportunidad creada',
            occurredAt: now,
            metadata: asInputJson({
              toStageId: stage.id,
              toStageName: stage.name,
              createdBy: 'MANUAL',
            }),
          },
        });
        await transaction.contact.update({
          where: { organizationId_id: { organizationId, id: contact.id } },
          data: { lastActivityAt: now },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'OPPORTUNITY_CREATED',
          tableName: 'Opportunity',
          recordId: opportunity.id,
          newValue: asInputJson({
            contactId: contact.id,
            pipelineStageId: stage.id,
            assignedUserId,
            campaignId: dto.campaignId ?? null,
            productId: dto.productId ?? null,
            title,
            expectedAmount: money.amount?.toString() ?? null,
            currency: money.currency,
          }),
          ip: context.metadata.ipAddress,
        });
        return opportunity.id;
      });

      const created = await this.repository.findDetailById(organizationId, opportunityId);
      if (!created) throw new Error('La oportunidad creada no pudo ser recuperada.');
      return this.mapOpportunity(created);
    } catch (error: unknown) {
      this.rethrowDatabaseConflict(error);
    }
  }

  async list(
    query: ListOpportunitiesQueryDto,
    user: AuthenticatedUser,
  ): Promise<{
    data: PublicOpportunity[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    this.accessPolicy.assertCanRead(user);
    const where = this.buildListWhere(query);
    const direction = query.sortOrder;
    const sortField: Prisma.OpportunityOrderByWithRelationInput = {
      [this.sortField(query.sortBy)]: direction,
    };
    const skip = (query.page - 1) * query.limit;
    const [records, total] = await Promise.all([
      this.repository.findForList(
        user.organizationId,
        where,
        [sortField, { id: direction }],
        skip,
        query.limit,
      ),
      this.repository.count(user.organizationId, where),
    ]);
    return {
      data: records.map((record) => this.mapOpportunity(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    this.accessPolicy.assertCanRead(user);
    const opportunity = await this.repository.findDetailById(user.organizationId, id);
    if (!opportunity) throw this.notFound();
    const sales = await this.prisma.sale.aggregate({
      where: { organizationId: user.organizationId, opportunityId: id, deletedAt: null },
      _count: { id: true },
      _sum: { total: true },
    });
    return {
      ...this.mapOpportunity(opportunity),
      activities: opportunity.activities,
      upcomingFollowUps: await this.repository.findUpcomingFollowUps(user.organizationId, id),
      stageHistory: opportunity.stageHistory.map((history) => this.mapHistory(history)),
      salesSummary: { count: sales._count.id, total: sales._sum.total?.toString() ?? '0' },
    };
  }

  async update(
    id: string,
    dto: UpdateOpportunityDto,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunity> {
    const current = await this.requireMutation(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, current);
    this.assertNotArchived(current);

    const title = dto.title !== undefined ? this.requireTitle(dto.title) : current.title;
    const expectedAmountInput =
      dto.expectedAmount !== undefined
        ? dto.expectedAmount
        : this.decimalString(current.expectedAmount);
    const currencyInput = dto.currency !== undefined ? dto.currency : current.currency;
    const money = this.normalizeMoney(expectedAmountInput, currencyInput);
    const data: Prisma.OpportunityUncheckedUpdateInput = {
      title,
      expectedAmount: money.amount,
      currency: money.currency,
      ...(dto.probability !== undefined ? { probability: dto.probability } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
    };
    if (dto.campaignId !== undefined) {
      if (dto.campaignId) await this.assertCampaign(context.user.organizationId, dto.campaignId);
      data.campaignId = dto.campaignId ?? null;
    }
    let interest: { categoryId: string | null; productId: string | null } | null = null;

    try {
      await this.prisma.$transaction(async (transaction) => {
        interest = await this.resolveInterest(
          transaction,
          context.user.organizationId,
          dto.categoryId !== undefined ? dto.categoryId : current.categoryId,
          dto.productId !== undefined ? dto.productId : current.productId,
        );
        if (dto.categoryId !== undefined) data.categoryId = interest.categoryId;
        if (dto.productId !== undefined) data.productId = interest.productId;
        await transaction.opportunity.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data,
        });
        if (
          interest &&
          (dto.categoryId !== undefined || dto.productId !== undefined) &&
          (interest.categoryId !== current.categoryId || interest.productId !== current.productId)
        ) {
          await transaction.opportunityInterestHistory.create({
            data: {
              organizationId: context.user.organizationId,
              opportunityId: id,
              categoryId: interest.categoryId,
              productId: interest.productId,
              changedByUserId: context.user.userId,
              reason: 'Interés comercial actualizado',
            },
          });
        }
        const now = new Date();
        await transaction.contact.update({
          where: {
            organizationId_id: {
              organizationId: context.user.organizationId,
              id: current.contactId,
            },
          },
          data: { lastActivityAt: now },
        });
        await transaction.activity.create({
          data: {
            organizationId: context.user.organizationId,
            userId: context.user.userId,
            contactId: current.contactId,
            opportunityId: id,
            type: ActivityType.SYSTEM,
            title: 'Oportunidad actualizada',
            occurredAt: now,
            metadata: { event: 'opportunity_updated' },
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'OPPORTUNITY_UPDATED',
          tableName: 'Opportunity',
          recordId: id,
          previousValue: this.auditOpportunityValue(current),
          newValue: asInputJson({
            title,
            expectedAmount: money.amount?.toString() ?? null,
            currency: money.currency,
            campaignId: dto.campaignId ?? current.campaignId,
            productId: dto.productId ?? current.productId,
            probability: String(dto.probability ?? current.probability),
            priority: dto.priority ?? current.priority,
          }),
          ip: context.metadata.ipAddress,
        });
      });
    } catch (error: unknown) {
      this.rethrowDatabaseConflict(error);
    }
    const updated = await this.repository.findDetailById(context.user.organizationId, id);
    if (!updated) throw this.notFound();
    return this.mapOpportunity(updated);
  }

  async assign(
    id: string,
    dto: AssignOpportunityDto,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunity> {
    if (dto.assignedUserId === undefined) {
      throw opportunityException(
        HttpStatus.BAD_REQUEST,
        OPPORTUNITY_ERROR_CODES.ASSIGNEE_NOT_FOUND,
        'Debes indicar el responsable o null.',
      );
    }
    const current = await this.requireMutation(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, current);
    this.assertNotArchived(current);
    const assignedUserId = dto.assignedUserId ?? null;
    this.accessPolicy.assertCanAssign(context.user, current, assignedUserId);
    if (
      assignedUserId &&
      !(await this.repository.findAssignee(context.user.organizationId, assignedUserId))
    ) {
      throw opportunityException(
        HttpStatus.NOT_FOUND,
        OPPORTUNITY_ERROR_CODES.ASSIGNEE_NOT_FOUND,
        'El responsable no existe o no está activo.',
      );
    }
    if (assignedUserId === current.userId) {
      const existing = await this.repository.findDetailById(context.user.organizationId, id);
      if (!existing) throw this.notFound();
      return this.mapOpportunity(existing);
    }
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.opportunity.update({
        where: { organizationId_id: { organizationId: context.user.organizationId, id } },
        data: { userId: assignedUserId },
      });
      await transaction.contact.update({
        where: {
          organizationId_id: { organizationId: context.user.organizationId, id: current.contactId },
        },
        data: { lastActivityAt: now },
      });
      await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: current.contactId,
          opportunityId: id,
          type: ActivityType.STATUS_CHANGE,
          title: 'Responsable actualizado',
          occurredAt: now,
          metadata: asInputJson({
            previousAssigneeId: current.userId,
            newAssigneeId: assignedUserId,
          }),
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'OPPORTUNITY_ASSIGNEE_CHANGED',
        tableName: 'Opportunity',
        recordId: id,
        previousValue: asInputJson({ assignedUserId: current.userId }),
        newValue: asInputJson({ assignedUserId }),
        ip: context.metadata.ipAddress,
      });
    });
    const updated = await this.repository.findDetailById(context.user.organizationId, id);
    if (!updated) throw this.notFound();
    return this.mapOpportunity(updated);
  }

  async move(
    id: string,
    dto: MoveOpportunityDto,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunity> {
    const current = await this.requireMutation(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, current);
    this.assertNotArchived(current);
    const target = await this.repository.findStage(
      context.user.organizationId,
      dto.pipelineStageId,
    );
    if (!target || !target.active || target.deletedAt) throw this.stageNotFound();
    if (target.id === current.pipelineStageId) {
      throw opportunityException(
        HttpStatus.CONFLICT,
        OPPORTUNITY_ERROR_CODES.ALREADY_IN_STAGE,
        'La oportunidad ya está en esa etapa.',
      );
    }
    if (
      current.pipelineStage.category !== PipelineStageCategory.OPEN &&
      target.category === PipelineStageCategory.OPEN
    ) {
      throw opportunityException(
        HttpStatus.CONFLICT,
        OPPORTUNITY_ERROR_CODES.CLOSED_REQUIRES_REOPEN,
        'Una oportunidad cerrada debe reabrirse explícitamente.',
      );
    }
    const reason = dto.reason?.trim() || null;
    if (target.category === PipelineStageCategory.LOST && !reason) {
      throw opportunityException(
        HttpStatus.BAD_REQUEST,
        OPPORTUNITY_ERROR_CODES.LOST_REASON_REQUIRED,
        'Debes indicar un motivo para marcar la oportunidad como perdida.',
      );
    }
    const now = new Date();
    const updateData = this.stageTransitionData(target.category, now, reason);
    try {
      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.opportunity.updateMany({
          where: {
            organizationId: context.user.organizationId,
            id,
            pipelineStageId: current.pipelineStageId,
            archivedAt: null,
            deletedAt: null,
          },
          data: { pipelineStageId: target.id, lastStageChangedAt: now, ...updateData },
        });
        if (updated.count !== 1) {
          throw opportunityException(
            HttpStatus.CONFLICT,
            OPPORTUNITY_ERROR_CODES.OPERATION_FAILED,
            'La oportunidad cambió mientras se actualizaba.',
          );
        }
        await transaction.opportunityStageHistory.create({
          data: {
            organizationId: context.user.organizationId,
            opportunityId: id,
            fromStageId: current.pipelineStageId,
            toStageId: target.id,
            changedByUserId: context.user.userId,
            reason,
            changedAt: now,
          },
        });
        await this.recordStageChange(
          transaction,
          context,
          current,
          target,
          now,
          reason,
          'OPPORTUNITY_STAGE_CHANGED',
        );
        await this.syncOperationalFollowUp(transaction, current, target, context, now);
      });
    } catch (error: unknown) {
      this.rethrowDatabaseConflict(error);
    }
    const updated = await this.repository.findDetailById(context.user.organizationId, id);
    if (!updated) throw this.notFound();
    return this.mapOpportunity(updated);
  }

  async reopen(
    id: string,
    dto: ReopenOpportunityDto,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunity> {
    const current = await this.requireMutation(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, current);
    this.assertNotArchived(current);
    const target = await this.repository.findStage(
      context.user.organizationId,
      dto.pipelineStageId,
    );
    if (
      !target ||
      !target.active ||
      target.deletedAt ||
      target.category !== PipelineStageCategory.OPEN
    ) {
      throw this.stageNotFound();
    }
    if (current.pipelineStage.category === PipelineStageCategory.OPEN) {
      if (current.pipelineStageId === target.id) {
        const existing = await this.repository.findDetailById(context.user.organizationId, id);
        if (!existing) throw this.notFound();
        return this.mapOpportunity(existing);
      }
      throw opportunityException(
        HttpStatus.CONFLICT,
        OPPORTUNITY_ERROR_CODES.OPERATION_FAILED,
        'La oportunidad ya está abierta; usa el movimiento de etapa.',
      );
    }
    if (await this.repository.findActiveSale(context.user.organizationId, id)) {
      throw opportunityException(
        HttpStatus.CONFLICT,
        OPPORTUNITY_ERROR_CODES.HAS_ACTIVE_SALE,
        'No puedes reabrir una oportunidad con una venta activa.',
      );
    }
    const now = new Date();
    try {
      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.opportunity.updateMany({
          where: {
            organizationId: context.user.organizationId,
            id,
            pipelineStageId: current.pipelineStageId,
            archivedAt: null,
            deletedAt: null,
          },
          data: {
            pipelineStageId: target.id,
            lastStageChangedAt: now,
            closedAt: null,
            wonAt: null,
            lostAt: null,
            lostReason: null,
          },
        });
        if (updated.count !== 1) {
          throw opportunityException(
            HttpStatus.CONFLICT,
            OPPORTUNITY_ERROR_CODES.OPERATION_FAILED,
            'La oportunidad cambió mientras se reabría.',
          );
        }
        await transaction.opportunityStageHistory.create({
          data: {
            organizationId: context.user.organizationId,
            opportunityId: id,
            fromStageId: current.pipelineStageId,
            toStageId: target.id,
            changedByUserId: context.user.userId,
            reason: dto.reason?.trim() || 'Oportunidad reabierta',
            changedAt: now,
          },
        });
        await this.recordStageChange(
          transaction,
          context,
          current,
          target,
          now,
          dto.reason?.trim() || null,
          'OPPORTUNITY_REOPENED',
        );
        await this.syncOperationalFollowUp(transaction, current, target, context, now);
      });
    } catch (error: unknown) {
      this.rethrowDatabaseConflict(error);
    }
    const updated = await this.repository.findDetailById(context.user.organizationId, id);
    if (!updated) throw this.notFound();
    return this.mapOpportunity(updated);
  }

  async archive(
    id: string,
    dto: ArchiveOpportunityDto,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunity> {
    const current = await this.requireMutation(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, current);
    if (!current.archivedAt) {
      const now = new Date();
      await this.prisma.$transaction(async (transaction) => {
        await transaction.opportunity.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: { archivedAt: now, archiveReason: dto.reason ?? null },
        });
        await transaction.contact.update({
          where: {
            organizationId_id: {
              organizationId: context.user.organizationId,
              id: current.contactId,
            },
          },
          data: { lastActivityAt: now },
        });
        await transaction.activity.create({
          data: {
            organizationId: context.user.organizationId,
            userId: context.user.userId,
            contactId: current.contactId,
            opportunityId: id,
            type: ActivityType.SYSTEM,
            title: 'Oportunidad archivada',
            description: dto.reason ?? null,
            occurredAt: now,
            metadata: { event: 'opportunity_archived' },
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'OPPORTUNITY_ARCHIVED',
          tableName: 'Opportunity',
          recordId: id,
          previousValue: { archivedAt: null },
          newValue: asInputJson({ archivedAt: now.toISOString(), reason: dto.reason ?? null }),
          ip: context.metadata.ipAddress,
        });
      });
    }
    const updated = await this.repository.findDetailById(context.user.organizationId, id);
    if (!updated) throw this.notFound();
    return this.mapOpportunity(updated);
  }

  async restore(id: string, context: OpportunityRequestContext): Promise<PublicOpportunity> {
    const current = await this.requireMutation(context.user.organizationId, id);
    this.accessPolicy.assertCanMutate(context.user, current);
    if (current.archivedAt) {
      const now = new Date();
      await this.prisma.$transaction(async (transaction) => {
        const contact = await transaction.contact.findFirst({
          where: { organizationId: context.user.organizationId, id: current.contactId },
          select: { id: true, deletedAt: true },
        });
        if (!contact || contact.deletedAt) {
          throw opportunityException(
            HttpStatus.CONFLICT,
            OPPORTUNITY_ERROR_CODES.CONTACT_UNAVAILABLE,
            'El contacto asociado no está disponible para restaurar la oportunidad.',
          );
        }
        const restored = await transaction.opportunity.updateMany({
          where: {
            organizationId: context.user.organizationId,
            id,
            archivedAt: { not: null },
            deletedAt: null,
            contact: { deletedAt: null },
          },
          data: { archivedAt: null, archiveReason: null },
        });
        if (restored.count !== 1) return;
        await transaction.contact.update({
          where: {
            organizationId_id: {
              organizationId: context.user.organizationId,
              id: current.contactId,
            },
          },
          data: { lastActivityAt: now },
        });
        await transaction.activity.create({
          data: {
            organizationId: context.user.organizationId,
            userId: context.user.userId,
            contactId: current.contactId,
            opportunityId: id,
            type: ActivityType.SYSTEM,
            title: 'Oportunidad restaurada',
            occurredAt: now,
            metadata: { event: 'opportunity_restored' },
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'OPPORTUNITY_RESTORED',
          tableName: 'Opportunity',
          recordId: id,
          previousValue: { archivedAt: current.archivedAt!.toISOString() },
          newValue: { archivedAt: null },
          ip: context.metadata.ipAddress,
        });
      });
    }
    const updated = await this.repository.findDetailById(context.user.organizationId, id);
    if (!updated) throw this.notFound();
    return this.mapOpportunity(updated);
  }

  async history(
    id: string,
    query: StageHistoryQueryDto,
    user: AuthenticatedUser,
  ): Promise<{
    data: unknown[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    this.accessPolicy.assertCanRead(user);
    const opportunity = await this.repository.findForMutation(user.organizationId, id);
    if (!opportunity) throw this.notFound();
    const skip = (query.page - 1) * query.limit;
    const [records, total] = await Promise.all([
      this.repository.findHistory(user.organizationId, id, skip, query.limit),
      this.repository.countHistory(user.organizationId, id),
    ]);
    return {
      data: records.map((record) => this.mapHistory(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getPipeline(
    query: PipelineQueryDto,
    user: AuthenticatedUser,
  ): Promise<{ stages: PublicPipelineStage[] }> {
    this.accessPolicy.assertCanRead(user);
    const stages = await this.repository.findStages(user.organizationId);
    const where = this.buildPipelineWhere(query);
    const result = await Promise.all(
      stages.map(async (stage) => {
        const page = await this.repository.findStageOpportunities(
          user.organizationId,
          stage.id,
          where,
          this.decodePipelineCursor(query.cursor),
          query.normalizedLimit,
        );
        return this.pipelineColumn(stage, page, query.normalizedLimit);
      }),
    );
    return { stages: result };
  }

  async getPipelineSummary(
    query: PipelineQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    this.accessPolicy.assertCanRead(user);
    const stages = await this.repository.findStages(user.organizationId);
    const groups = await this.repository.groupSummary(
      user.organizationId,
      this.buildPipelineWhere(query),
    );
    const columns = stages.map((stage) => {
      const stageGroups = groups.filter((group) => group.pipelineStageId === stage.id);
      return {
        stage: this.mapStage(stage),
        total: stageGroups.reduce((total, group) => total + group._count._all, 0),
        amountsByCurrency: stageGroups.map((group) => ({
          currency: group.currency ?? 'UNSPECIFIED',
          amount: group._sum.expectedAmount?.toString() ?? '0',
          count: group._count._all,
        })),
      };
    });
    const totalsByCurrency = new Map<string, { amount: Prisma.Decimal; count: number }>();
    for (const group of groups) {
      const currency = group.currency ?? 'UNSPECIFIED';
      const current = totalsByCurrency.get(currency);
      totalsByCurrency.set(currency, {
        amount: (current?.amount ?? new Prisma.Decimal(0)).plus(group._sum.expectedAmount ?? 0),
        count: (current?.count ?? 0) + group._count._all,
      });
    }
    return {
      stages: columns,
      totalsByCurrency: [...totalsByCurrency.entries()].map(([currency, value]) => ({
        currency,
        amount: value.amount.toString(),
        count: value.count,
      })),
    };
  }

  async getStageOpportunities(
    stageId: string,
    query: PipelineQueryDto,
    user: AuthenticatedUser,
  ): Promise<{
    stage: PublicOpportunityStage;
    data: PublicOpportunity[];
    nextCursor: string | null;
  }> {
    this.accessPolicy.assertCanRead(user);
    const stage = await this.repository.findStage(user.organizationId, stageId);
    if (!stage || !stage.active || stage.deletedAt) throw this.pipelineStageNotFound();
    const records = await this.repository.findStageOpportunities(
      user.organizationId,
      stageId,
      this.buildPipelineWhere(query),
      this.decodePipelineCursor(query.cursor),
      query.normalizedLimit,
    );
    const page = this.pipelinePage(records, query.normalizedLimit);
    return {
      stage: this.mapStage(stage),
      data: page.data.map((record) => this.mapOpportunity(record)),
      nextCursor: page.nextCursor,
    };
  }

  async createStage(
    dto: CreatePipelineStageDto,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunityStage> {
    const organizationId = context.user.organizationId;
    const name = dto.name.trim().replace(/\s+/g, ' ');
    const systemKey = dto.systemKey?.trim().toUpperCase() || null;
    try {
      const created = await this.withPipelineLock(organizationId, async (transaction) => {
        await this.assertStageNameAvailable(transaction, organizationId, name);
        if (systemKey) {
          await this.assertStageSystemKeyAvailable(transaction, organizationId, systemKey);
        }
        const count = await transaction.pipelineStage.count({
          where: { organizationId, deletedAt: null },
        });
        if (dto.order > count + 1) throw this.invalidOrder();
        const offset = count + 1;
        await transaction.pipelineStage.updateMany({
          where: { organizationId, deletedAt: null, order: { gte: dto.order } },
          data: { order: { increment: offset } },
        });
        await transaction.pipelineStage.updateMany({
          where: { organizationId, deletedAt: null, order: { gte: dto.order + offset } },
          data: { order: { decrement: offset - 1 } },
        });
        const stage = await transaction.pipelineStage.create({
          data: {
            organizationId,
            name,
            color: dto.color,
            category: dto.category,
            order: dto.order,
            ...(systemKey ? { systemKey } : {}),
          },
          select: {
            id: true,
            name: true,
            color: true,
            category: true,
            systemKey: true,
            order: true,
            active: true,
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'PIPELINE_STAGE_CREATED',
          tableName: 'PipelineStage',
          recordId: stage.id,
          newValue: {
            name,
            color: dto.color,
            category: dto.category,
            order: dto.order,
            systemKey,
          },
          ip: context.metadata.ipAddress,
        });
        return stage;
      });
      return this.mapStage(created);
    } catch (error: unknown) {
      this.rethrowPipelineConflict(error);
    }
  }

  async updateStage(
    id: string,
    dto: UpdatePipelineStageDto,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunityStage> {
    const organizationId = context.user.organizationId;
    const current = await this.repository.findStage(organizationId, id);
    if (!current || current.deletedAt) throw this.pipelineStageNotFound();
    if (dto.active === false) return this.archiveStage(id, context);
    if (dto.active === true && !current.active) return this.restoreStage(id, context);
    const name = dto.name ?? current.name;
    let updated: {
      id: string;
      name: string;
      color: string;
      category: PipelineStageCategory;
      systemKey?: string | null;
      order: number;
      active: boolean;
    };
    try {
      updated = await this.withPipelineLock(organizationId, async (transaction) => {
        if (dto.name) await this.assertStageNameAvailable(transaction, organizationId, name, id);
        const stage = await transaction.pipelineStage.update({
          where: { organizationId_id: { organizationId, id } },
          data: {
            ...(dto.name ? { name } : {}),
            ...(dto.color ? { color: dto.color } : {}),
          },
          select: { id: true, name: true, color: true, category: true, order: true, active: true },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'PIPELINE_STAGE_UPDATED',
          tableName: 'PipelineStage',
          recordId: id,
          previousValue: { name: current.name, color: current.color, active: current.active },
          newValue: { name: stage.name, color: stage.color, active: stage.active },
          ip: context.metadata.ipAddress,
        });
        return stage;
      });
    } catch (error: unknown) {
      this.rethrowPipelineConflict(error);
    }
    return this.mapStage(updated);
  }

  async reorderStage(
    id: string,
    dto: ReorderPipelineStageDto,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunityStage[]> {
    const organizationId = context.user.organizationId;
    try {
      return await this.withPipelineLock(organizationId, async (transaction) => {
        const stages = await transaction.pipelineStage.findMany({
          where: { organizationId, deletedAt: null },
          orderBy: { order: 'asc' },
          select: { id: true, name: true, color: true, category: true, order: true, active: true },
        });
        const sourceIndex = stages.findIndex((stage) => stage.id === id);
        if (sourceIndex < 0) throw this.pipelineStageNotFound();
        if (dto.order > stages.length) throw this.invalidOrder();
        const moving = stages.splice(sourceIndex, 1)[0];
        if (!moving) throw this.pipelineStageNotFound();
        stages.splice(dto.order - 1, 0, moving);
        const offset = stages.length + 1;
        await transaction.pipelineStage.updateMany({
          where: { organizationId, deletedAt: null },
          data: { order: { increment: offset } },
        });
        for (const [index, stage] of stages.entries()) {
          await transaction.pipelineStage.update({
            where: { organizationId_id: { organizationId, id: stage.id } },
            data: { order: index + 1 },
          });
        }
        await this.audit.recordWithClient(transaction, {
          organizationId,
          userId: context.user.userId,
          action: 'PIPELINE_STAGE_REORDERED',
          tableName: 'PipelineStage',
          recordId: id,
          previousValue: { order: sourceIndex + 1 },
          newValue: { order: dto.order },
          ip: context.metadata.ipAddress,
        });
        return stages.map((stage, index) =>
          this.mapStage({ ...stage, order: index + 1, deletedAt: null }),
        );
      });
    } catch (error: unknown) {
      this.rethrowPipelineConflict(error);
    }
  }

  async archiveStage(
    id: string,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunityStage> {
    const organizationId = context.user.organizationId;
    const updated = await this.withPipelineLock(organizationId, async (transaction) => {
      const current = await transaction.pipelineStage.findFirst({
        where: { organizationId, id },
        select: {
          id: true,
          name: true,
          color: true,
          category: true,
          order: true,
          active: true,
          deletedAt: true,
        },
      });
      if (!current || current.deletedAt) throw this.pipelineStageNotFound();
      if (!current.active) return current;
      const inUse = await transaction.opportunity.count({
        where: { organizationId, pipelineStageId: id, archivedAt: null, deletedAt: null },
      });
      if (inUse > 0) throw this.stageInUse();
      const categoryCount = await transaction.pipelineStage.count({
        where: { organizationId, category: current.category, active: true, deletedAt: null },
      });
      if (categoryCount <= 1) throw this.lastCategoryStage(current.category);
      const archived = await transaction.pipelineStage.update({
        where: { organizationId_id: { organizationId, id } },
        data: { active: false },
        select: {
          id: true,
          name: true,
          color: true,
          category: true,
          order: true,
          active: true,
          deletedAt: true,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'PIPELINE_STAGE_ARCHIVED',
        tableName: 'PipelineStage',
        recordId: id,
        previousValue: { active: true },
        newValue: { active: false },
        ip: context.metadata.ipAddress,
      });
      return archived;
    });
    return this.mapStage(updated);
  }

  async restoreStage(
    id: string,
    context: OpportunityRequestContext,
  ): Promise<PublicOpportunityStage> {
    const organizationId = context.user.organizationId;
    const updated = await this.withPipelineLock(organizationId, async (transaction) => {
      const current = await transaction.pipelineStage.findFirst({
        where: { organizationId, id },
        select: {
          id: true,
          name: true,
          color: true,
          category: true,
          order: true,
          active: true,
          deletedAt: true,
        },
      });
      if (!current || current.deletedAt) throw this.pipelineStageNotFound();
      if (current.active) return current;
      const stages = await transaction.pipelineStage.findMany({
        where: { organizationId, deletedAt: null },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      const offset = stages.length + 1;
      await transaction.pipelineStage.updateMany({
        where: { organizationId, deletedAt: null },
        data: { order: { increment: offset } },
      });
      for (const [index, stage] of stages.entries()) {
        await transaction.pipelineStage.update({
          where: { organizationId_id: { organizationId, id: stage.id } },
          data: { order: index + 1 },
        });
      }
      const restored = await transaction.pipelineStage.update({
        where: { organizationId_id: { organizationId, id } },
        data: { active: true },
        select: {
          id: true,
          name: true,
          color: true,
          category: true,
          order: true,
          active: true,
          deletedAt: true,
        },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId,
        userId: context.user.userId,
        action: 'PIPELINE_STAGE_RESTORED',
        tableName: 'PipelineStage',
        recordId: id,
        previousValue: { active: false, order: current.order },
        newValue: { active: true, order: restored.order },
        ip: context.metadata.ipAddress,
      });
      return restored;
    });
    return this.mapStage(updated);
  }

  private async assertRelations(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    campaignId: string | null | undefined,
  ): Promise<void> {
    if (campaignId) {
      const campaign = await transaction.campaign.findFirst({
        where: { organizationId, id: campaignId, active: true, deletedAt: null },
        select: { id: true },
      });
      if (!campaign)
        throw opportunityException(
          HttpStatus.NOT_FOUND,
          OPPORTUNITY_ERROR_CODES.CAMPAIGN_NOT_FOUND,
          'La campaña no existe en la organización actual.',
        );
    }
  }

  private async resolveInterest(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    categoryId: string | null | undefined,
    productId: string | null | undefined,
  ): Promise<{ categoryId: string | null; productId: string | null }> {
    let resolvedCategoryId = categoryId ?? null;
    if (resolvedCategoryId) {
      const category = await transaction.productCategory.findFirst({
        where: { organizationId, id: resolvedCategoryId, active: true, deletedAt: null },
        select: { id: true },
      });
      if (!category)
        throw opportunityException(
          HttpStatus.NOT_FOUND,
          OPPORTUNITY_ERROR_CODES.CATEGORY_NOT_FOUND,
          'La categoría no existe o no está activa.',
        );
    }
    if (productId) {
      const product = await transaction.product.findFirst({
        where: { organizationId, id: productId, active: true, deletedAt: null },
        select: { id: true, categoryId: true },
      });
      if (!product)
        throw opportunityException(
          HttpStatus.NOT_FOUND,
          OPPORTUNITY_ERROR_CODES.PRODUCT_NOT_FOUND,
          'El producto no existe o no está activo.',
        );
      if (resolvedCategoryId && product.categoryId && resolvedCategoryId !== product.categoryId)
        throw opportunityException(
          HttpStatus.BAD_REQUEST,
          OPPORTUNITY_ERROR_CODES.CATEGORY_PRODUCT_MISMATCH,
          'La categoría no corresponde al producto seleccionado.',
        );
      resolvedCategoryId = resolvedCategoryId ?? product.categoryId;
    }
    return { categoryId: resolvedCategoryId, productId: productId ?? null };
  }

  private async assertCampaign(organizationId: string, id: string): Promise<void> {
    if (!(await this.repository.findCampaign(organizationId, id)))
      throw opportunityException(
        HttpStatus.NOT_FOUND,
        OPPORTUNITY_ERROR_CODES.CAMPAIGN_NOT_FOUND,
        'La campaña no existe en la organización actual.',
      );
  }

  private requireTitle(value: string | null | undefined): string {
    const title = normalizeTitle(value);
    if (!title || title.length < 2 || title.length > 160)
      throw opportunityException(
        HttpStatus.BAD_REQUEST,
        OPPORTUNITY_ERROR_CODES.OPERATION_FAILED,
        'El título de la oportunidad no es válido.',
      );
    return title;
  }

  private normalizeMoney(
    amountValue: string | null | undefined,
    currencyValue: string | null | undefined,
  ): { amount: Prisma.Decimal | null; currency: string | null } {
    const amountString =
      amountValue === null || amountValue === undefined ? null : amountValue.trim();
    const currency = normalizeCurrency(currencyValue);
    if (!amountString) return { amount: null, currency: null };
    if (!isValidExpectedAmount(amountString)) {
      throw opportunityException(
        HttpStatus.BAD_REQUEST,
        OPPORTUNITY_ERROR_CODES.INVALID_AMOUNT,
        'El monto esperado no es válido.',
      );
    }
    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
      throw opportunityException(
        HttpStatus.BAD_REQUEST,
        OPPORTUNITY_ERROR_CODES.INVALID_CURRENCY,
        'El monto esperado requiere una moneda de tres letras.',
      );
    }
    const amount = new Prisma.Decimal(amountString);
    if (amount.isNegative() || amount.greaterThan(new Prisma.Decimal('999999999999.99'))) {
      throw opportunityException(
        HttpStatus.BAD_REQUEST,
        OPPORTUNITY_ERROR_CODES.INVALID_AMOUNT,
        'El monto esperado no es válido.',
      );
    }
    return { amount, currency };
  }

  private buildListWhere(query: ListOpportunitiesQueryDto): Prisma.OpportunityWhereInput {
    const search = query.search?.trim().replace(/[%_\\]/g, ' ');
    return {
      deletedAt: null,
      contact: { deletedAt: null, ...(query.country ? { country: query.country } : {}) },
      archivedAt: query.archived ? { not: null } : null,
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.pipelineStageId ? { pipelineStageId: query.pipelineStageId } : {}),
      ...(query.stageCategory
        ? { pipelineStage: { category: query.stageCategory, deletedAt: null } }
        : {}),
      ...(query.assignedUserId ? { userId: query.assignedUserId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.closedFrom || query.closedTo
        ? {
            closedAt: {
              ...(query.closedFrom ? { gte: new Date(query.closedFrom) } : {}),
              ...(query.closedTo ? { lte: new Date(query.closedTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { contact: { firstName: { contains: search, mode: 'insensitive' } } },
              { contact: { lastName: { contains: search, mode: 'insensitive' } } },
              { contact: { email: { contains: search, mode: 'insensitive' } } },
              { contact: { phone: { contains: search, mode: 'insensitive' } } },
              { contact: { phoneNormalized: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  private buildPipelineWhere(query: PipelineQueryDto): Prisma.OpportunityWhereInput {
    const search = query.search?.trim().replace(/[%_\\]/g, ' ');
    return {
      ...(query.assignedUserId ? { userId: query.assignedUserId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      contact: {
        deletedAt: null,
        ...(query.country ? { country: query.country } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { phoneNormalized: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };
  }

  private sortField(sortBy: OpportunitySortBy): string {
    return sortBy;
  }

  private async requireMutation(
    organizationId: string,
    id: string,
  ): Promise<OpportunityMutationRecord> {
    const opportunity = await this.repository.findForMutation(organizationId, id);
    if (!opportunity) throw this.notFound();
    return opportunity;
  }

  private assertNotArchived(opportunity: OpportunityMutationRecord): void {
    if (opportunity.archivedAt)
      throw opportunityException(
        HttpStatus.CONFLICT,
        OPPORTUNITY_ERROR_CODES.ARCHIVED,
        'La oportunidad está archivada.',
      );
  }

  private mapOpportunity(
    opportunity: OpportunityListRecord | OpportunityDetailRecord,
  ): PublicOpportunity {
    return {
      id: opportunity.id,
      title: opportunity.title,
      notes: opportunity.notes,
      expectedAmount: this.decimalString(opportunity.expectedAmount),
      currency: opportunity.currency,
      probability: opportunity.probability,
      priority: opportunity.priority,
      status: opportunityStatus(opportunity.archivedAt, opportunity.pipelineStage.category),
      archivedAt: opportunity.archivedAt,
      archiveReason: opportunity.archiveReason,
      wonAt: opportunity.wonAt,
      lostAt: opportunity.lostAt,
      lostReason: opportunity.lostReason,
      closedAt: opportunity.closedAt,
      lastStageChangedAt: opportunity.lastStageChangedAt,
      contact: {
        id: opportunity.contact.id,
        displayName: displayName(opportunity.contact.firstName, opportunity.contact.lastName),
        phone: opportunity.contact.phone,
        country: opportunity.contact.country,
      },
      pipelineStage: this.mapStage(opportunity.pipelineStage),
      assignedTo: opportunity.owner ? this.mapUser(opportunity.owner) : null,
      campaign: opportunity.campaign ? this.mapRelation(opportunity.campaign) : null,
      category: opportunity.category ? this.mapRelation(opportunity.category) : null,
      product: opportunity.product ? this.mapRelation(opportunity.product) : null,
      nextFollowUp: opportunity.followUps[0]
        ? {
            id: opportunity.followUps[0].id,
            title: opportunity.followUps[0].title,
            dueAt: opportunity.followUps[0].dueAt,
            status: opportunity.followUps[0].status,
            autoSuggested: opportunity.followUps[0].autoSuggested,
          }
        : null,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt,
    };
  }

  private mapStage(
    stage:
      | PipelineStageRecord
      | {
          id: string;
          name: string;
          color: string;
          category: PipelineStageCategory;
          systemKey?: string | null;
          order: number;
          active?: boolean;
          deletedAt?: Date | null;
        },
  ): PublicOpportunityStage {
    return {
      id: stage.id,
      name: stage.name,
      color: stage.color,
      category: stage.category,
      systemKey: stage.systemKey ?? null,
      followUpDays: followUpDaysForState(stage.systemKey ?? stage.name),
      order: stage.order,
      active: stage.active ?? true,
    };
  }

  private mapUser(user: {
    id: string;
    firstName: string;
    lastName: string | null;
  }): PublicOpportunityUser {
    return { id: user.id, firstName: user.firstName, lastName: user.lastName };
  }

  private mapRelation(relation: { id: string; name: string }): PublicOpportunityRelation {
    return { id: relation.id, name: relation.name };
  }

  private mapHistory(history: {
    id: string;
    fromStage: StageSnapshot | null;
    toStage: StageSnapshot;
    changedBy: { id: string; firstName: string; lastName: string | null } | null;
    reason: string | null;
    changedAt: Date;
    createdAt: Date;
  }): Record<string, unknown> {
    return {
      id: history.id,
      fromStage: history.fromStage,
      toStage: history.toStage,
      changedBy: history.changedBy ? this.mapUser(history.changedBy) : null,
      reason: history.reason,
      changedAt: history.changedAt,
      createdAt: history.createdAt,
    };
  }

  private decimalString(value: Prisma.Decimal | null): string | null {
    return value?.toString() ?? null;
  }

  private auditOpportunityValue(opportunity: OpportunityMutationRecord): Prisma.InputJsonObject {
    return asInputJson({
      title: opportunity.title,
      pipelineStageId: opportunity.pipelineStageId,
      assignedUserId: opportunity.userId,
      expectedAmount: this.decimalString(opportunity.expectedAmount),
      currency: opportunity.currency,
      campaignId: opportunity.campaignId,
      productId: opportunity.productId,
      probability: String(opportunity.probability),
      priority: opportunity.priority,
      archivedAt: opportunity.archivedAt?.toISOString() ?? null,
    });
  }

  private stageTransitionData(
    category: PipelineStageCategory,
    now: Date,
    reason: string | null,
  ): Prisma.OpportunityUpdateManyMutationInput {
    if (category === PipelineStageCategory.WON)
      return { closedAt: now, wonAt: now, lostAt: null, lostReason: null };
    if (category === PipelineStageCategory.LOST)
      return { closedAt: now, wonAt: null, lostAt: now, lostReason: reason };
    return { closedAt: null, wonAt: null, lostAt: null, lostReason: null };
  }

  private async recordStageChange(
    transaction: Prisma.TransactionClient,
    context: OpportunityRequestContext,
    current: OpportunityMutationRecord,
    target: PipelineStageRecord,
    now: Date,
    reason: string | null,
    action: string,
  ): Promise<void> {
    await transaction.activity.create({
      data: {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        contactId: current.contactId,
        opportunityId: current.id,
        type: ActivityType.STATUS_CHANGE,
        title: action === 'OPPORTUNITY_REOPENED' ? 'Oportunidad reabierta' : 'Etapa actualizada',
        occurredAt: now,
        metadata: asInputJson({
          fromStageId: current.pipelineStageId,
          toStageId: target.id,
          reason,
        }),
        requestId: context.metadata.requestId ?? null,
      },
    });
    await transaction.contact.update({
      where: {
        organizationId_id: { organizationId: context.user.organizationId, id: current.contactId },
      },
      data: { lastActivityAt: now },
    });
    await this.audit.recordWithClient(transaction, {
      organizationId: context.user.organizationId,
      userId: context.user.userId,
      action,
      tableName: 'Opportunity',
      recordId: current.id,
      previousValue: { pipelineStageId: current.pipelineStageId },
      newValue: asInputJson({ pipelineStageId: target.id, reason }),
      ip: context.metadata.ipAddress,
      requestId: context.metadata.requestId,
    });
    await this.outbox.enqueueWithClient(transaction, {
      eventType: 'OpportunityStageChanged',
      organizationId: context.user.organizationId,
      aggregateType: 'Opportunity',
      aggregateId: current.id,
      actorId: context.user.userId,
      requestId: context.metadata.requestId ?? current.id,
      payload: {
        opportunity: { id: current.id, title: current.title },
        contact: {
          id: current.contact.id,
          name: displayName(current.contact.firstName, current.contact.lastName),
        },
        fromStage: { id: current.pipelineStage.id, name: current.pipelineStage.name },
        toStage: { id: target.id, name: target.name },
        reason,
        transition: action,
      },
    });
  }

  private decodePipelineCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
    if (!cursor) return null;
    const decoded = decodeCursor(cursor);
    if (!decoded)
      throw opportunityException(
        HttpStatus.BAD_REQUEST,
        OPPORTUNITY_ERROR_CODES.OPERATION_FAILED,
        'El cursor de paginación no es válido.',
      );
    return decoded;
  }

  private pipelinePage(
    records: OpportunityListRecord[],
    limit: number,
  ): { data: OpportunityListRecord[]; nextCursor: string | null } {
    const hasNext = records.length > limit;
    const data = hasNext ? records.slice(0, limit) : records;
    const last = data[data.length - 1];
    return { data, nextCursor: hasNext && last ? encodeCursor(last.createdAt, last.id) : null };
  }

  private pipelineColumn(
    stage: PipelineStageRecord,
    records: OpportunityListRecord[],
    limit: number,
  ): PublicPipelineStage {
    const page = this.pipelinePage(records, limit);
    return {
      ...this.mapStage(stage),
      opportunities: page.data.map((record) => this.mapOpportunity(record)),
      nextCursor: page.nextCursor,
    };
  }

  private async withPipelineLock<T>(
    organizationId: string,
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('superflash:pipeline-stage-order'),
          hashtext(${organizationId})
        )
      `;
      return callback(transaction);
    });
  }

  private async assertStageNameAvailable(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await transaction.pipelineStage.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        ...(excludedId ? { id: { not: excludedId } } : {}),
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) throw this.stageNameConflict();
  }

  private async assertStageSystemKeyAvailable(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    systemKey: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await transaction.pipelineStage.findFirst({
      where: {
        organizationId,
        systemKey,
        deletedAt: null,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw this.stageNameConflict();
  }

  private async syncOperationalFollowUp(
    transaction: Prisma.TransactionClient,
    current: OpportunityMutationRecord,
    target: PipelineStageRecord,
    context: OpportunityRequestContext,
    now: Date,
  ): Promise<void> {
    const suggestedAt = suggestedFollowUpAt(
      target.systemKey ?? target.name,
      this.configuration.defaultTimezone,
      now,
    );
    const existing = await transaction.followUp.findFirst({
      where: {
        organizationId: context.user.organizationId,
        opportunityId: current.id,
        deletedAt: null,
        archivedAt: null,
        status: { in: [FollowUpStatus.PENDING, FollowUpStatus.RESCHEDULED] },
      },
      orderBy: [{ autoSuggested: 'asc' }, { dueAt: 'asc' }],
      select: {
        id: true,
        dueAt: true,
        status: true,
        autoSuggested: true,
        title: true,
        note: true,
        userId: true,
        priority: true,
      },
    });

    if (existing && !existing.autoSuggested) return;

    if (suggestedAt === null) {
      if (!existing) return;
      await transaction.followUp.update({
        where: {
          organizationId_id: { organizationId: context.user.organizationId, id: existing.id },
        },
        data: {
          status: FollowUpStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: 'Estado sin seguimiento automático',
          cancelledByUserId: context.user.userId,
          autoSuggested: true,
        },
      });
      await transaction.followUpHistory.create({
        data: {
          organizationId: context.user.organizationId,
          followUpId: existing.id,
          action: FollowUpHistoryAction.CANCELLED,
          changedByUserId: context.user.userId,
          previousDueAt: existing.dueAt,
          previousStatus: existing.status,
          newStatus: FollowUpStatus.CANCELLED,
          note: 'Estado sin seguimiento automático',
          metadata: { automatic: true },
        },
      });
      return;
    }

    if (existing) {
      if (existing.dueAt.getTime() === suggestedAt.getTime()) return;
      await transaction.followUp.update({
        where: {
          organizationId_id: { organizationId: context.user.organizationId, id: existing.id },
        },
        data: {
          dueAt: suggestedAt,
          status: FollowUpStatus.PENDING,
          autoSuggested: true,
          cancelledAt: null,
          cancellationReason: null,
          cancelledByUserId: null,
        },
      });
      await transaction.followUpHistory.create({
        data: {
          organizationId: context.user.organizationId,
          followUpId: existing.id,
          action: FollowUpHistoryAction.RESCHEDULED,
          changedByUserId: context.user.userId,
          previousDueAt: existing.dueAt,
          newDueAt: suggestedAt,
          previousStatus: existing.status,
          newStatus: FollowUpStatus.PENDING,
          note: 'Seguimiento automático actualizado por cambio de estado',
          metadata: { automatic: true },
        },
      });
      return;
    }

    const userId = current.userId ?? context.user.userId;
    const created = await transaction.followUp.create({
      data: {
        organizationId: context.user.organizationId,
        userId,
        opportunityId: current.id,
        title: `Contactar lead: ${current.title}`,
        dueAt: suggestedAt,
        priority: FollowUpPriority.NORMAL,
        status: FollowUpStatus.PENDING,
        autoSuggested: true,
        createdByUserId: context.user.userId,
      },
      select: { id: true },
    });
    await transaction.followUpHistory.create({
      data: {
        organizationId: context.user.organizationId,
        followUpId: created.id,
        action: FollowUpHistoryAction.CREATED,
        changedByUserId: context.user.userId,
        newDueAt: suggestedAt,
        newStatus: FollowUpStatus.PENDING,
        note: 'Seguimiento automático por estado comercial',
        metadata: { automatic: true },
      },
    });
  }

  private notFound(): Error {
    return opportunityException(
      HttpStatus.NOT_FOUND,
      OPPORTUNITY_ERROR_CODES.NOT_FOUND,
      'Oportunidad no encontrada.',
    );
  }

  private stageNotFound(): Error {
    return opportunityException(
      HttpStatus.NOT_FOUND,
      OPPORTUNITY_ERROR_CODES.STAGE_NOT_FOUND,
      'La etapa no existe o no está activa.',
    );
  }

  private pipelineStageNotFound(): Error {
    return opportunityException(
      HttpStatus.NOT_FOUND,
      PIPELINE_ERROR_CODES.STAGE_NOT_FOUND,
      'La etapa no existe.',
    );
  }

  private stageNameConflict(): Error {
    return opportunityException(
      HttpStatus.CONFLICT,
      PIPELINE_ERROR_CODES.STAGE_NAME_ALREADY_EXISTS,
      'Ya existe una etapa con ese nombre.',
    );
  }

  private invalidOrder(): Error {
    return opportunityException(
      HttpStatus.BAD_REQUEST,
      PIPELINE_ERROR_CODES.INVALID_ORDER,
      'El orden de la etapa no es válido.',
    );
  }

  private stageInUse(): Error {
    return opportunityException(
      HttpStatus.CONFLICT,
      PIPELINE_ERROR_CODES.STAGE_IN_USE,
      'No puedes archivar una etapa que tiene oportunidades activas.',
    );
  }

  private lastCategoryStage(category: PipelineStageCategory): Error {
    const code =
      category === PipelineStageCategory.OPEN
        ? PIPELINE_ERROR_CODES.LAST_OPEN_STAGE
        : category === PipelineStageCategory.WON
          ? PIPELINE_ERROR_CODES.LAST_WON_STAGE
          : PIPELINE_ERROR_CODES.LAST_LOST_STAGE;
    return opportunityException(
      HttpStatus.CONFLICT,
      code,
      'Debe existir al menos una etapa activa de esta categoría.',
    );
  }

  private rethrowDatabaseConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw opportunityException(
        HttpStatus.CONFLICT,
        OPPORTUNITY_ERROR_CODES.OPERATION_FAILED,
        'La operación entra en conflicto con un registro existente.',
      );
    }
    throw error;
  }

  private rethrowPipelineConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw this.stageNameConflict();
    throw error;
  }
}
