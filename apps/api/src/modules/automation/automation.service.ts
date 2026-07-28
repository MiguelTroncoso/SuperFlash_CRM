import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  ActivityType,
  AutomationActionType,
  AutomationExecutionStatus,
  AutomationTrigger,
  FollowUpHistoryAction,
  FollowUpPriority,
  FollowUpStatus,
  MessageTemplateStatus,
  NotificationStatus,
  Prisma,
} from '@prisma/client';

import {
  CommercialEvent,
  CommercialEventName,
} from '../../infrastructure/events/application-event-bus';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateAutomationDto } from './dto/create-automation.dto';
import {
  ListAutomationExecutionsQueryDto,
  ListAutomationsQueryDto,
} from './dto/list-automations-query.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';
import {
  AUTOMATION_TRIGGER_EVENTS,
  INTERNAL_OUTBOX_EVENT_NAMES,
  PublicAutomationAction,
  PublicAutomationExecution,
  PublicAutomationRule,
  asInputJson,
  asJsonRecord,
  eventContextEnvelope,
  isJsonRecord,
  readString,
} from './automation.types';
import { TemplateRendererService } from './templates/template-renderer.service';

export const AUTOMATION_ERROR_CODES = {
  NOT_FOUND: 'AUTOMATION_NOT_FOUND',
  NAME_ALREADY_EXISTS: 'AUTOMATION_NAME_ALREADY_EXISTS',
  TEMPLATE_NOT_FOUND: 'AUTOMATION_TEMPLATE_NOT_FOUND',
  ACTIONS_REQUIRED: 'AUTOMATION_ACTIONS_REQUIRED',
  INVALID_ACTION_CONFIG: 'AUTOMATION_INVALID_ACTION_CONFIG',
} as const;

const MAX_EXECUTION_ATTEMPTS = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function automationError(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return asInputJson(value) as Prisma.InputJsonObject;
}

function isUuid(value: string | null): value is string {
  return value !== null && UUID_PATTERN.test(value);
}

interface ActionResult {
  status: 'SUCCEEDED' | 'SKIPPED';
  result: Record<string, unknown>;
}

interface ClaimedExecution {
  id: string;
  attempts: number;
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly renderer: TemplateRendererService,
  ) {}

  async listRules(
    query: ListAutomationsQueryDto,
    user: AuthenticatedUser,
  ): Promise<{ data: PublicAutomationRule[]; pagination: Record<string, number> }> {
    const where: Prisma.AutomationRuleWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.trigger ? { trigger: query.trigger } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [rules, total] = await Promise.all([
      this.prisma.automationRule.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          actions: { orderBy: { actionOrder: 'asc' } },
          template: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.automationRule.count({ where }),
    ]);
    return {
      data: rules.map((rule) => this.toPublicRule(rule)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findRule(id: string, user: AuthenticatedUser): Promise<PublicAutomationRule> {
    const rule = await this.prisma.automationRule.findFirst({
      where: { organizationId: user.organizationId, id, deletedAt: null },
      include: {
        actions: { orderBy: { actionOrder: 'asc' } },
        template: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!rule)
      throw automationError(
        HttpStatus.NOT_FOUND,
        AUTOMATION_ERROR_CODES.NOT_FOUND,
        'La automatización no existe.',
      );
    return this.toPublicRule(rule);
  }

  async createRule(
    dto: CreateAutomationDto,
    context: { user: AuthenticatedUser; requestId?: string },
  ): Promise<PublicAutomationRule> {
    this.validateActions(dto);
    try {
      const rule = await this.prisma.$transaction(async (transaction) => {
        if (dto.templateId)
          await this.assertTemplate(transaction, context.user.organizationId, dto.templateId);
        const created = await transaction.automationRule.create({
          data: {
            organizationId: context.user.organizationId,
            createdByUserId: context.user.userId,
            templateId: dto.templateId ?? null,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            trigger: dto.trigger,
            ...(dto.conditions !== undefined && dto.conditions !== null
              ? { conditions: asInputJson(dto.conditions) }
              : {}),
            active: dto.active ?? false,
            actions: {
              create: dto.actions.map((action) => ({
                organization: { connect: { id: context.user.organizationId } },
                actionOrder: action.actionOrder,
                type: action.type,
                config: asInputJson(action.config),
              })),
            },
          },
          include: {
            actions: { orderBy: { actionOrder: 'asc' } },
            template: { select: { id: true, name: true, slug: true } },
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'AUTOMATION_CREATED',
          tableName: 'AutomationRule',
          recordId: created.id,
          newValue: jsonObject({
            name: created.name,
            trigger: created.trigger,
            active: created.active,
            actionCount: dto.actions.length,
          }),
          requestId: context.requestId,
        });
        return created.id;
      });
      return this.findRule(rule, context.user);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw automationError(
          HttpStatus.CONFLICT,
          AUTOMATION_ERROR_CODES.NAME_ALREADY_EXISTS,
          'Ya existe una automatización con ese nombre.',
        );
      }
      throw error;
    }
  }

  async updateRule(
    id: string,
    dto: UpdateAutomationDto,
    context: { user: AuthenticatedUser; requestId?: string },
  ): Promise<PublicAutomationRule> {
    if (dto.actions) this.validateActions(dto);
    const current = await this.findRuleRecord(context.user.organizationId, id);
    if (!current)
      throw automationError(
        HttpStatus.NOT_FOUND,
        AUTOMATION_ERROR_CODES.NOT_FOUND,
        'La automatización no existe.',
      );
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        if (dto.templateId)
          await this.assertTemplate(transaction, context.user.organizationId, dto.templateId);
        if (dto.actions) {
          await transaction.automationAction.deleteMany({
            where: { organizationId: context.user.organizationId, automationRuleId: id },
          });
          await transaction.automationAction.createMany({
            data: dto.actions.map((action) => ({
              organizationId: context.user.organizationId,
              automationRuleId: id,
              actionOrder: action.actionOrder,
              type: action.type,
              config: asInputJson(action.config),
            })),
          });
        }
        const record = await transaction.automationRule.update({
          where: { organizationId_id: { organizationId: context.user.organizationId, id } },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description?.trim() || null }
              : {}),
            ...(dto.trigger !== undefined ? { trigger: dto.trigger } : {}),
            ...(dto.conditions !== undefined
              ? {
                  conditions:
                    dto.conditions === null ? Prisma.JsonNull : asInputJson(dto.conditions),
                }
              : {}),
            ...(dto.templateId === null
              ? { template: { disconnect: true } }
              : dto.templateId !== undefined
                ? {
                    template: {
                      connect: {
                        organizationId_id: {
                          organizationId: context.user.organizationId,
                          id: dto.templateId,
                        },
                      },
                    },
                  }
                : {}),
            ...(dto.active !== undefined ? { active: dto.active } : {}),
          },
          include: {
            actions: { orderBy: { actionOrder: 'asc' } },
            template: { select: { id: true, name: true, slug: true } },
          },
        });
        await this.audit.recordWithClient(transaction, {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          action: 'AUTOMATION_UPDATED',
          tableName: 'AutomationRule',
          recordId: id,
          previousValue: jsonObject({
            name: current.name,
            trigger: current.trigger,
            active: current.active,
          }),
          newValue: jsonObject({
            name: record.name,
            trigger: record.trigger,
            active: record.active,
          }),
          requestId: context.requestId,
        });
        return record.id;
      });
      return this.findRule(updated, context.user);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw automationError(
          HttpStatus.CONFLICT,
          AUTOMATION_ERROR_CODES.NAME_ALREADY_EXISTS,
          'Ya existe una automatización con ese nombre.',
        );
      }
      throw error;
    }
  }

  async toggle(
    id: string,
    active: boolean,
    context: { user: AuthenticatedUser; requestId?: string },
  ): Promise<PublicAutomationRule> {
    const updated = await this.prisma.automationRule.updateMany({
      where: { organizationId: context.user.organizationId, id, deletedAt: null },
      data: { active },
    });
    if (updated.count === 0)
      throw automationError(
        HttpStatus.NOT_FOUND,
        AUTOMATION_ERROR_CODES.NOT_FOUND,
        'La automatización no existe.',
      );
    await this.audit.record({
      organizationId: context.user.organizationId,
      userId: context.user.userId,
      action: active ? 'AUTOMATION_ACTIVATED' : 'AUTOMATION_DEACTIVATED',
      tableName: 'AutomationRule',
      recordId: id,
      newValue: jsonObject({ active }),
      requestId: context.requestId,
    });
    return this.findRule(id, context.user);
  }

  async listExecutions(
    query: ListAutomationExecutionsQueryDto,
    user: AuthenticatedUser,
  ): Promise<{ data: PublicAutomationExecution[]; pagination: Record<string, number> }> {
    const where: Prisma.AutomationExecutionWhereInput = {
      organizationId: user.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.trigger ? { trigger: query.trigger } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [executions, total] = await Promise.all([
      this.prisma.automationExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: { rule: { select: { name: true } }, actions: { orderBy: { actionOrder: 'asc' } } },
      }),
      this.prisma.automationExecution.count({ where }),
    ]);
    return {
      data: executions.map((execution) => ({
        id: execution.id,
        automationRuleId: execution.automationRuleId,
        ruleName: execution.rule.name,
        trigger: execution.trigger,
        sourceEventId: execution.sourceEventId,
        aggregateType: execution.aggregateType,
        aggregateId: execution.aggregateId,
        requestId: execution.requestId,
        status: execution.status,
        attempts: execution.attempts,
        availableAt: execution.availableAt,
        processingAt: execution.processingAt,
        completedAt: execution.completedAt,
        lastError: execution.lastError,
        resultPayload: execution.resultPayload,
        createdAt: execution.createdAt,
        actions: execution.actions.map((action) => ({
          id: action.id,
          actionOrder: action.actionOrder,
          type: action.type,
          status: action.status,
          errorMessage: action.errorMessage,
          resultPayload: action.resultPayload,
          completedAt: action.completedAt,
        })),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async enqueueFromEvent(eventName: CommercialEventName, event: CommercialEvent): Promise<void> {
    const trigger = AUTOMATION_TRIGGER_EVENTS[eventName];
    if (!trigger) return;
    const context = await this.buildContext(eventName, event);
    const rules = await this.prisma.automationRule.findMany({
      where: { organizationId: event.organizationId, trigger, active: true, deletedAt: null },
      include: { actions: { orderBy: { actionOrder: 'asc' } } },
    });
    if (rules.length === 0) return;
    await this.prisma.$transaction(async (transaction) => {
      for (const rule of rules) {
        if (!this.matchesConditions(rule.conditions, context)) continue;
        try {
          await transaction.automationExecution.create({
            data: {
              organizationId: event.organizationId,
              automationRuleId: rule.id,
              actorId: isUuid(event.actorUserId) ? event.actorUserId : rule.createdByUserId,
              trigger,
              sourceEventId: event.eventId,
              aggregateType: event.aggregateType,
              aggregateId: event.aggregateId,
              requestId: event.requestId,
              inputPayload: asInputJson(context),
              actions: {
                create: rule.actions.map((action) => ({
                  organization: { connect: { id: event.organizationId } },
                  action: {
                    connect: {
                      organizationId_id: { organizationId: event.organizationId, id: action.id },
                    },
                  },
                  actionOrder: action.actionOrder,
                  type: action.type,
                  config: asInputJson(action.config),
                })),
              },
            },
          });
        } catch (error: unknown) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
            throw error;
        }
      }
    });
  }

  async processAvailable(): Promise<void> {
    const claimed = await this.claimBatch();
    for (const execution of claimed) await this.runExecution(execution);
  }

  async enqueueScheduledTriggers(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
    const [trials, renewals] = await Promise.all([
      this.prisma.trial.findMany({
        where: { status: 'ACTIVE', deletedAt: null, endsAt: { gt: now, lte: windowEnd } },
        select: { id: true, organizationId: true, endsAt: true },
      }),
      this.prisma.renewal.findMany({
        where: {
          status: { in: ['PENDING', 'DUE', 'OVERDUE'] },
          deletedAt: null,
          dueAt: { lte: now },
        },
        select: { id: true, organizationId: true, subscriptionId: true, dueAt: true },
      }),
    ]);
    for (const trial of trials) {
      await this.outbox.enqueue({
        eventType: 'TrialExpiring',
        organizationId: trial.organizationId,
        aggregateType: 'Trial',
        aggregateId: trial.id,
        actorId: null,
        requestId: `scheduled:trial-expiring:${trial.id}:${trial.endsAt.toISOString()}`,
        deduplicationKey: `TrialExpiring:${trial.id}:${trial.endsAt.toISOString()}`,
        payload: jsonObject({ trial: { id: trial.id, endsAt: trial.endsAt.toISOString() } }),
      });
    }
    for (const renewal of renewals) {
      await this.outbox.enqueue({
        eventType: 'SubscriptionRenewalDue',
        organizationId: renewal.organizationId,
        aggregateType: 'Renewal',
        aggregateId: renewal.id,
        actorId: null,
        requestId: `scheduled:renewal-due:${renewal.id}:${renewal.dueAt.toISOString()}`,
        deduplicationKey: `SubscriptionRenewalDue:${renewal.id}:${renewal.dueAt.toISOString()}`,
        payload: jsonObject({
          renewal: {
            id: renewal.id,
            subscriptionId: renewal.subscriptionId,
            dueAt: renewal.dueAt.toISOString(),
          },
        }),
      });
    }
  }

  private async claimBatch(): Promise<ClaimedExecution[]> {
    const now = new Date();
    const staleAt = new Date(now.getTime() - 5 * 60 * 1_000);
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<ClaimedExecution[]>(Prisma.sql`
        SELECT "id", "attempts"
        FROM "AutomationExecution"
        WHERE (("status" IN ('QUEUED', 'FAILED') AND "availableAt" <= ${now})
           OR ("status" = 'RUNNING' AND "processingAt" < ${staleAt}))
          AND "attempts" < ${MAX_EXECUTION_ATTEMPTS}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 10
      `);
      if (rows.length > 0) {
        await transaction.automationExecution.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: {
            status: AutomationExecutionStatus.RUNNING,
            processingAt: now,
            attempts: { increment: 1 },
          },
        });
      }
      return rows;
    });
  }

  private async runExecution(execution: ClaimedExecution): Promise<void> {
    const record = await this.prisma.automationExecution.findUnique({
      where: { id: execution.id },
      include: { rule: true, actions: { orderBy: { actionOrder: 'asc' } } },
    });
    if (!record) return;
    const eventName = Object.entries(AUTOMATION_TRIGGER_EVENTS).find(
      ([, trigger]) => trigger === record.trigger,
    )?.[0] as CommercialEventName | undefined;
    const context = eventName
      ? await this.buildContextFromPayload(eventName, record)
      : asJsonRecord(record.inputPayload);
    let failed = false;
    for (const action of record.actions) {
      if (action.status === 'SUCCEEDED' || action.status === 'SKIPPED') continue;
      const claimedAction = await this.prisma.automationExecutionAction.updateMany({
        where: {
          organizationId: record.organizationId,
          id: action.id,
          status: { in: ['PENDING', 'RUNNING', 'FAILED'] },
        },
        data: { status: 'RUNNING', startedAt: new Date(), errorMessage: null },
      });
      if (claimedAction.count !== 1) continue;
      try {
        const result = await this.prisma.$transaction((transaction) =>
          this.executeAction(transaction, record, action, context),
        );
        await this.prisma.automationExecutionAction.update({
          where: { organizationId_id: { organizationId: record.organizationId, id: action.id } },
          data: {
            status: result.status,
            completedAt: new Date(),
            resultPayload: asInputJson(result.result),
          },
        });
      } catch (error: unknown) {
        failed = true;
        const message =
          error instanceof Error ? error.message.slice(0, 1_000) : 'Automation action failed';
        await this.prisma.automationExecutionAction.updateMany({
          where: { organizationId: record.organizationId, id: action.id },
          data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
        });
        await this.audit.record({
          organizationId: record.organizationId,
          userId: record.actorId ?? record.rule.createdByUserId,
          action: 'AUTOMATION_ACTION_FAILED',
          tableName: 'AutomationExecutionAction',
          recordId: action.id,
          newValue: jsonObject({ executionId: record.id, message }),
          requestId: record.requestId,
        });
        this.logger.error(`Automation execution ${record.id} failed: ${message}`);
        break;
      }
    }
    if (failed) {
      const retry = record.attempts < MAX_EXECUTION_ATTEMPTS;
      await this.prisma.automationExecution.updateMany({
        where: { organizationId: record.organizationId, id: record.id },
        data: {
          status: AutomationExecutionStatus.FAILED,
          processingAt: null,
          availableAt: retry
            ? new Date(Date.now() + Math.min(300, 2 ** record.attempts) * 1_000)
            : new Date('9999-12-31T00:00:00.000Z'),
          lastError: 'Una o más acciones fallaron.',
        },
      });
      return;
    }
    await this.prisma.automationExecution.updateMany({
      where: { organizationId: record.organizationId, id: record.id },
      data: {
        status: AutomationExecutionStatus.SUCCEEDED,
        processingAt: null,
        completedAt: new Date(),
        lastError: null,
      },
    });
  }

  private async executeAction(
    transaction: Prisma.TransactionClient,
    execution: Prisma.AutomationExecutionGetPayload<{ include: { rule: true } }>,
    action: {
      id: string;
      actionOrder: number;
      type: AutomationActionType;
      config: Prisma.JsonValue;
    },
    context: Record<string, unknown>,
  ): Promise<ActionResult> {
    const config = asJsonRecord(this.renderer.interpolate(action.config, context));
    const actorId = execution.actorId ?? execution.rule.createdByUserId;
    switch (action.type) {
      case AutomationActionType.CREATE_TASK:
      case AutomationActionType.CREATE_FOLLOW_UP:
        return this.createFollowUpAction(transaction, execution, action, config, context, actorId);
      case AutomationActionType.CREATE_NOTIFICATION:
        return this.createNotificationAction(transaction, execution, config, context, actorId);
      case AutomationActionType.ADD_ACTIVITY:
        return this.createActivityAction(transaction, execution, config, context, actorId);
      case AutomationActionType.ENQUEUE_OUTBOX:
        return this.enqueueOutboxAction(transaction, execution, action, config, context, actorId);
      case AutomationActionType.INTERNAL_WEBHOOK:
        return {
          status: 'SUCCEEDED',
          result: {
            mocked: true,
            endpoint: readString(config.endpoint) ?? 'internal://mock',
            payload: config.payload ?? null,
          },
        };
    }
  }

  private async createFollowUpAction(
    transaction: Prisma.TransactionClient,
    execution: Prisma.AutomationExecutionGetPayload<{ include: { rule: true } }>,
    action: { actionOrder: number; type: AutomationActionType },
    config: Record<string, unknown>,
    context: Record<string, unknown>,
    actorId: string,
  ): Promise<ActionResult> {
    const opportunityId =
      readString(config.opportunityId) ??
      readString(this.renderer.resolvePath(context, 'opportunity.id'));
    if (!opportunityId)
      return { status: 'SKIPPED', result: { reason: 'OPPORTUNITY_NOT_AVAILABLE' } };
    const opportunity = await transaction.opportunity.findFirst({
      where: {
        organizationId: execution.organizationId,
        id: opportunityId,
        deletedAt: null,
        archivedAt: null,
      },
      select: { id: true, contactId: true, userId: true },
    });
    if (!opportunity) return { status: 'SKIPPED', result: { reason: 'OPPORTUNITY_NOT_AVAILABLE' } };
    const responsibleUserId = await this.resolveUserId(
      transaction,
      execution.organizationId,
      config,
      context,
      opportunity.userId,
      actorId,
    );
    const dueAtValue = readString(config.dueAt);
    const dueAt = dueAtValue ? new Date(dueAtValue) : new Date(Date.now() + 24 * 60 * 60 * 1_000);
    if (Number.isNaN(dueAt.getTime())) throw new Error('dueAt de automatización inválido.');
    const title =
      readString(config.title) ??
      (action.type === AutomationActionType.CREATE_TASK
        ? 'Tarea automática'
        : 'Seguimiento automático');
    const note = readString(config.note);
    const priority = this.followUpPriority(config.priority);
    const followUp = await transaction.followUp.create({
      data: {
        organizationId: execution.organizationId,
        userId: responsibleUserId,
        opportunityId: opportunity.id,
        title,
        dueAt,
        priority,
        status: FollowUpStatus.PENDING,
        note,
        createdByUserId: actorId,
      },
    });
    await transaction.followUpHistory.create({
      data: {
        organizationId: execution.organizationId,
        followUpId: followUp.id,
        action: FollowUpHistoryAction.CREATED,
        changedByUserId: actorId,
        newDueAt: dueAt,
        newStatus: FollowUpStatus.PENDING,
        note,
        metadata: jsonObject({ automationExecutionId: execution.id }),
      },
    });
    await transaction.activity.create({
      data: {
        organizationId: execution.organizationId,
        userId: actorId,
        contactId: opportunity.contactId,
        opportunityId: opportunity.id,
        followUpId: followUp.id,
        type: ActivityType.FOLLOWUP,
        title,
        occurredAt: new Date(),
        metadata: jsonObject({ source: 'AUTOMATION', automationExecutionId: execution.id }),
        requestId: execution.requestId,
      },
    });
    await this.audit.recordWithClient(transaction, {
      organizationId: execution.organizationId,
      userId: actorId,
      action: 'AUTOMATION_FOLLOW_UP_CREATED',
      tableName: 'FollowUp',
      recordId: followUp.id,
      newValue: jsonObject({
        executionId: execution.id,
        opportunityId: opportunity.id,
        dueAt: dueAt.toISOString(),
      }),
      requestId: execution.requestId,
    });
    return { status: 'SUCCEEDED', result: { followUpId: followUp.id } };
  }

  private async createNotificationAction(
    transaction: Prisma.TransactionClient,
    execution: Prisma.AutomationExecutionGetPayload<{ include: { rule: true } }>,
    config: Record<string, unknown>,
    context: Record<string, unknown>,
    actorId: string,
  ): Promise<ActionResult> {
    const recipient = await this.resolveUserId(
      transaction,
      execution.organizationId,
      config,
      context,
      null,
      actorId,
    );
    const template = await this.templateMessage(
      transaction,
      execution.organizationId,
      execution.rule.templateId,
      config,
      context,
    );
    const title = readString(config.title) ?? template?.subject ?? 'Nueva notificación';
    const body =
      readString(config.body) ?? template?.body ?? 'La automatización generó una notificación.';
    const notification = await transaction.notification.create({
      data: {
        organizationId: execution.organizationId,
        userId: recipient,
        type: readString(config.notificationType) ?? 'AUTOMATION',
        title,
        body,
        status: NotificationStatus.UNREAD,
        actionUrl: readString(config.actionUrl),
        metadata: jsonObject({ automationExecutionId: execution.id }),
        requestId: execution.requestId,
      },
    });
    await this.audit.recordWithClient(transaction, {
      organizationId: execution.organizationId,
      userId: actorId,
      action: 'AUTOMATION_NOTIFICATION_CREATED',
      tableName: 'Notification',
      recordId: notification.id,
      newValue: jsonObject({ recipient, executionId: execution.id }),
      requestId: execution.requestId,
    });
    return { status: 'SUCCEEDED', result: { notificationId: notification.id, recipient } };
  }

  private async createActivityAction(
    transaction: Prisma.TransactionClient,
    execution: Prisma.AutomationExecutionGetPayload<{ include: { rule: true } }>,
    config: Record<string, unknown>,
    context: Record<string, unknown>,
    actorId: string,
  ): Promise<ActionResult> {
    const contactId =
      readString(config.contactId) ?? readString(this.renderer.resolvePath(context, 'contact.id'));
    const opportunityId =
      readString(config.opportunityId) ??
      readString(this.renderer.resolvePath(context, 'opportunity.id'));
    const saleId =
      readString(config.saleId) ?? readString(this.renderer.resolvePath(context, 'sale.id'));
    if (!contactId && !opportunityId && !saleId)
      return { status: 'SKIPPED', result: { reason: 'ACTIVITY_TARGET_NOT_AVAILABLE' } };
    const activityType = this.activityType(config.activityType);
    const activity = await transaction.activity.create({
      data: {
        organizationId: execution.organizationId,
        userId: actorId,
        ...(contactId ? { contactId } : {}),
        ...(opportunityId ? { opportunityId } : {}),
        ...(saleId ? { saleId } : {}),
        type: activityType,
        title: readString(config.title) ?? 'Actividad automática',
        description: readString(config.description),
        occurredAt: new Date(),
        metadata: jsonObject({ source: 'AUTOMATION', automationExecutionId: execution.id }),
        requestId: execution.requestId,
      },
    });
    await this.audit.recordWithClient(transaction, {
      organizationId: execution.organizationId,
      userId: actorId,
      action: 'AUTOMATION_ACTIVITY_CREATED',
      tableName: 'Activity',
      recordId: activity.id,
      newValue: jsonObject({ executionId: execution.id, type: activityType }),
      requestId: execution.requestId,
    });
    return { status: 'SUCCEEDED', result: { activityId: activity.id } };
  }

  private async enqueueOutboxAction(
    transaction: Prisma.TransactionClient,
    execution: Prisma.AutomationExecutionGetPayload<{ include: { rule: true } }>,
    action: { id: string },
    config: Record<string, unknown>,
    context: Record<string, unknown>,
    actorId: string,
  ): Promise<ActionResult> {
    const eventType = readString(config.eventType);
    if (!eventType || !INTERNAL_OUTBOX_EVENT_NAMES.includes(eventType as CommercialEventName))
      throw new Error('eventType no permitido para Outbox interno.');
    const payload = isJsonRecord(config.payload)
      ? config.payload
      : { automation: { executionId: execution.id } };
    const outbox = await this.outbox.enqueueWithClient(transaction, {
      eventType,
      organizationId: execution.organizationId,
      aggregateType: 'Automation',
      aggregateId: execution.id,
      actorId,
      requestId: execution.requestId,
      deduplicationKey: `automation:${execution.id}:${action.id}`,
      payload: asInputJson(this.renderer.interpolate(payload, context)) as Prisma.InputJsonObject,
    });
    return { status: 'SUCCEEDED', result: { outboxEventId: outbox.id, eventType } };
  }

  private async resolveUserId(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    config: Record<string, unknown>,
    context: Record<string, unknown>,
    fallback: string | null,
    actorId: string,
  ): Promise<string> {
    const configured = readString(config.userId);
    const fromContext =
      readString(this.renderer.resolvePath(context, 'opportunity.ownerId')) ??
      readString(this.renderer.resolvePath(context, 'contact.ownerId'));
    const candidate = configured ?? fromContext ?? fallback ?? actorId;
    const user = await transaction.user.findFirst({
      where: {
        organizationId,
        id: candidate,
        status: 'ACTIVE',
        deletedAt: null,
        role: { deletedAt: null },
      },
      select: { id: true },
    });
    if (!user)
      throw new Error('El destinatario de la automatización no está activo en la organización.');
    return user.id;
  }

  private async templateMessage(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    ruleTemplateId: string | null,
    config: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<{ subject: string | null; body: string } | null> {
    const templateId = readString(config.templateId) ?? ruleTemplateId;
    if (!templateId) return null;
    const template = await transaction.messageTemplate.findFirst({
      where: {
        organizationId,
        id: templateId,
        status: MessageTemplateStatus.ACTIVE,
        deletedAt: null,
      },
      select: { subject: true, body: true },
    });
    if (!template) throw new Error('La plantilla de la automatización no está disponible.');
    const rendered = this.renderer.renderMessage(template.subject, template.body, context);
    return { subject: rendered.subject?.value ?? null, body: rendered.body.value };
  }

  private async assertTemplate(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<void> {
    const template = await transaction.messageTemplate.findFirst({
      where: { organizationId, id, status: MessageTemplateStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (!template)
      throw automationError(
        HttpStatus.NOT_FOUND,
        AUTOMATION_ERROR_CODES.TEMPLATE_NOT_FOUND,
        'La plantilla no existe o no está activa.',
      );
  }

  private async findRuleRecord(organizationId: string, id: string) {
    return this.prisma.automationRule.findFirst({ where: { organizationId, id, deletedAt: null } });
  }

  private validateActions(dto: { actions?: Array<{ actionOrder: number }> }): void {
    if (!dto.actions || dto.actions.length === 0)
      throw automationError(
        HttpStatus.BAD_REQUEST,
        AUTOMATION_ERROR_CODES.ACTIONS_REQUIRED,
        'La automatización debe tener al menos una acción.',
      );
    const orders = dto.actions.map((action) => action.actionOrder);
    if (new Set(orders).size !== orders.length)
      throw automationError(
        HttpStatus.BAD_REQUEST,
        AUTOMATION_ERROR_CODES.INVALID_ACTION_CONFIG,
        'Las acciones deben tener un orden único.',
      );
  }

  private matchesConditions(
    conditions: Prisma.JsonValue | null,
    context: Record<string, unknown>,
  ): boolean {
    if (!isJsonRecord(conditions)) return true;
    const all = Array.isArray(conditions.all) ? conditions.all : null;
    const any = Array.isArray(conditions.any) ? conditions.any : null;
    if (all && !all.every((item) => this.matchesCondition(item, context))) return false;
    if (any && any.length > 0 && !any.some((item) => this.matchesCondition(item, context)))
      return false;
    if (readString(conditions.path)) return this.matchesCondition(conditions, context);
    return true;
  }

  private matchesCondition(value: unknown, context: Record<string, unknown>): boolean {
    if (!isJsonRecord(value)) return false;
    const path = readString(value.path);
    if (!path) return false;
    const resolved = this.renderer.resolvePath(context, path);
    if (Object.prototype.hasOwnProperty.call(value, 'exists'))
      return Boolean(value.exists) === (resolved !== undefined && resolved !== null);
    if (Object.prototype.hasOwnProperty.call(value, 'equals'))
      return this.equalValue(resolved, value.equals);
    if (Object.prototype.hasOwnProperty.call(value, 'notEquals'))
      return !this.equalValue(resolved, value.notEquals);
    if (Array.isArray(value.in)) return value.in.some((item) => this.equalValue(resolved, item));
    if (typeof value.contains === 'string')
      return typeof resolved === 'string' && resolved.includes(value.contains);
    return false;
  }

  private equalValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private async buildContext(
    eventName: CommercialEventName,
    event: CommercialEvent,
  ): Promise<Record<string, unknown>> {
    const context = eventContextEnvelope(eventName, event);
    const aggregateType = event.aggregateType === 'Commercial' ? eventName : event.aggregateType;
    const id = event.aggregateId;
    if (aggregateType === 'Contact') {
      const contact = await this.prisma.contact.findFirst({
        where: { organizationId: event.organizationId, id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          userId: true,
        },
      });
      if (contact)
        context.contact = {
          id: contact.id,
          name: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
          email: contact.email,
          phone: contact.phone,
          ownerId: contact.userId,
        };
    }
    if (aggregateType === 'Opportunity') {
      const opportunity = await this.prisma.opportunity.findFirst({
        where: { organizationId: event.organizationId, id },
        select: {
          id: true,
          title: true,
          userId: true,
          pipelineStage: { select: { id: true, name: true } },
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              userId: true,
            },
          },
        },
      });
      if (opportunity) {
        context.opportunity = {
          id: opportunity.id,
          title: opportunity.title,
          ownerId: opportunity.userId,
          pipelineStage: opportunity.pipelineStage,
        };
        context.contact = {
          id: opportunity.contact.id,
          name: [opportunity.contact.firstName, opportunity.contact.lastName]
            .filter(Boolean)
            .join(' '),
          email: opportunity.contact.email,
          phone: opportunity.contact.phone,
          ownerId: opportunity.contact.userId,
        };
      }
    }
    if (aggregateType === 'Sale' || eventName.startsWith('Sale')) {
      const sale = await this.prisma.sale.findFirst({
        where: { organizationId: event.organizationId, id },
        select: {
          id: true,
          total: true,
          subtotal: true,
          currency: true,
          status: true,
          userId: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              userId: true,
            },
          },
          opportunity: { select: { id: true, title: true, userId: true } },
        },
      });
      if (sale) {
        context.sale = {
          id: sale.id,
          total: sale.total.toString(),
          subtotal: sale.subtotal.toString(),
          currency: sale.currency,
          status: sale.status,
          ownerId: sale.userId,
        };
        context.contact = {
          id: sale.contact.id,
          name: [sale.contact.firstName, sale.contact.lastName].filter(Boolean).join(' '),
          email: sale.contact.email,
          phone: sale.contact.phone,
          ownerId: sale.contact.userId,
        };
        if (sale.opportunity)
          context.opportunity = {
            id: sale.opportunity.id,
            title: sale.opportunity.title,
            ownerId: sale.opportunity.userId,
          };
      }
    }
    if (aggregateType === 'Payment') {
      const payment = await this.prisma.payment.findFirst({
        where: { organizationId: event.organizationId, id },
        select: {
          id: true,
          netAmount: true,
          grossAmount: true,
          currency: true,
          status: true,
          sale: {
            select: {
              id: true,
              total: true,
              currency: true,
              contact: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
      });
      if (payment) {
        context.payment = {
          id: payment.id,
          amount: payment.netAmount.toString(),
          grossAmount: payment.grossAmount.toString(),
          currency: payment.currency,
          status: payment.status,
        };
        context.sale = {
          id: payment.sale.id,
          total: payment.sale.total.toString(),
          currency: payment.sale.currency,
        };
        context.contact = {
          id: payment.sale.contact.id,
          name: [payment.sale.contact.firstName, payment.sale.contact.lastName]
            .filter(Boolean)
            .join(' '),
          email: payment.sale.contact.email,
        };
      }
    }
    if (aggregateType === 'Subscription') {
      const subscription = await this.prisma.subscription.findFirst({
        where: { organizationId: event.organizationId, id, deletedAt: null },
        select: {
          id: true,
          nextBillingAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          amount: true,
          currency: true,
          status: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              userId: true,
            },
          },
        },
      });
      if (subscription) {
        context.subscription = {
          id: subscription.id,
          nextBilling: subscription.nextBillingAt?.toISOString() ?? null,
          currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          amount: subscription.amount.toString(),
          currency: subscription.currency,
          status: subscription.status,
        };
        context.contact = {
          id: subscription.contact.id,
          name: [subscription.contact.firstName, subscription.contact.lastName]
            .filter(Boolean)
            .join(' '),
          email: subscription.contact.email,
          phone: subscription.contact.phone,
          ownerId: subscription.contact.userId,
        };
      }
    }
    if (aggregateType === 'Renewal') {
      const renewal = await this.prisma.renewal.findFirst({
        where: { organizationId: event.organizationId, id, deletedAt: null },
        select: {
          id: true,
          subscriptionId: true,
          dueAt: true,
          periodStart: true,
          periodEnd: true,
          amount: true,
          currency: true,
          status: true,
          subscription: {
            select: {
              id: true,
              nextBillingAt: true,
              contact: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                  userId: true,
                },
              },
            },
          },
        },
      });
      if (renewal) {
        context.renewal = {
          id: renewal.id,
          subscriptionId: renewal.subscriptionId,
          dueAt: renewal.dueAt.toISOString(),
          periodStart: renewal.periodStart.toISOString(),
          periodEnd: renewal.periodEnd.toISOString(),
          amount: renewal.amount.toString(),
          currency: renewal.currency,
          status: renewal.status,
        };
        context.subscription = {
          id: renewal.subscription.id,
          nextBilling: renewal.subscription.nextBillingAt?.toISOString() ?? null,
        };
        context.contact = {
          id: renewal.subscription.contact.id,
          name: [renewal.subscription.contact.firstName, renewal.subscription.contact.lastName]
            .filter(Boolean)
            .join(' '),
          email: renewal.subscription.contact.email,
          phone: renewal.subscription.contact.phone,
          ownerId: renewal.subscription.contact.userId,
        };
      }
    }
    if (aggregateType === 'Trial') {
      const trial = await this.prisma.trial.findFirst({
        where: { organizationId: event.organizationId, id, deletedAt: null },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          durationMinutes: true,
          status: true,
          ownerId: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              userId: true,
            },
          },
          product: { select: { id: true, name: true, slug: true } },
        },
      });
      if (trial) {
        context.trial = {
          id: trial.id,
          startsAt: trial.startsAt.toISOString(),
          endsAt: trial.endsAt.toISOString(),
          durationMinutes: trial.durationMinutes,
          status: trial.status,
          ownerId: trial.ownerId,
        };
        context.product = trial.product;
        context.contact = {
          id: trial.contact.id,
          name: [trial.contact.firstName, trial.contact.lastName].filter(Boolean).join(' '),
          email: trial.contact.email,
          phone: trial.contact.phone,
          ownerId: trial.contact.userId,
        };
      }
    }
    if (aggregateType === 'Fulfillment') {
      const fulfillment = await this.prisma.fulfillment.findFirst({
        where: { organizationId: event.organizationId, id, deletedAt: null },
        select: {
          id: true,
          saleId: true,
          subscriptionId: true,
          providerId: true,
          status: true,
          mode: true,
          attemptCount: true,
          sale: {
            select: {
              id: true,
              total: true,
              currency: true,
              contact: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                  userId: true,
                },
              },
            },
          },
        },
      });
      if (fulfillment) {
        context.fulfillment = {
          id: fulfillment.id,
          saleId: fulfillment.saleId,
          subscriptionId: fulfillment.subscriptionId,
          providerId: fulfillment.providerId,
          status: fulfillment.status,
          mode: fulfillment.mode,
          attemptCount: fulfillment.attemptCount,
        };
        context.sale = {
          id: fulfillment.sale.id,
          total: fulfillment.sale.total.toString(),
          currency: fulfillment.sale.currency,
        };
        context.contact = {
          id: fulfillment.sale.contact.id,
          name: [fulfillment.sale.contact.firstName, fulfillment.sale.contact.lastName]
            .filter(Boolean)
            .join(' '),
          email: fulfillment.sale.contact.email,
          phone: fulfillment.sale.contact.phone,
          ownerId: fulfillment.sale.contact.userId,
        };
      }
    }
    if (aggregateType === 'Activation') {
      const activation = await this.prisma.activation.findFirst({
        where: { organizationId: event.organizationId, id, deletedAt: null },
        select: {
          id: true,
          fulfillmentId: true,
          subscriptionId: true,
          providerId: true,
          status: true,
          activatedAt: true,
          expiresAt: true,
          externalReference: true,
        },
      });
      if (activation) {
        context.activation = {
          id: activation.id,
          fulfillmentId: activation.fulfillmentId,
          subscriptionId: activation.subscriptionId,
          providerId: activation.providerId,
          status: activation.status,
          activatedAt: activation.activatedAt?.toISOString() ?? null,
          expiresAt: activation.expiresAt?.toISOString() ?? null,
          externalReference: activation.externalReference,
        };
      }
    }
    return context;
  }

  private async buildContextFromPayload(
    eventName: CommercialEventName,
    execution: Prisma.AutomationExecutionGetPayload<{ include: { rule: true } }>,
  ): Promise<Record<string, unknown>> {
    const payload = asJsonRecord(execution.inputPayload);
    const synthetic: CommercialEvent = {
      eventId: execution.sourceEventId,
      occurredAt: execution.createdAt,
      organizationId: execution.organizationId,
      aggregateType: execution.aggregateType,
      aggregateId: execution.aggregateId,
      actorUserId: execution.actorId ?? execution.rule.createdByUserId,
      requestId: execution.requestId,
      payload,
    };
    return this.buildContext(eventName, synthetic);
  }

  private activityType(value: unknown): ActivityType {
    const candidate = readString(value);
    return candidate && Object.values(ActivityType).includes(candidate as ActivityType)
      ? (candidate as ActivityType)
      : ActivityType.SYSTEM;
  }

  private followUpPriority(value: unknown): FollowUpPriority {
    const candidate = readString(value);
    return candidate && Object.values(FollowUpPriority).includes(candidate as FollowUpPriority)
      ? (candidate as FollowUpPriority)
      : FollowUpPriority.NORMAL;
  }

  private toPublicRule(rule: {
    id: string;
    name: string;
    description: string | null;
    trigger: AutomationTrigger;
    conditions: Prisma.JsonValue | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    template: { id: string; name: string; slug: string } | null;
    actions: Array<{
      id: string;
      actionOrder: number;
      type: AutomationActionType;
      config: Prisma.JsonValue;
    }>;
  }): PublicAutomationRule {
    return {
      id: rule.id,
      name: rule.name,
      description: rule.description,
      trigger: rule.trigger,
      conditions: rule.conditions,
      active: rule.active,
      template: rule.template,
      actions: rule.actions.map((action): PublicAutomationAction => ({
        id: action.id,
        actionOrder: action.actionOrder,
        type: action.type,
        config: action.config,
      })),
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }
}
