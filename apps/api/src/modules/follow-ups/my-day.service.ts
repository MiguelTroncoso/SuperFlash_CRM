import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime, IANAZone } from 'luxon';
import {
  FollowUpPriority,
  FollowUpStatus,
  PipelineStageCategory,
  Prisma,
  RenewalStatus,
  RenewalWorkflowStatus,
} from '@prisma/client';

import { AppConfiguration } from '../../config/configuration';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { FollowUpAccessPolicy } from './access/followup-access.policy';
import { FOLLOW_UP_ERROR_CODES, followUpException } from './followups.errors';
import { FollowUpsRepository } from './followups.repository';
import { FollowUpsService, PublicFollowUp } from './followups.service';
import { MyDayQueryDto } from './dto/my-day-query.dto';

const opportunityInclude = Prisma.validator<Prisma.OpportunityInclude>()({
  pipelineStage: { select: { id: true, name: true, color: true, category: true, systemKey: true } },
  owner: { select: { id: true, firstName: true, lastName: true } },
  contact: { select: { id: true, firstName: true, lastName: true, phone: true, country: true } },
});

type MyDayOpportunity = Prisma.OpportunityGetPayload<{ include: typeof opportunityInclude }>;

@Injectable()
export class MyDayService {
  private readonly configuration: AppConfiguration;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: FollowUpsRepository,
    private readonly followUps: FollowUpsService,
    private readonly accessPolicy: FollowUpAccessPolicy,
    configService: ConfigService,
  ) {
    this.configuration = configService.getOrThrow<AppConfiguration>('app');
  }

  async getMyDay(query: MyDayQueryDto, user: AuthenticatedUser): Promise<MyDayResponse> {
    this.accessPolicy.assertCanRead(user);
    this.assertValidQuery(query);
    const timezone = this.validTimezone(query.timezone);
    const day = DateTime.now().setZone(timezone).startOf('day');
    const targetUserId = user.roleName === 'Sales' ? user.userId : query.assignedUserId;
    const [
      overdueFollowUps,
      todayFollowUps,
      upcomingFollowUps,
      newLeads,
      awaitingCreditUsage,
      awaitingMoney,
      potentialBuyers,
      recentWins,
      operations,
    ] = await Promise.all([
      this.followUpSection(
        user,
        targetUserId,
        { dueAt: { lt: day.toUTC().toJSDate() } },
        [{ priority: 'desc' }, { dueAt: 'asc' }],
        query.limitPerSection,
      ),
      this.followUpSection(
        user,
        targetUserId,
        { dueAt: { gte: day.toUTC().toJSDate(), lt: day.plus({ days: 1 }).toUTC().toJSDate() } },
        [{ dueAt: 'asc' }, { priority: 'desc' }],
        query.limitPerSection,
      ),
      this.followUpSection(
        user,
        targetUserId,
        {
          dueAt: {
            gte: day.plus({ days: 1 }).toUTC().toJSDate(),
            lt: day.plus({ days: 8 }).toUTC().toJSDate(),
          },
        },
        [{ dueAt: 'asc' }],
        query.limitPerSection,
      ),
      this.opportunitySection(
        user,
        targetUserId,
        {
          createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
          pipelineStage: { systemKey: 'NEW_LEAD', category: PipelineStageCategory.OPEN },
        },
        [{ createdAt: 'desc' }],
        query.limitPerSection,
      ),
      this.opportunitySection(
        user,
        targetUserId,
        {
          pipelineStage: {
            systemKey: 'AWAITING_CREDIT_USAGE',
            category: PipelineStageCategory.OPEN,
          },
        },
        [{ lastStageChangedAt: 'asc' }, { updatedAt: 'asc' }],
        query.limitPerSection,
      ),
      this.opportunitySection(
        user,
        targetUserId,
        { pipelineStage: { systemKey: 'AWAITING_MONEY', category: PipelineStageCategory.OPEN } },
        [{ lastStageChangedAt: 'asc' }, { updatedAt: 'asc' }],
        query.limitPerSection,
      ),
      this.opportunitySection(
        user,
        targetUserId,
        { pipelineStage: { systemKey: 'POTENTIAL_BUYER', category: PipelineStageCategory.OPEN } },
        [{ lastStageChangedAt: 'asc' }, { updatedAt: 'asc' }],
        query.limitPerSection,
      ),
      this.opportunitySection(
        user,
        targetUserId,
        {
          pipelineStage: { category: PipelineStageCategory.WON },
          wonAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
        [{ wonAt: 'desc' }],
        query.limitPerSection,
      ),
      this.operationalSections(user, targetUserId, query.limitPerSection),
    ]);
    return {
      generatedAt: new Date(),
      timezone,
      filters: { assignedUserId: targetUserId ?? null },
      sections: {
        overdueFollowUps,
        todayFollowUps,
        upcomingFollowUps,
        newLeads,
        awaitingCreditUsage,
        awaitingMoney,
        potentialBuyers,
        recentWins,
        ...operations,
      },
    };
  }

  async getSummary(query: MyDayQueryDto, user: AuthenticatedUser): Promise<MyDaySummary> {
    this.accessPolicy.assertCanRead(user);
    this.assertValidQuery(query);
    const targetUserId = user.roleName === 'Sales' ? user.userId : query.assignedUserId;
    const now = new Date();
    const day = DateTime.now().setZone(this.validTimezone(query.timezone)).startOf('day');
    const followUpBase = this.combine(this.accessPolicy.listWhere(user), {
      archivedAt: null,
      status: FollowUpStatus.PENDING,
      ...(targetUserId ? { userId: targetUserId } : {}),
    });
    const opportunityBase = this.combineOpportunity(
      this.accessPolicy.opportunityWhere(user),
      targetUserId,
      { archivedAt: null, deletedAt: null, contact: { deletedAt: null } },
    );
    const [
      overdueFollowUps,
      todayFollowUps,
      upcomingFollowUps,
      newLeads,
      awaitingCreditUsage,
      awaitingMoney,
      potentialBuyers,
      recentWins,
      urgentPending,
      operationalSummary,
    ] = await Promise.all([
      this.repository.count(user.organizationId, {
        ...followUpBase,
        dueAt: { lt: day.toUTC().toJSDate() },
      }),
      this.repository.count(user.organizationId, {
        ...followUpBase,
        dueAt: { gte: day.toUTC().toJSDate(), lt: day.plus({ days: 1 }).toUTC().toJSDate() },
      }),
      this.repository.count(user.organizationId, {
        ...followUpBase,
        dueAt: {
          gte: day.plus({ days: 1 }).toUTC().toJSDate(),
          lt: day.plus({ days: 8 }).toUTC().toJSDate(),
        },
      }),
      this.prisma.opportunity.count({
        where: {
          organizationId: user.organizationId,
          ...opportunityBase,
          createdAt: { gte: new Date(now.getTime() - 72 * 60 * 60 * 1000) },
          pipelineStage: { systemKey: 'NEW_LEAD', category: PipelineStageCategory.OPEN },
        },
      }),
      this.countOpportunitySection(user.organizationId, opportunityBase, {
        pipelineStage: { systemKey: 'AWAITING_CREDIT_USAGE', category: PipelineStageCategory.OPEN },
      }),
      this.countOpportunitySection(user.organizationId, opportunityBase, {
        pipelineStage: { systemKey: 'AWAITING_MONEY', category: PipelineStageCategory.OPEN },
      }),
      this.countOpportunitySection(user.organizationId, opportunityBase, {
        pipelineStage: { systemKey: 'POTENTIAL_BUYER', category: PipelineStageCategory.OPEN },
      }),
      this.countOpportunitySection(user.organizationId, opportunityBase, {
        pipelineStage: { category: PipelineStageCategory.WON },
        wonAt: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
      }),
      this.repository.count(user.organizationId, {
        ...followUpBase,
        priority: FollowUpPriority.URGENT,
      }),
      this.operationalSummary(user, targetUserId),
    ]);
    return {
      overdueFollowUps,
      todayFollowUps,
      upcomingFollowUps,
      newLeads,
      awaitingCreditUsage,
      awaitingMoney,
      potentialBuyers,
      recentWins,
      urgentPending,
      ...operationalSummary,
    };
  }

  private async operationalSections(
    user: AuthenticatedUser,
    targetUserId: string | undefined,
    limit: number,
  ): Promise<OperationalSections> {
    const base = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(targetUserId ? { assignedUserId: targetUserId } : {}),
    };
    const trialBase = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(targetUserId ? { ownerId: targetUserId } : {}),
    };
    const renewalBase = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(targetUserId ? { userId: targetUserId } : {}),
    };
    const now = new Date();
    const next48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const [
      pending,
      failed,
      activations,
      expiringTrials,
      expiredTrials,
      credentials,
      retries,
      renewalsToday,
      urgentRenewals,
      paymentPromises,
      overdueRenewals,
      vipRenewals,
      lowStock,
    ] = await Promise.all([
      this.prisma.fulfillment.findMany({
        where: { ...base, status: { in: ['PENDING', 'ASSIGNED'] } },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, status: true, providerId: true, saleId: true, createdAt: true },
      }),
      this.prisma.fulfillment.findMany({
        where: { ...base, status: 'FAILED' },
        orderBy: { failedAt: 'asc' },
        take: limit,
        select: {
          id: true,
          status: true,
          providerId: true,
          saleId: true,
          failedAt: true,
          failureReason: true,
        },
      }),
      this.prisma.activation.findMany({
        where: { organizationId: user.organizationId, deletedAt: null, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          id: true,
          status: true,
          fulfillmentId: true,
          providerId: true,
          createdAt: true,
        },
      }),
      this.prisma.trial.findMany({
        where: { ...trialBase, status: 'ACTIVE', endsAt: { gte: now, lte: next48Hours } },
        orderBy: { endsAt: 'asc' },
        take: limit,
        select: { id: true, status: true, contactId: true, productId: true, endsAt: true },
      }),
      this.prisma.trial.findMany({
        where: {
          ...trialBase,
          OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', endsAt: { lt: now } }],
        },
        orderBy: { endsAt: 'asc' },
        take: limit,
        select: { id: true, status: true, contactId: true, productId: true, endsAt: true },
      }),
      this.prisma.credentialRecord.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: 'ACTIVE',
          fulfillment: { status: 'COMPLETED', deletedAt: null },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          id: true,
          status: true,
          fulfillmentId: true,
          activationId: true,
          expiration: true,
        },
      }),
      this.prisma.provisioningAttempt.findMany({
        where: {
          organizationId: user.organizationId,
          status: 'RETRYABLE',
          ...(targetUserId ? { fulfillment: { assignedUserId: targetUserId } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          id: true,
          status: true,
          fulfillmentId: true,
          attemptNumber: true,
          createdAt: true,
        },
      }),
      this.prisma.renewal.findMany({
        where: {
          ...renewalBase,
          dueAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          },
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
        orderBy: { dueAt: 'asc' },
        take: limit,
        select: {
          id: true,
          status: true,
          dueAt: true,
          amount: true,
          currency: true,
          subscription: { select: { contact: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.renewal.findMany({
        where: {
          ...renewalBase,
          dueAt: { gte: now, lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
        orderBy: { dueAt: 'asc' },
        take: limit,
        select: {
          id: true,
          status: true,
          dueAt: true,
          amount: true,
          currency: true,
          subscription: { select: { contact: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.renewal.findMany({
        where: {
          ...renewalBase,
          workflowStatus: RenewalWorkflowStatus.PAYMENT_PROMISE,
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
        orderBy: { dueAt: 'asc' },
        take: limit,
        select: {
          id: true,
          status: true,
          dueAt: true,
          amount: true,
          currency: true,
          subscription: { select: { contact: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.renewal.findMany({
        where: {
          ...renewalBase,
          dueAt: { lt: now },
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
        orderBy: { dueAt: 'asc' },
        take: limit,
        select: {
          id: true,
          status: true,
          dueAt: true,
          amount: true,
          currency: true,
          subscription: { select: { contact: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.renewal.findMany({
        where: {
          ...renewalBase,
          dueAt: { gte: now, lt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
        orderBy: { amount: 'desc' },
        take: limit,
        select: {
          id: true,
          status: true,
          dueAt: true,
          amount: true,
          currency: true,
          subscription: { select: { contact: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.lowStockProducts(user.organizationId, limit),
    ]);
    return {
      pendingFulfillments: this.operationSection(
        pending.map((item) => ({
          id: item.id,
          status: item.status,
          reference: item.saleId,
          providerId: item.providerId,
          dueAt: item.createdAt,
        })),
        pending.length,
        limit,
      ),
      failedFulfillments: this.operationSection(
        failed.map((item) => ({
          id: item.id,
          status: item.status,
          reference: item.saleId,
          providerId: item.providerId,
          dueAt: item.failedAt,
          detail: item.failureReason,
        })),
        failed.length,
        limit,
      ),
      pendingActivations: this.operationSection(
        activations.map((item) => ({
          id: item.id,
          status: item.status,
          reference: item.fulfillmentId,
          providerId: item.providerId,
          dueAt: item.createdAt,
        })),
        activations.length,
        limit,
      ),
      expiringTrials: this.operationSection(
        expiringTrials.map((item) => ({
          id: item.id,
          status: item.status,
          reference: item.contactId,
          providerId: null,
          dueAt: item.endsAt,
        })),
        expiringTrials.length,
        limit,
      ),
      expiredTrials: this.operationSection(
        expiredTrials.map((item) => ({
          id: item.id,
          status: item.status,
          reference: item.contactId,
          providerId: null,
          dueAt: item.endsAt,
        })),
        expiredTrials.length,
        limit,
      ),
      credentialsToDeliver: this.operationSection(
        credentials.map((item) => ({
          id: item.id,
          status: item.status,
          reference: item.fulfillmentId ?? item.activationId,
          providerId: null,
          dueAt: item.expiration,
        })),
        credentials.length,
        limit,
      ),
      provisioningRetries: this.operationSection(
        retries.map((item) => ({
          id: item.id,
          status: item.status,
          reference: item.fulfillmentId,
          providerId: null,
          dueAt: item.createdAt,
          detail: `attempt-${item.attemptNumber}`,
        })),
        retries.length,
        limit,
      ),
      renewalsToday: this.renewalSection(renewalsToday, limit),
      urgentRenewals: this.renewalSection(urgentRenewals, limit),
      paymentPromises: this.renewalSection(paymentPromises, limit),
      overdueRenewals: this.renewalSection(overdueRenewals, limit),
      vipRenewals: this.renewalSection(vipRenewals, limit),
      lowStock: this.operationSection(
        lowStock.map((item) => ({
          id: item.id,
          status: 'LOW_STOCK',
          reference: item.name,
          providerId: null,
          dueAt: null,
          detail: `${item.stockQuantity}/${item.stockMinimum}`,
        })),
        lowStock.length,
        limit,
      ),
    };
  }

  private lowStockProducts(
    organizationId: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; stockQuantity: number; stockMinimum: number }>> {
    return this.prisma.$queryRaw`
      SELECT "id", "name", "stockQuantity", "stockMinimum"
      FROM "Product"
      WHERE "organizationId" = ${organizationId}::uuid
        AND "deletedAt" IS NULL
        AND "stockTrackingEnabled" = TRUE
        AND "stockQuantity" <= "stockMinimum"
      ORDER BY "stockQuantity" ASC, "name" ASC
      LIMIT ${limit}
    `;
  }

  private renewalSection(
    records: Array<{
      id: string;
      status: RenewalStatus;
      dueAt: Date;
      amount: Prisma.Decimal;
      currency: string;
      subscription: { contact: { firstName: string | null; lastName: string | null } };
    }>,
    limit: number,
  ): MyDaySection<PublicOperationalItem> {
    return this.operationSection(
      records.map((record) => ({
        id: record.id,
        status: record.status,
        reference: record.subscription.contact.firstName ?? 'Cliente',
        providerId: null,
        dueAt: record.dueAt,
        detail: `${record.currency} ${record.amount.toFixed(2)}`,
      })),
      records.length,
      limit,
    );
  }

  private async operationalSummary(
    user: AuthenticatedUser,
    targetUserId: string | undefined,
  ): Promise<OperationalSummary> {
    const fulfillmentBase = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(targetUserId ? { assignedUserId: targetUserId } : {}),
    };
    const trialBase = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(targetUserId ? { ownerId: targetUserId } : {}),
    };
    const renewalBase = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(targetUserId ? { userId: targetUserId } : {}),
    };
    const now = new Date();
    const [
      pendingFulfillments,
      failedFulfillments,
      pendingActivations,
      expiringTrials,
      expiredTrials,
      credentialsToDeliver,
      provisioningRetries,
      renewalsToday,
      urgentRenewals,
      paymentPromises,
      overdueRenewals,
      vipRenewals,
      lowStock,
    ] = await Promise.all([
      this.prisma.fulfillment.count({
        where: { ...fulfillmentBase, status: { in: ['PENDING', 'ASSIGNED'] } },
      }),
      this.prisma.fulfillment.count({ where: { ...fulfillmentBase, status: 'FAILED' } }),
      this.prisma.activation.count({
        where: { organizationId: user.organizationId, deletedAt: null, status: 'PENDING' },
      }),
      this.prisma.trial.count({
        where: {
          ...trialBase,
          status: 'ACTIVE',
          endsAt: { gte: now, lte: new Date(now.getTime() + 48 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.trial.count({
        where: {
          ...trialBase,
          OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', endsAt: { lt: now } }],
        },
      }),
      this.prisma.credentialRecord.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: 'ACTIVE',
          fulfillment: { status: 'COMPLETED', deletedAt: null },
        },
      }),
      this.prisma.provisioningAttempt.count({
        where: { organizationId: user.organizationId, status: 'RETRYABLE' },
      }),
      this.prisma.renewal.count({
        where: {
          ...renewalBase,
          dueAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          },
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
      }),
      this.prisma.renewal.count({
        where: {
          ...renewalBase,
          dueAt: { gte: now, lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
      }),
      this.prisma.renewal.count({
        where: {
          ...renewalBase,
          workflowStatus: RenewalWorkflowStatus.PAYMENT_PROMISE,
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
      }),
      this.prisma.renewal.count({
        where: {
          ...renewalBase,
          dueAt: { lt: now },
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
      }),
      this.prisma.renewal.count({
        where: {
          ...renewalBase,
          dueAt: { gte: now, lt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
          status: { notIn: [RenewalStatus.PAID, RenewalStatus.CANCELLED] },
        },
      }),
      this.lowStockCount(user.organizationId),
    ]);
    return {
      pendingFulfillments,
      failedFulfillments,
      pendingActivations,
      expiringTrials,
      expiredTrials,
      credentialsToDeliver,
      provisioningRetries,
      renewalsToday,
      urgentRenewals,
      paymentPromises,
      overdueRenewals,
      vipRenewals,
      lowStock,
    };
  }

  private async lowStockCount(organizationId: string): Promise<number> {
    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Product"
      WHERE "organizationId" = ${organizationId}::uuid
        AND "deletedAt" IS NULL
        AND "stockTrackingEnabled" = TRUE
        AND "stockQuantity" <= "stockMinimum"
    `;
    return Number(result[0]?.count ?? 0);
  }

  private operationSection(
    data: PublicOperationalItem[],
    total: number,
    limit: number,
  ): MyDaySection<PublicOperationalItem> {
    return { data, total, hasMore: total > limit };
  }

  private async followUpSection(
    user: AuthenticatedUser,
    targetUserId: string | undefined,
    filters: Prisma.FollowUpWhereInput,
    orderBy: Prisma.FollowUpOrderByWithRelationInput[],
    limit: number,
  ): Promise<MyDaySection<PublicFollowUp>> {
    const where = this.combine(this.accessPolicy.listWhere(user), {
      archivedAt: null,
      status: FollowUpStatus.PENDING,
      ...(targetUserId ? { userId: targetUserId } : {}),
      ...filters,
    });
    const [records, total] = await Promise.all([
      this.repository.findForList(user.organizationId, where, orderBy, 0, limit),
      this.repository.count(user.organizationId, where),
    ]);
    return {
      data: records.map((record) => this.followUps.toPublic(record)),
      total,
      hasMore: total > limit,
    };
  }

  private async opportunitySection(
    user: AuthenticatedUser,
    targetUserId: string | undefined,
    filters: Prisma.OpportunityWhereInput,
    orderBy: Prisma.OpportunityOrderByWithRelationInput[],
    limit: number,
  ): Promise<MyDaySection<PublicMyDayOpportunity>> {
    const where = {
      organizationId: user.organizationId,
      deletedAt: null,
      archivedAt: null,
      contact: { deletedAt: null },
      ...this.combineOpportunity(this.accessPolicy.opportunityWhere(user), targetUserId, filters),
    };
    const [records, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        include: opportunityInclude,
        orderBy,
        take: limit,
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return {
      data: records.map((record) => this.publicOpportunity(record)),
      total,
      hasMore: total > limit,
    };
  }

  private async countOpportunitySection(
    organizationId: string,
    base: Prisma.OpportunityWhereInput,
    filters: Prisma.OpportunityWhereInput,
  ): Promise<number> {
    return this.prisma.opportunity.count({ where: { organizationId, ...base, ...filters } });
  }

  private combineOpportunity(
    access: Prisma.OpportunityWhereInput,
    targetUserId: string | undefined,
    filters: Prisma.OpportunityWhereInput,
  ): Prisma.OpportunityWhereInput {
    return { AND: [access, ...(targetUserId ? [{ userId: targetUserId }] : []), filters] };
  }

  private combine(...where: Prisma.FollowUpWhereInput[]): Prisma.FollowUpWhereInput {
    return { AND: where };
  }

  private publicOpportunity(record: MyDayOpportunity): PublicMyDayOpportunity {
    return {
      id: record.id,
      title: record.title,
      status: record.pipelineStage.category,
      lastStageChangedAt: record.lastStageChangedAt,
      wonAt: record.wonAt,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
      pipelineStage: record.pipelineStage,
      assignedTo: record.owner,
      contact: {
        id: record.contact.id,
        displayName:
          [record.contact.firstName, record.contact.lastName].filter(Boolean).join(' ') || null,
        phone: record.contact.phone,
        country: record.contact.country,
      },
    };
  }

  private validTimezone(timezone: string | undefined): string {
    const value = timezone?.trim() || this.configuration.defaultTimezone;
    if (!IANAZone.isValidZone(value))
      throw followUpException(
        HttpStatus.BAD_REQUEST,
        FOLLOW_UP_ERROR_CODES.AGENDA_INVALID_TIMEZONE,
        'La zona horaria no es válida.',
      );
    return value;
  }

  private assertValidQuery(query: MyDayQueryDto): void {
    if (
      !Number.isInteger(query.limitPerSection) ||
      query.limitPerSection < 1 ||
      query.limitPerSection > 50
    ) {
      throw followUpException(
        HttpStatus.BAD_REQUEST,
        FOLLOW_UP_ERROR_CODES.MY_DAY_INVALID_FILTER,
        'El límite por sección debe estar entre 1 y 50.',
      );
    }
  }
}

export interface MyDaySection<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

export interface PublicMyDayOpportunity {
  id: string;
  title: string;
  status: string;
  lastStageChangedAt: Date | null;
  wonAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  pipelineStage: {
    id: string;
    name: string;
    color: string;
    category: PipelineStageCategory;
    systemKey: string | null;
  };
  assignedTo: { id: string; firstName: string; lastName: string | null } | null;
  contact: { id: string; displayName: string | null; phone: string | null; country: string | null };
}

export interface MyDayResponse {
  generatedAt: Date;
  timezone: string;
  filters: { assignedUserId: string | null };
  sections: {
    overdueFollowUps: MyDaySection<PublicFollowUp>;
    todayFollowUps: MyDaySection<PublicFollowUp>;
    upcomingFollowUps: MyDaySection<PublicFollowUp>;
    newLeads: MyDaySection<PublicMyDayOpportunity>;
    awaitingCreditUsage: MyDaySection<PublicMyDayOpportunity>;
    awaitingMoney: MyDaySection<PublicMyDayOpportunity>;
    potentialBuyers: MyDaySection<PublicMyDayOpportunity>;
    recentWins: MyDaySection<PublicMyDayOpportunity>;
    pendingFulfillments: MyDaySection<PublicOperationalItem>;
    failedFulfillments: MyDaySection<PublicOperationalItem>;
    pendingActivations: MyDaySection<PublicOperationalItem>;
    expiringTrials: MyDaySection<PublicOperationalItem>;
    expiredTrials: MyDaySection<PublicOperationalItem>;
    credentialsToDeliver: MyDaySection<PublicOperationalItem>;
    provisioningRetries: MyDaySection<PublicOperationalItem>;
    lowStock: MyDaySection<PublicOperationalItem>;
  };
}

export interface MyDaySummary {
  overdueFollowUps: number;
  todayFollowUps: number;
  upcomingFollowUps: number;
  newLeads: number;
  awaitingCreditUsage: number;
  awaitingMoney: number;
  potentialBuyers: number;
  recentWins: number;
  urgentPending: number;
  pendingFulfillments: number;
  failedFulfillments: number;
  pendingActivations: number;
  expiringTrials: number;
  expiredTrials: number;
  credentialsToDeliver: number;
  provisioningRetries: number;
  lowStock: number;
}

export interface PublicOperationalItem {
  id: string;
  status: string;
  reference: string | null;
  providerId: string | null;
  dueAt: Date | null;
  detail?: string | null;
}

export type OperationalSections = {
  pendingFulfillments: MyDaySection<PublicOperationalItem>;
  failedFulfillments: MyDaySection<PublicOperationalItem>;
  pendingActivations: MyDaySection<PublicOperationalItem>;
  expiringTrials: MyDaySection<PublicOperationalItem>;
  expiredTrials: MyDaySection<PublicOperationalItem>;
  credentialsToDeliver: MyDaySection<PublicOperationalItem>;
  provisioningRetries: MyDaySection<PublicOperationalItem>;
  renewalsToday: MyDaySection<PublicOperationalItem>;
  urgentRenewals: MyDaySection<PublicOperationalItem>;
  paymentPromises: MyDaySection<PublicOperationalItem>;
  overdueRenewals: MyDaySection<PublicOperationalItem>;
  vipRenewals: MyDaySection<PublicOperationalItem>;
  lowStock: MyDaySection<PublicOperationalItem>;
};

export type OperationalSummary = {
  pendingFulfillments: number;
  failedFulfillments: number;
  pendingActivations: number;
  expiringTrials: number;
  expiredTrials: number;
  credentialsToDeliver: number;
  provisioningRetries: number;
  renewalsToday: number;
  urgentRenewals: number;
  paymentPromises: number;
  overdueRenewals: number;
  vipRenewals: number;
  lowStock: number;
};
