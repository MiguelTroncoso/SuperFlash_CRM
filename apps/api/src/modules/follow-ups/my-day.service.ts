import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime, IANAZone } from 'luxon';
import { FollowUpPriority, FollowUpStatus, PipelineStageCategory, Prisma } from '@prisma/client';

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
    };
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
}
