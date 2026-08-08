import { Injectable } from '@nestjs/common';
import { PipelineStageCategory, Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const listInclude = Prisma.validator<Prisma.OpportunityInclude>()({
  contact: { select: { id: true, firstName: true, lastName: true, phone: true, country: true } },
  pipelineStage: {
    select: {
      id: true,
      name: true,
      color: true,
      category: true,
      systemKey: true,
      order: true,
      active: true,
    },
  },
  owner: { select: { id: true, firstName: true, lastName: true } },
  campaign: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  product: { select: { id: true, name: true } },
  followUps: {
    where: {
      deletedAt: null,
      archivedAt: null,
      status: { in: ['PENDING', 'RESCHEDULED'] },
    },
    orderBy: { dueAt: 'asc' },
    take: 1,
    select: { id: true, title: true, dueAt: true, status: true, autoSuggested: true },
  },
});

const detailInclude = Prisma.validator<Prisma.OpportunityInclude>()({
  ...listInclude,
  activities: {
    where: { deletedAt: null },
    orderBy: { occurredAt: 'desc' },
    take: 20,
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      occurredAt: true,
      createdAt: true,
    },
  },
  stageHistory: {
    orderBy: { changedAt: 'desc' },
    take: 50,
    include: {
      fromStage: { select: { id: true, name: true, color: true, category: true } },
      toStage: {
        select: { id: true, name: true, color: true, category: true, systemKey: true },
      },
      changedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
});

const mutationSelect = Prisma.validator<Prisma.OpportunitySelect>()({
  id: true,
  organizationId: true,
  contactId: true,
  pipelineStageId: true,
  campaignId: true,
  categoryId: true,
  productId: true,
  userId: true,
  title: true,
  notes: true,
  expectedAmount: true,
  currency: true,
  probability: true,
  priority: true,
  closedAt: true,
  archivedAt: true,
  archiveReason: true,
  wonAt: true,
  lastStageChangedAt: true,
  lostAt: true,
  lostReason: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      archivedAt: true,
      deletedAt: true,
      userId: true,
    },
  },
  pipelineStage: {
    select: {
      id: true,
      name: true,
      color: true,
      category: true,
      systemKey: true,
      order: true,
      active: true,
      deletedAt: true,
    },
  },
});

export type OpportunityListRecord = Prisma.OpportunityGetPayload<{ include: typeof listInclude }>;
export type OpportunityDetailRecord = Prisma.OpportunityGetPayload<{
  include: typeof detailInclude;
}>;
export type OpportunityMutationRecord = Prisma.OpportunityGetPayload<{
  select: typeof mutationSelect;
}>;

export interface PipelineStageRecord {
  id: string;
  organizationId: string;
  name: string;
  order: number;
  color: string;
  active: boolean;
  category: PipelineStageCategory;
  systemKey: string | null;
  deletedAt: Date | null;
}

@Injectable()
export class OpportunitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findForList(
    organizationId: string,
    where: Prisma.OpportunityWhereInput,
    orderBy: Prisma.OpportunityOrderByWithRelationInput[],
    skip: number,
    take: number,
  ): Promise<OpportunityListRecord[]> {
    return this.prisma.opportunity.findMany({
      where: { organizationId, ...where },
      include: listInclude,
      orderBy,
      skip,
      take,
    });
  }

  async count(organizationId: string, where: Prisma.OpportunityWhereInput): Promise<number> {
    return this.prisma.opportunity.count({ where: { organizationId, ...where } });
  }

  async findDetailById(
    organizationId: string,
    id: string,
  ): Promise<OpportunityDetailRecord | null> {
    return this.prisma.opportunity.findFirst({
      where: { id, organizationId, deletedAt: null, contact: { deletedAt: null } },
      include: detailInclude,
    });
  }

  async findForMutation(
    organizationId: string,
    id: string,
  ): Promise<OpportunityMutationRecord | null> {
    return this.prisma.opportunity.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: mutationSelect,
    });
  }

  async findContact(
    organizationId: string,
    id: string,
  ): Promise<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
    userId: string | null;
  } | null> {
    return this.prisma.contact.findFirst({
      where: { organizationId, id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        archivedAt: true,
        deletedAt: true,
        userId: true,
      },
    });
  }

  async findStage(organizationId: string, id: string): Promise<PipelineStageRecord | null> {
    return this.prisma.pipelineStage.findFirst({
      where: { organizationId, id },
      select: {
        id: true,
        organizationId: true,
        name: true,
        order: true,
        color: true,
        active: true,
        category: true,
        systemKey: true,
        deletedAt: true,
      },
    });
  }

  async findInitialStage(organizationId: string): Promise<PipelineStageRecord | null> {
    return this.prisma.pipelineStage.findFirst({
      where: {
        organizationId,
        active: true,
        deletedAt: null,
        category: PipelineStageCategory.OPEN,
      },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        organizationId: true,
        name: true,
        order: true,
        color: true,
        active: true,
        category: true,
        systemKey: true,
        deletedAt: true,
      },
    });
  }

  async findAssignee(organizationId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({
      where: { id, organizationId, status: 'ACTIVE', deletedAt: null, role: { deletedAt: null } },
      select: { id: true },
    });
  }

  async findCampaign(organizationId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.campaign.findFirst({
      where: { id, organizationId, active: true, deletedAt: null },
      select: { id: true },
    });
  }

  async findProduct(organizationId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.product.findFirst({
      where: { id, organizationId, active: true, deletedAt: null },
      select: { id: true },
    });
  }

  async findUpcomingFollowUps(
    organizationId: string,
    opportunityId: string,
  ): Promise<
    Array<{
      id: string;
      dueAt: Date;
      priority: string;
      status: string;
      note: string | null;
      responsible: { id: string; firstName: string; lastName: string | null };
    }>
  > {
    return this.prisma.followUp.findMany({
      where: {
        organizationId,
        opportunityId,
        deletedAt: null,
        status: { in: ['PENDING', 'RESCHEDULED'] },
      },
      orderBy: { dueAt: 'asc' },
      take: 20,
      select: {
        id: true,
        dueAt: true,
        priority: true,
        status: true,
        note: true,
        responsible: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findHistory(
    organizationId: string,
    opportunityId: string,
    skip: number,
    take: number,
  ): Promise<OpportunityDetailRecord['stageHistory']> {
    return this.prisma.opportunityStageHistory.findMany({
      where: { organizationId, opportunityId },
      orderBy: { changedAt: 'desc' },
      skip,
      take,
      include: {
        fromStage: {
          select: { id: true, name: true, color: true, category: true, systemKey: true },
        },
        toStage: { select: { id: true, name: true, color: true, category: true, systemKey: true } },
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async countHistory(organizationId: string, opportunityId: string): Promise<number> {
    return this.prisma.opportunityStageHistory.count({ where: { organizationId, opportunityId } });
  }

  async findStages(
    organizationId: string,
    includeInactive = false,
  ): Promise<PipelineStageRecord[]> {
    return this.prisma.pipelineStage.findMany({
      where: { organizationId, deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        organizationId: true,
        name: true,
        order: true,
        color: true,
        active: true,
        category: true,
        systemKey: true,
        deletedAt: true,
      },
    });
  }

  async findStageOpportunities(
    organizationId: string,
    stageId: string,
    where: Prisma.OpportunityWhereInput,
    cursor: { createdAt: Date; id: string } | null,
    take: number,
  ): Promise<OpportunityListRecord[]> {
    const cursorWhere: Prisma.OpportunityWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};
    return this.prisma.opportunity.findMany({
      where: {
        organizationId,
        pipelineStageId: stageId,
        deletedAt: null,
        archivedAt: null,
        contact: { deletedAt: null },
        ...where,
        ...cursorWhere,
      },
      include: listInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
  }

  async groupSummary(organizationId: string, where: Prisma.OpportunityWhereInput) {
    return this.prisma.opportunity.groupBy({
      by: ['pipelineStageId', 'currency'],
      where: { organizationId, ...where },
      _count: { _all: true },
      _sum: { expectedAmount: true },
    });
  }

  async findActiveSale(
    organizationId: string,
    opportunityId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.sale.findFirst({
      where: { organizationId, opportunityId, deletedAt: null, status: { not: 'CANCELLED' } },
      select: { id: true },
    });
  }
}
