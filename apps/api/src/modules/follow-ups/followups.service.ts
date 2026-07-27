import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityType,
  FollowUpHistoryAction,
  FollowUpPriority,
  FollowUpStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { FollowUpAccessPolicy } from './access/followup-access.policy';
import { FOLLOW_UP_ERROR_CODES, followUpException } from './followups.errors';
import {
  FollowUpDetailRecord,
  FollowUpListRecord,
  FollowUpsRepository,
} from './followups.repository';
import {
  asFollowUpJson,
  FollowUpSortField,
  isFollowUpOverdue,
  normalizeFollowUpNote,
} from './followups.types';
import { ArchiveFollowUpDto } from './dto/archive-followup.dto';
import { AssignFollowUpDto } from './dto/assign-followup.dto';
import { CancelFollowUpDto } from './dto/cancel-followup.dto';
import { CompleteFollowUpDto } from './dto/complete-followup.dto';
import { CreateFollowUpDto } from './dto/create-followup.dto';
import { FollowUpHistoryQueryDto } from './dto/history-query.dto';
import { ListFollowUpsQueryDto } from './dto/list-followups-query.dto';
import { RescheduleFollowUpDto } from './dto/reschedule-followup.dto';
import { UpdateFollowUpDto } from './dto/update-followup.dto';

export interface FollowUpRequestContext {
  user: AuthenticatedUser;
  metadata: RequestMetadata;
}

type FollowUpRecord = FollowUpListRecord | FollowUpDetailRecord;

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: FollowUpsRepository,
    private readonly audit: AuditService,
    private readonly accessPolicy: FollowUpAccessPolicy,
  ) {}

  async create(dto: CreateFollowUpDto, context: FollowUpRequestContext): Promise<PublicFollowUp> {
    this.accessPolicy.assertCanCreate(context.user);
    const now = new Date();
    const dueAt = this.parseDate(dto.dueAt, FOLLOW_UP_ERROR_CODES.INVALID_DUE_DATE);
    const reminderAt = this.parseOptionalDate(
      dto.reminderAt,
      FOLLOW_UP_ERROR_CODES.INVALID_REMINDER_DATE,
    );
    this.assertDueDate(dueAt, context.user, now);
    this.assertReminderDate(reminderAt, dueAt);
    const title = this.normalizeTitle(dto.title);
    const note = normalizeFollowUpNote(dto.note);

    try {
      const followUpId = await this.prisma.$transaction(async (transaction) => {
        const opportunity = await transaction.opportunity.findFirst({
          where: {
            organizationId: context.user.organizationId,
            id: dto.opportunityId,
            deletedAt: null,
            archivedAt: null,
            contact: { deletedAt: null },
          },
          select: {
            id: true,
            userId: true,
            pipelineStage: { select: { category: true } },
            contact: { select: { id: true, deletedAt: true } },
          },
        });
        if (!opportunity || opportunity.contact.deletedAt) {
          throw followUpException(
            HttpStatus.NOT_FOUND,
            FOLLOW_UP_ERROR_CODES.OPPORTUNITY_NOT_FOUND,
            'La oportunidad no existe o no está disponible.',
          );
        }
        if (!this.accessPolicy.canCreateForOpportunity(context.user, opportunity.userId)) {
          throw followUpException(
            HttpStatus.FORBIDDEN,
            FOLLOW_UP_ERROR_CODES.UPDATE_FORBIDDEN,
            'No tienes acceso a la oportunidad para crear este seguimiento.',
          );
        }
        if (
          context.user.roleName === 'Sales' &&
          opportunity.pipelineStage.category !== 'OPEN' &&
          !note
        ) {
          throw followUpException(
            HttpStatus.BAD_REQUEST,
            FOLLOW_UP_ERROR_CODES.REASON_REQUIRED,
            'Debes incluir una nota para continuar una oportunidad cerrada.',
          );
        }

        const assignedUserId = dto.assignedUserId ?? opportunity.userId ?? context.user.userId;
        if (context.user.roleName === 'Sales' && assignedUserId !== context.user.userId) {
          throw followUpException(
            HttpStatus.FORBIDDEN,
            FOLLOW_UP_ERROR_CODES.UPDATE_FORBIDDEN,
            'Sales solo puede asignarse seguimientos a sí mismo.',
          );
        }
        await this.assertAssignee(transaction, context.user.organizationId, assignedUserId);

        const followUp = await transaction.followUp.create({
          data: {
            organizationId: context.user.organizationId,
            userId: assignedUserId,
            opportunityId: opportunity.id,
            title,
            dueAt,
            priority: dto.priority,
            status: FollowUpStatus.PENDING,
            note,
            reminderAt,
            createdByUserId: context.user.userId,
          },
          select: { id: true },
        });
        await this.createHistory(transaction, {
          organizationId: context.user.organizationId,
          followUpId: followUp.id,
          action: FollowUpHistoryAction.CREATED,
          changedByUserId: context.user.userId,
          newDueAt: dueAt,
          newStatus: FollowUpStatus.PENDING,
          note,
        });
        await this.recordActivity(
          transaction,
          context,
          opportunity.contact.id,
          opportunity.id,
          followUp.id,
          'Seguimiento programado',
          {
            followUpId: followUp.id,
            dueAt: dueAt.toISOString(),
            priority: dto.priority,
            responsibleUserId: assignedUserId,
          },
        );
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'FOLLOW_UP_CREATED',
          tableName: 'FollowUp',
          recordId: followUp.id,
          newValue: asFollowUpJson({
            opportunityId: opportunity.id,
            responsibleUserId: assignedUserId,
            dueAt: dueAt.toISOString(),
            priority: dto.priority,
            hasNote: Boolean(note),
          }),
          ip: context.metadata.ipAddress,
        });
        await this.touchContact(
          transaction,
          context.user.organizationId,
          opportunity.contact.id,
          now,
        );
        return followUp.id;
      });
      const created = await this.requireVisible(context.user, followUpId);
      return this.toPublic(created, now);
    } catch (error: unknown) {
      return this.rethrowDatabaseConflict(error, {
        organizationId: context.user.organizationId,
        opportunityId: dto.opportunityId,
        userId: dto.assignedUserId ?? context.user.userId,
        dueAt,
      });
    }
  }

  async list(query: ListFollowUpsQueryDto, user: AuthenticatedUser): Promise<FollowUpListResponse> {
    this.accessPolicy.assertCanRead(user);
    const where = this.buildListWhere(query);
    const accessWhere = this.accessPolicy.listWhere(user);
    const orderBy: Prisma.FollowUpOrderByWithRelationInput[] = [
      { [this.sortField(query.sortBy)]: query.sortOrder },
      { id: query.sortOrder },
    ];
    const skip = (query.page - 1) * query.limit;
    const [records, total] = await Promise.all([
      this.repository.findForList(
        user.organizationId,
        this.combineWhere(accessWhere, where),
        orderBy,
        skip,
        query.limit,
      ),
      this.repository.count(user.organizationId, this.combineWhere(accessWhere, where)),
    ]);
    return {
      data: records.map((record) => this.toPublic(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<PublicFollowUpDetail> {
    this.accessPolicy.assertCanRead(user);
    const record = await this.repository.findForMutation(user.organizationId, id);
    if (!record || !this.canReadRecord(user, record)) throw this.notFound();
    return this.toPublicDetail(record);
  }

  async update(
    id: string,
    dto: UpdateFollowUpDto,
    context: FollowUpRequestContext,
  ): Promise<PublicFollowUpDetail> {
    const current = await this.requireMutation(context.user, id);
    this.accessPolicy.assertCanMutate(context.user, this.accessRecord(current));
    this.assertPending(current);
    const reminderAt =
      dto.reminderAt === undefined
        ? current.reminderAt
        : this.parseOptionalDate(dto.reminderAt, FOLLOW_UP_ERROR_CODES.INVALID_REMINDER_DATE);
    this.assertReminderDate(reminderAt, current.dueAt);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.followUp.updateMany({
        where: {
          organizationId: context.user.organizationId,
          id,
          status: FollowUpStatus.PENDING,
          archivedAt: null,
          deletedAt: null,
        },
        data: {
          ...(dto.title !== undefined ? { title: this.normalizeTitle(dto.title) } : {}),
          ...(dto.note !== undefined ? { note: normalizeFollowUpNote(dto.note) } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.reminderAt !== undefined ? { reminderAt } : {}),
        },
      });
      if (updated.count !== 1)
        throw this.operationConflict('El seguimiento cambió mientras se actualizaba.');
      await this.createHistory(transaction, {
        organizationId: context.user.organizationId,
        followUpId: id,
        action: FollowUpHistoryAction.UPDATED,
        changedByUserId: context.user.userId,
        previousStatus: current.status,
        newStatus: current.status,
        note: dto.note === undefined ? null : normalizeFollowUpNote(dto.note),
        metadata: { fields: Object.keys(dto) },
      });
      await this.recordActivity(
        transaction,
        context,
        current.opportunity.contact.id,
        current.opportunity.id,
        id,
        'Seguimiento actualizado',
        {
          followUpId: id,
          changedFields: Object.keys(dto).join(','),
        },
      );
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FOLLOW_UP_UPDATED',
        tableName: 'FollowUp',
        recordId: id,
        previousValue: this.auditValue(current),
        newValue: asFollowUpJson({
          title: dto.title ?? current.title,
          priority: dto.priority?.toString() ?? current.priority.toString(),
          reminderAt: reminderAt?.toISOString() ?? null,
          hasNote:
            dto.note === undefined
              ? Boolean(current.note)
              : Boolean(normalizeFollowUpNote(dto.note)),
        }),
        ip: context.metadata.ipAddress,
      });
      await this.touchContact(
        transaction,
        context.user.organizationId,
        current.opportunity.contact.id,
        now,
      );
    });
    return this.findOne(id, context.user);
  }

  async assign(
    id: string,
    dto: AssignFollowUpDto,
    context: FollowUpRequestContext,
  ): Promise<PublicFollowUpDetail> {
    const current = await this.requireMutation(context.user, id);
    this.accessPolicy.assertCanMutate(context.user, this.accessRecord(current));
    this.assertPending(current);
    if (
      !this.accessPolicy.canAssign(context.user, this.accessRecord(current), dto.assignedUserId)
    ) {
      throw followUpException(
        HttpStatus.FORBIDDEN,
        FOLLOW_UP_ERROR_CODES.UPDATE_FORBIDDEN,
        'No puedes asignar este seguimiento a ese usuario.',
      );
    }
    await this.assertAssignee(this.prisma, context.user.organizationId, dto.assignedUserId);
    if (current.userId === dto.assignedUserId) return this.toPublicDetail(current);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.followUp.updateMany({
        where: {
          organizationId: context.user.organizationId,
          id,
          status: FollowUpStatus.PENDING,
          archivedAt: null,
          deletedAt: null,
        },
        data: { userId: dto.assignedUserId },
      });
      if (updated.count !== 1)
        throw this.operationConflict('El seguimiento cambió mientras se asignaba.');
      await this.createHistory(transaction, {
        organizationId: context.user.organizationId,
        followUpId: id,
        action: FollowUpHistoryAction.ASSIGNEE_CHANGED,
        changedByUserId: context.user.userId,
        note: null,
        metadata: { previousUserId: current.userId, newUserId: dto.assignedUserId },
      });
      await this.recordActivity(
        transaction,
        context,
        current.opportunity.contact.id,
        current.opportunity.id,
        id,
        'Responsable de seguimiento actualizado',
        {
          previousUserId: current.userId,
          newUserId: dto.assignedUserId,
        },
        ActivityType.STATUS_CHANGE,
      );
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FOLLOW_UP_ASSIGNEE_CHANGED',
        tableName: 'FollowUp',
        recordId: id,
        previousValue: asFollowUpJson({ assignedUserId: current.userId }),
        newValue: asFollowUpJson({ assignedUserId: dto.assignedUserId }),
        ip: context.metadata.ipAddress,
      });
      await this.touchContact(
        transaction,
        context.user.organizationId,
        current.opportunity.contact.id,
        now,
      );
    });
    return this.findOne(id, context.user);
  }

  async complete(
    id: string,
    dto: CompleteFollowUpDto,
    context: FollowUpRequestContext,
  ): Promise<PublicFollowUpDetail> {
    const current = await this.requireMutation(context.user, id);
    this.accessPolicy.assertCanMutate(context.user, this.accessRecord(current));
    if (current.status === FollowUpStatus.COMPLETED) return this.toPublicDetail(current);
    if (current.status === FollowUpStatus.CANCELLED)
      throw this.stateError(
        FOLLOW_UP_ERROR_CODES.ALREADY_CANCELLED,
        'El seguimiento ya fue cancelado.',
      );
    if (current.status === FollowUpStatus.RESCHEDULED)
      throw this.stateError(
        FOLLOW_UP_ERROR_CODES.ALREADY_RESCHEDULED,
        'El seguimiento ya fue reprogramado.',
      );
    if (current.archivedAt) throw this.resourceUnavailable();
    const completionNote = normalizeFollowUpNote(dto.completionNote);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.followUp.updateMany({
        where: {
          organizationId: context.user.organizationId,
          id,
          status: FollowUpStatus.PENDING,
          archivedAt: null,
          deletedAt: null,
        },
        data: {
          status: FollowUpStatus.COMPLETED,
          completedAt: now,
          completedByUserId: context.user.userId,
          completionNote,
          cancelledAt: null,
          cancellationReason: null,
          cancelledByUserId: null,
        },
      });
      if (updated.count !== 1)
        throw this.operationConflict('El seguimiento cambió mientras se completaba.');
      await this.createHistory(transaction, {
        organizationId: context.user.organizationId,
        followUpId: id,
        action: FollowUpHistoryAction.COMPLETED,
        changedByUserId: context.user.userId,
        previousStatus: FollowUpStatus.PENDING,
        newStatus: FollowUpStatus.COMPLETED,
        note: completionNote,
      });
      await this.recordActivity(
        transaction,
        context,
        current.opportunity.contact.id,
        current.opportunity.id,
        id,
        'Seguimiento completado',
        { followUpId: id },
      );
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FOLLOW_UP_COMPLETED',
        tableName: 'FollowUp',
        recordId: id,
        previousValue: asFollowUpJson({ status: FollowUpStatus.PENDING }),
        newValue: asFollowUpJson({
          status: FollowUpStatus.COMPLETED,
          hasCompletionNote: Boolean(completionNote),
        }),
        ip: context.metadata.ipAddress,
      });
      await this.touchContact(
        transaction,
        context.user.organizationId,
        current.opportunity.contact.id,
        now,
      );
    });
    return this.findOne(id, context.user);
  }

  async cancel(
    id: string,
    dto: CancelFollowUpDto,
    context: FollowUpRequestContext,
  ): Promise<PublicFollowUpDetail> {
    const current = await this.requireMutation(context.user, id);
    this.accessPolicy.assertCanMutate(context.user, this.accessRecord(current));
    if (current.status === FollowUpStatus.CANCELLED) return this.toPublicDetail(current);
    if (current.status === FollowUpStatus.COMPLETED)
      throw this.stateError(
        FOLLOW_UP_ERROR_CODES.ALREADY_COMPLETED,
        'El seguimiento ya fue completado.',
      );
    if (current.status === FollowUpStatus.RESCHEDULED)
      throw this.stateError(
        FOLLOW_UP_ERROR_CODES.ALREADY_RESCHEDULED,
        'El seguimiento ya fue reprogramado.',
      );
    if (current.archivedAt) throw this.resourceUnavailable();
    const reason = dto.reason.trim().replace(/\s+/g, ' ');
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.followUp.updateMany({
        where: {
          organizationId: context.user.organizationId,
          id,
          status: FollowUpStatus.PENDING,
          archivedAt: null,
          deletedAt: null,
        },
        data: {
          status: FollowUpStatus.CANCELLED,
          cancelledAt: now,
          cancelledByUserId: context.user.userId,
          cancellationReason: reason,
        },
      });
      if (updated.count !== 1)
        throw this.operationConflict('El seguimiento cambió mientras se cancelaba.');
      await this.createHistory(transaction, {
        organizationId: context.user.organizationId,
        followUpId: id,
        action: FollowUpHistoryAction.CANCELLED,
        changedByUserId: context.user.userId,
        previousStatus: FollowUpStatus.PENDING,
        newStatus: FollowUpStatus.CANCELLED,
        note: reason,
      });
      await this.recordActivity(
        transaction,
        context,
        current.opportunity.contact.id,
        current.opportunity.id,
        id,
        'Seguimiento cancelado',
        { followUpId: id },
      );
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FOLLOW_UP_CANCELLED',
        tableName: 'FollowUp',
        recordId: id,
        previousValue: asFollowUpJson({ status: FollowUpStatus.PENDING }),
        newValue: asFollowUpJson({ status: FollowUpStatus.CANCELLED, hasReason: true }),
        ip: context.metadata.ipAddress,
      });
      await this.touchContact(
        transaction,
        context.user.organizationId,
        current.opportunity.contact.id,
        now,
      );
    });
    return this.findOne(id, context.user);
  }

  async reschedule(
    id: string,
    dto: RescheduleFollowUpDto,
    context: FollowUpRequestContext,
  ): Promise<{ original: PublicFollowUpDetail; replacement: PublicFollowUpDetail }> {
    const current = await this.requireMutation(context.user, id);
    this.accessPolicy.assertCanMutate(context.user, this.accessRecord(current));
    this.assertPending(current);
    if (current.archivedAt) throw this.resourceUnavailable();
    const dueAt = this.parseDate(dto.dueAt, FOLLOW_UP_ERROR_CODES.INVALID_DUE_DATE);
    const reminderAt = this.parseOptionalDate(
      dto.reminderAt,
      FOLLOW_UP_ERROR_CODES.INVALID_REMINDER_DATE,
    );
    if (dueAt.getTime() === current.dueAt.getTime()) {
      throw followUpException(
        HttpStatus.BAD_REQUEST,
        FOLLOW_UP_ERROR_CODES.INVALID_DUE_DATE,
        'La nueva fecha debe ser diferente.',
      );
    }
    this.assertDueDate(dueAt, context.user, new Date());
    this.assertReminderDate(reminderAt, dueAt);
    const reason = dto.reason.trim().replace(/\s+/g, ' ');
    const now = new Date();
    let replacementId = '';
    try {
      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.followUp.updateMany({
          where: {
            organizationId: context.user.organizationId,
            id,
            status: FollowUpStatus.PENDING,
            archivedAt: null,
            deletedAt: null,
          },
          data: { status: FollowUpStatus.RESCHEDULED, rescheduledAt: now },
        });
        if (updated.count !== 1)
          throw this.stateError(
            FOLLOW_UP_ERROR_CODES.ALREADY_RESCHEDULED,
            'El seguimiento ya fue reprogramado.',
          );
        const replacement = await transaction.followUp.create({
          data: {
            organizationId: context.user.organizationId,
            userId: current.userId,
            opportunityId: current.opportunityId,
            title: current.title,
            dueAt,
            reminderAt,
            priority: current.priority,
            status: FollowUpStatus.PENDING,
            note: current.note,
            rescheduledFromId: id,
            createdByUserId: context.user.userId,
          },
          select: { id: true },
        });
        replacementId = replacement.id;
        await this.createHistory(transaction, {
          organizationId: context.user.organizationId,
          followUpId: id,
          action: FollowUpHistoryAction.RESCHEDULED,
          changedByUserId: context.user.userId,
          previousDueAt: current.dueAt,
          newDueAt: dueAt,
          previousStatus: FollowUpStatus.PENDING,
          newStatus: FollowUpStatus.RESCHEDULED,
          note: reason,
          metadata: { replacementId },
        });
        await this.createHistory(transaction, {
          organizationId: context.user.organizationId,
          followUpId: replacement.id,
          action: FollowUpHistoryAction.CREATED,
          changedByUserId: context.user.userId,
          newDueAt: dueAt,
          newStatus: FollowUpStatus.PENDING,
          note: reason,
          metadata: { rescheduledFromId: id },
        });
        await this.recordActivity(
          transaction,
          context,
          current.opportunity.contact.id,
          current.opportunity.id,
          id,
          'Seguimiento reprogramado',
          { followUpId: id, replacementId },
        );
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'FOLLOW_UP_RESCHEDULED',
          tableName: 'FollowUp',
          recordId: id,
          previousValue: asFollowUpJson({
            status: FollowUpStatus.PENDING,
            dueAt: current.dueAt.toISOString(),
          }),
          newValue: asFollowUpJson({
            status: FollowUpStatus.RESCHEDULED,
            dueAt: dueAt.toISOString(),
            replacementId,
          }),
          ip: context.metadata.ipAddress,
        });
        await this.touchContact(
          transaction,
          context.user.organizationId,
          current.opportunity.contact.id,
          now,
        );
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.repository.findDuplicate(
          context.user.organizationId,
          current.opportunityId,
          current.userId,
          dueAt,
        );
        if (duplicate) throw this.alreadyExists(duplicate.id);
      }
      throw error;
    }
    const [original, replacement] = await Promise.all([
      this.requireVisible(context.user, id),
      this.requireVisible(context.user, replacementId),
    ]);
    return {
      original: this.toPublicDetail(original),
      replacement: this.toPublicDetail(replacement),
    };
  }

  async archive(
    id: string,
    dto: ArchiveFollowUpDto,
    context: FollowUpRequestContext,
  ): Promise<PublicFollowUpDetail> {
    const current = await this.requireMutation(context.user, id);
    this.accessPolicy.assertCanMutate(context.user, this.accessRecord(current));
    if (current.archivedAt) return this.toPublicDetail(current);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.followUp.updateMany({
        where: {
          organizationId: context.user.organizationId,
          id,
          archivedAt: null,
          deletedAt: null,
        },
        data: { archivedAt: now },
      });
      if (updated.count !== 1) return;
      await this.createHistory(transaction, {
        organizationId: context.user.organizationId,
        followUpId: id,
        action: FollowUpHistoryAction.ARCHIVED,
        changedByUserId: context.user.userId,
        previousStatus: current.status,
        newStatus: current.status,
        note: dto.reason ?? null,
      });
      await this.recordActivity(
        transaction,
        context,
        current.opportunity.contact.id,
        current.opportunity.id,
        id,
        'Seguimiento archivado',
        { followUpId: id },
      );
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FOLLOW_UP_ARCHIVED',
        tableName: 'FollowUp',
        recordId: id,
        previousValue: asFollowUpJson({ archivedAt: null }),
        newValue: asFollowUpJson({ archivedAt: now.toISOString(), reason: dto.reason ?? null }),
        ip: context.metadata.ipAddress,
      });
      await this.touchContact(
        transaction,
        context.user.organizationId,
        current.opportunity.contact.id,
        now,
      );
    });
    return this.findOne(id, context.user);
  }

  async restore(id: string, context: FollowUpRequestContext): Promise<PublicFollowUpDetail> {
    const current = await this.requireMutation(context.user, id);
    this.accessPolicy.assertCanMutate(context.user, this.accessRecord(current));
    const archivedAt = current.archivedAt;
    if (!archivedAt) return this.toPublicDetail(current);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const opportunity = await transaction.opportunity.findFirst({
        where: { organizationId: context.user.organizationId, id: current.opportunityId },
        select: { id: true, deletedAt: true, contact: { select: { id: true, deletedAt: true } } },
      });
      if (!opportunity || opportunity.deletedAt || opportunity.contact.deletedAt)
        throw this.resourceUnavailable();
      if (current.status === FollowUpStatus.PENDING) {
        const duplicate = await transaction.followUp.findFirst({
          where: {
            organizationId: context.user.organizationId,
            opportunityId: current.opportunityId,
            userId: current.userId,
            dueAt: current.dueAt,
            status: FollowUpStatus.PENDING,
            archivedAt: null,
            deletedAt: null,
            id: { not: id },
          },
          select: { id: true },
        });
        if (duplicate) throw this.restoreConflict(duplicate.id);
      }
      const restored = await transaction.followUp.updateMany({
        where: {
          organizationId: context.user.organizationId,
          id,
          archivedAt: { not: null },
          deletedAt: null,
          opportunity: { deletedAt: null, contact: { deletedAt: null } },
        },
        data: { archivedAt: null },
      });
      if (restored.count !== 1) return;
      await this.createHistory(transaction, {
        organizationId: context.user.organizationId,
        followUpId: id,
        action: FollowUpHistoryAction.RESTORED,
        changedByUserId: context.user.userId,
        previousStatus: current.status,
        newStatus: current.status,
      });
      await this.recordActivity(
        transaction,
        context,
        current.opportunity.contact.id,
        current.opportunity.id,
        id,
        'Seguimiento restaurado',
        { followUpId: id },
      );
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'FOLLOW_UP_RESTORED',
        tableName: 'FollowUp',
        recordId: id,
        previousValue: asFollowUpJson({ archivedAt: archivedAt.toISOString() }),
        newValue: asFollowUpJson({ archivedAt: null }),
        ip: context.metadata.ipAddress,
      });
      await this.touchContact(
        transaction,
        context.user.organizationId,
        current.opportunity.contact.id,
        now,
      );
    });
    return this.findOne(id, context.user);
  }

  async history(
    id: string,
    query: FollowUpHistoryQueryDto,
    user: AuthenticatedUser,
  ): Promise<HistoryResponse> {
    const current = await this.requireMutation(user, id);
    this.accessPolicy.assertCanRead(user);
    if (!this.canReadRecord(user, current)) throw this.notFound();
    const skip = (query.page - 1) * query.limit;
    const [records, total] = await Promise.all([
      this.repository.findHistory(user.organizationId, id, skip, query.limit),
      this.repository.countHistory(user.organizationId, id),
    ]);
    return {
      data: records.map((record) => ({
        id: record.id,
        action: record.action,
        changedBy: record.changedBy,
        previousDueAt: record.previousDueAt,
        newDueAt: record.newDueAt,
        previousStatus: record.previousStatus,
        newStatus: record.newStatus,
        note: record.note,
        changedAt: record.changedAt,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  public toPublic(record: FollowUpRecord, now = new Date()): PublicFollowUp {
    return {
      id: record.id,
      title: record.title,
      dueAt: record.dueAt,
      reminderAt: record.reminderAt,
      priority: record.priority,
      status: record.status,
      isOverdue: isFollowUpOverdue(record.status, record.dueAt, now),
      note: record.note,
      completedAt: record.completedAt,
      cancelledAt: record.cancelledAt,
      archivedAt: record.archivedAt,
      responsible: record.responsible,
      opportunity: this.publicOpportunity(record.opportunity),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  public toPublicDetail(record: FollowUpDetailRecord): PublicFollowUpDetail {
    return {
      ...this.toPublic(record),
      completionNote: record.completionNote,
      cancellationReason: record.cancellationReason,
      createdBy: record.createdBy,
      completedBy: record.completedBy,
      cancelledBy: record.cancelledBy,
      rescheduledFrom: record.rescheduledFrom,
      history: record.histories.map((history) => ({
        id: history.id,
        action: history.action,
        changedBy: history.changedBy,
        previousDueAt: history.previousDueAt,
        newDueAt: history.newDueAt,
        previousStatus: history.previousStatus,
        newStatus: history.newStatus,
        note: history.note,
        changedAt: history.changedAt,
      })),
      activities: record.activities,
    };
  }

  private async requireMutation(
    user: AuthenticatedUser,
    id: string,
  ): Promise<FollowUpDetailRecord> {
    const record = await this.repository.findForMutation(user.organizationId, id);
    if (!record) throw this.notFound();
    return record;
  }

  private async requireVisible(user: AuthenticatedUser, id: string): Promise<FollowUpDetailRecord> {
    const record = await this.requireMutation(user, id);
    if (!this.canReadRecord(user, record)) throw this.notFound();
    return record;
  }

  private canReadRecord(user: AuthenticatedUser, record: FollowUpDetailRecord): boolean {
    return (
      user.roleName !== 'Sales' ||
      record.userId === user.userId ||
      record.opportunity.userId === user.userId ||
      record.opportunity.userId === null
    );
  }

  private accessRecord(record: FollowUpDetailRecord): {
    userId: string | null;
    opportunityUserId: string | null;
  } {
    return { userId: record.userId, opportunityUserId: record.opportunity.userId };
  }

  private buildListWhere(query: ListFollowUpsQueryDto): Prisma.FollowUpWhereInput {
    const now = new Date();
    const filters: Prisma.FollowUpWhereInput[] = [
      { archivedAt: query.archived === true ? { not: null } : null },
    ];
    if (query.opportunityId) filters.push({ opportunityId: query.opportunityId });
    if (query.contactId) filters.push({ opportunity: { contactId: query.contactId } });
    if (query.assignedUserId) filters.push({ userId: query.assignedUserId });
    if (query.priority) filters.push({ priority: query.priority });
    if (query.status) filters.push({ status: query.status });
    if (query.overdue === true)
      filters.push({ status: FollowUpStatus.PENDING, dueAt: { lt: now } });
    if (query.overdue === false)
      filters.push({ OR: [{ status: { not: FollowUpStatus.PENDING } }, { dueAt: { gte: now } }] });
    if (query.dueFrom || query.dueTo) {
      filters.push({
        dueAt: {
          ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
          ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
        },
      });
    }
    if (query.createdFrom || query.createdTo) {
      filters.push({
        createdAt: {
          ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
          ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
        },
      });
    }
    if (query.search) {
      filters.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { note: { contains: query.search, mode: 'insensitive' } },
          { opportunity: { title: { contains: query.search, mode: 'insensitive' } } },
          {
            opportunity: {
              contact: { firstName: { contains: query.search, mode: 'insensitive' } },
            },
          },
          {
            opportunity: { contact: { lastName: { contains: query.search, mode: 'insensitive' } } },
          },
          { opportunity: { contact: { email: { contains: query.search, mode: 'insensitive' } } } },
        ],
      });
    }
    return {
      AND: filters,
    };
  }

  private combineWhere(...where: Prisma.FollowUpWhereInput[]): Prisma.FollowUpWhereInput {
    return { AND: where };
  }

  private sortField(value: FollowUpSortField): FollowUpSortField {
    return value;
  }

  private normalizeTitle(value: string): string {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (normalized.length < 2 || normalized.length > 160)
      throw this.operationConflict('El título del seguimiento no es válido.');
    return normalized;
  }

  private parseDate(value: string, code: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
      throw followUpException(
        HttpStatus.BAD_REQUEST,
        code,
        'La fecha del seguimiento no es válida.',
      );
    return date;
  }

  private parseOptionalDate(value: string | null | undefined, code: string): Date | null {
    return value === undefined || value === null ? null : this.parseDate(value, code);
  }

  private assertDueDate(dueAt: Date, user: AuthenticatedUser, now: Date): void {
    const maximum = new Date(now);
    maximum.setUTCFullYear(maximum.getUTCFullYear() + 5);
    if (dueAt.getTime() > maximum.getTime() || (user.roleName === 'Sales' && dueAt < now)) {
      throw followUpException(
        HttpStatus.BAD_REQUEST,
        FOLLOW_UP_ERROR_CODES.INVALID_DUE_DATE,
        'La fecha debe estar dentro de la ventana permitida.',
      );
    }
  }

  private assertReminderDate(reminderAt: Date | null, dueAt: Date): void {
    if (!reminderAt) return;
    const earliest = dueAt.getTime() - 90 * 24 * 60 * 60 * 1000;
    if (reminderAt.getTime() > dueAt.getTime() || reminderAt.getTime() < earliest) {
      throw followUpException(
        HttpStatus.BAD_REQUEST,
        FOLLOW_UP_ERROR_CODES.INVALID_REMINDER_DATE,
        'El recordatorio debe ser anterior a la fecha y no superar 90 días.',
      );
    }
  }

  private assertPending(record: FollowUpDetailRecord): void {
    if (record.status === FollowUpStatus.COMPLETED)
      throw this.stateError(
        FOLLOW_UP_ERROR_CODES.ALREADY_COMPLETED,
        'El seguimiento ya fue completado.',
      );
    if (record.status === FollowUpStatus.CANCELLED)
      throw this.stateError(
        FOLLOW_UP_ERROR_CODES.ALREADY_CANCELLED,
        'El seguimiento ya fue cancelado.',
      );
    if (record.status === FollowUpStatus.RESCHEDULED)
      throw this.stateError(
        FOLLOW_UP_ERROR_CODES.ALREADY_RESCHEDULED,
        'El seguimiento ya fue reprogramado.',
      );
    if (record.archivedAt) throw this.resourceUnavailable();
  }

  private async assertAssignee(
    client: PrismaService | Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const user = await client.user.findFirst({
      where: {
        organizationId,
        id: userId,
        status: 'ACTIVE',
        deletedAt: null,
        role: { deletedAt: null },
      },
      select: { id: true },
    });
    if (!user)
      throw followUpException(
        HttpStatus.NOT_FOUND,
        FOLLOW_UP_ERROR_CODES.ASSIGNEE_NOT_FOUND,
        'El responsable no existe o no está activo.',
      );
  }

  private async createHistory(
    client: Prisma.TransactionClient,
    input: Prisma.FollowUpHistoryCreateArgs['data'],
  ): Promise<void> {
    await client.followUpHistory.create({ data: input });
  }

  private async recordActivity(
    client: Prisma.TransactionClient,
    context: FollowUpRequestContext,
    contactId: string,
    opportunityId: string,
    followUpId: string,
    title: string,
    metadata: Record<string, string | null>,
    type: ActivityType = ActivityType.FOLLOWUP,
  ): Promise<void> {
    await client.activity.create({
      data: {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        contactId,
        opportunityId,
        followUpId,
        type,
        title,
        occurredAt: new Date(),
        metadata: asFollowUpJson(metadata),
      },
    });
  }

  private async touchContact(
    client: Prisma.TransactionClient,
    organizationId: string,
    contactId: string,
    now: Date,
  ): Promise<void> {
    await client.contact.update({
      where: { organizationId_id: { organizationId, id: contactId } },
      data: { lastActivityAt: now },
    });
  }

  private auditValue(record: FollowUpDetailRecord): Prisma.InputJsonObject {
    return asFollowUpJson({
      title: record.title,
      status: record.status,
      dueAt: record.dueAt.toISOString(),
      priority: record.priority,
      assignedUserId: record.userId,
      archivedAt: record.archivedAt?.toISOString() ?? null,
    });
  }

  private publicOpportunity(
    opportunity: FollowUpListRecord['opportunity'],
  ): PublicFollowUpOpportunity {
    return {
      id: opportunity.id,
      title: opportunity.title,
      status: opportunity.archivedAt ? 'ARCHIVED' : opportunity.pipelineStage.category,
      pipelineStage: opportunity.pipelineStage,
      contact: {
        id: opportunity.contact.id,
        displayName:
          [opportunity.contact.firstName, opportunity.contact.lastName].filter(Boolean).join(' ') ||
          null,
        phone: opportunity.contact.phone,
        country: opportunity.contact.country,
      },
    };
  }

  private notFound(): Error {
    return followUpException(
      HttpStatus.NOT_FOUND,
      FOLLOW_UP_ERROR_CODES.NOT_FOUND,
      'Seguimiento no encontrado.',
    );
  }

  private resourceUnavailable(): Error {
    return followUpException(
      HttpStatus.CONFLICT,
      FOLLOW_UP_ERROR_CODES.RESOURCE_UNAVAILABLE,
      'La oportunidad o el contacto ya no están disponibles.',
    );
  }

  private alreadyExists(existingFollowUpId: string): Error {
    return followUpException(
      HttpStatus.CONFLICT,
      FOLLOW_UP_ERROR_CODES.ALREADY_EXISTS,
      'Ya existe un seguimiento activo con los mismos datos.',
      { existingFollowUpId },
    );
  }

  private restoreConflict(existingFollowUpId: string): Error {
    return followUpException(
      HttpStatus.CONFLICT,
      FOLLOW_UP_ERROR_CODES.RESTORE_CONFLICT,
      'No se puede restaurar porque existe un seguimiento activo duplicado.',
      { existingFollowUpId },
    );
  }

  private stateError(code: string, message: string): Error {
    return followUpException(HttpStatus.CONFLICT, code, message);
  }

  private operationConflict(message: string): Error {
    return followUpException(HttpStatus.CONFLICT, FOLLOW_UP_ERROR_CODES.OPERATION_FAILED, message);
  }

  private async rethrowDatabaseConflict(
    error: unknown,
    duplicate: { organizationId: string; opportunityId: string; userId: string; dueAt: Date },
  ): Promise<never> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing =
        (await this.repository.findDuplicate(
          duplicate.organizationId,
          duplicate.opportunityId,
          duplicate.userId,
          duplicate.dueAt,
        )) ??
        (await this.repository.findDuplicateAny(
          duplicate.organizationId,
          duplicate.opportunityId,
          duplicate.dueAt,
        ));
      if (existing) throw this.alreadyExists(existing.id);
    }
    throw error;
  }
}

export interface PublicFollowUpOpportunity {
  id: string;
  title: string;
  status: string;
  pipelineStage: {
    id: string;
    name: string;
    color: string;
    category: string;
    systemKey: string | null;
  };
  contact: { id: string; displayName: string | null; phone: string | null; country: string | null };
}

export interface PublicFollowUp {
  id: string;
  title: string;
  dueAt: Date;
  reminderAt: Date | null;
  priority: FollowUpPriority;
  status: FollowUpStatus;
  isOverdue: boolean;
  note: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  archivedAt: Date | null;
  responsible: { id: string; firstName: string; lastName: string | null };
  opportunity: PublicFollowUpOpportunity;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicFollowUpDetail extends PublicFollowUp {
  completionNote: string | null;
  cancellationReason: string | null;
  createdBy: { id: string; firstName: string; lastName: string | null } | null;
  completedBy: { id: string; firstName: string; lastName: string | null } | null;
  cancelledBy: { id: string; firstName: string; lastName: string | null } | null;
  rescheduledFrom: { id: string; title: string; dueAt: Date; status: FollowUpStatus } | null;
  history: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
}

export interface FollowUpListResponse {
  data: PublicFollowUp[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface HistoryResponse {
  data: Array<Record<string, unknown>>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
