import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const opportunitySelect = Prisma.validator<Prisma.OpportunitySelect>()({
  id: true,
  title: true,
  userId: true,
  archivedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  lastStageChangedAt: true,
  wonAt: true,
  pipelineStage: {
    select: {
      id: true,
      name: true,
      color: true,
      category: true,
      systemKey: true,
    },
  },
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      country: true,
      deletedAt: true,
    },
  },
});

const personSelect = { id: true, firstName: true, lastName: true } as const;

const listInclude = Prisma.validator<Prisma.FollowUpInclude>()({
  responsible: { select: personSelect },
  opportunity: { select: opportunitySelect },
});

const detailInclude = Prisma.validator<Prisma.FollowUpInclude>()({
  responsible: { select: personSelect },
  createdBy: { select: personSelect },
  completedBy: { select: personSelect },
  cancelledBy: { select: personSelect },
  rescheduledFrom: { select: { id: true, title: true, dueAt: true, status: true } },
  opportunity: { select: opportunitySelect },
  histories: {
    orderBy: { changedAt: 'desc' },
    take: 30,
    include: { changedBy: { select: personSelect } },
  },
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
});

export type FollowUpListRecord = Prisma.FollowUpGetPayload<{ include: typeof listInclude }>;
export type FollowUpDetailRecord = Prisma.FollowUpGetPayload<{ include: typeof detailInclude }>;

export interface FollowUpOpportunityRecord {
  id: string;
  title: string;
  userId: string | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  pipelineStage: {
    category: 'OPEN' | 'WON' | 'LOST';
  };
  contact: { id: string; deletedAt: Date | null };
}

@Injectable()
export class FollowUpsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findForList(
    organizationId: string,
    where: Prisma.FollowUpWhereInput,
    orderBy: Prisma.FollowUpOrderByWithRelationInput[],
    skip: number,
    take: number,
  ): Promise<FollowUpListRecord[]> {
    return this.prisma.followUp.findMany({
      where: { organizationId, deletedAt: null, ...where },
      include: listInclude,
      orderBy,
      skip,
      take,
    });
  }

  async count(organizationId: string, where: Prisma.FollowUpWhereInput): Promise<number> {
    return this.prisma.followUp.count({ where: { organizationId, deletedAt: null, ...where } });
  }

  async findForMutation(organizationId: string, id: string): Promise<FollowUpDetailRecord | null> {
    return this.prisma.followUp.findFirst({
      where: { organizationId, id, deletedAt: null },
      include: detailInclude,
    });
  }

  async findDuplicate(
    organizationId: string,
    opportunityId: string,
    userId: string,
    dueAt: Date,
    excludedId?: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.followUp.findFirst({
      where: {
        organizationId,
        opportunityId,
        userId,
        dueAt,
        status: 'PENDING',
        archivedAt: null,
        deletedAt: null,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });
  }

  async findDuplicateAny(
    organizationId: string,
    opportunityId: string,
    dueAt: Date,
    excludedId?: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.followUp.findFirst({
      where: {
        organizationId,
        opportunityId,
        dueAt,
        status: 'PENDING',
        archivedAt: null,
        deletedAt: null,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });
  }

  async findOpportunity(
    organizationId: string,
    id: string,
  ): Promise<FollowUpOpportunityRecord | null> {
    return this.prisma.opportunity.findFirst({
      where: { organizationId, id },
      select: {
        id: true,
        title: true,
        userId: true,
        archivedAt: true,
        deletedAt: true,
        pipelineStage: { select: { category: true } },
        contact: { select: { id: true, deletedAt: true } },
      },
    });
  }

  async findAssignee(organizationId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({
      where: { id, organizationId, status: 'ACTIVE', deletedAt: null, role: { deletedAt: null } },
      select: { id: true },
    });
  }

  async findHistory(organizationId: string, followUpId: string, skip: number, take: number) {
    return this.prisma.followUpHistory.findMany({
      where: { organizationId, followUpId },
      orderBy: { changedAt: 'desc' },
      skip,
      take,
      include: { changedBy: { select: personSelect } },
    });
  }

  async countHistory(organizationId: string, followUpId: string): Promise<number> {
    return this.prisma.followUpHistory.count({ where: { organizationId, followUpId } });
  }
}
