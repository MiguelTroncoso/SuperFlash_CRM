import { Injectable } from '@nestjs/common';
import { PipelineStageCategory, Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const summaryInclude = Prisma.validator<Prisma.ContactInclude>()({
  assignedTo: {
    select: { id: true, firstName: true, lastName: true },
  },
  tags: {
    where: { deletedAt: null },
    include: { tag: { select: { id: true, name: true, color: true } } },
  },
  opportunities: {
    where: {
      deletedAt: null,
      pipelineStage: {
        deletedAt: null,
        active: true,
        category: PipelineStageCategory.OPEN,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: {
      pipelineStage: { select: { id: true, name: true, color: true, category: true } },
      campaign: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
  },
});

const detailInclude = Prisma.validator<Prisma.ContactInclude>()({
  assignedTo: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  tags: {
    where: { deletedAt: null },
    include: { tag: { select: { id: true, name: true, color: true } } },
  },
  opportunities: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      pipelineStage: { select: { id: true, name: true, color: true, category: true } },
      campaign: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
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

const mutationSelect = Prisma.validator<Prisma.ContactSelect>()({
  id: true,
  organizationId: true,
  userId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  phoneNormalized: true,
  country: true,
  source: true,
  notes: true,
  isCustomer: true,
  archivedAt: true,
  deletedAt: true,
  lastActivityAt: true,
  createdAt: true,
  updatedAt: true,
});

export type ContactSummary = Prisma.ContactGetPayload<{ include: typeof summaryInclude }>;
export type ContactDetail = Prisma.ContactGetPayload<{ include: typeof detailInclude }>;
export type ContactMutation = Prisma.ContactGetPayload<{ select: typeof mutationSelect }>;

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findForList(
    organizationId: string,
    where: Prisma.ContactWhereInput,
    orderBy: Prisma.ContactOrderByWithRelationInput,
    skip: number,
    take: number,
  ): Promise<ContactSummary[]> {
    return this.prisma.contact.findMany({
      where: { organizationId, ...where },
      include: summaryInclude,
      orderBy,
      skip,
      take,
    });
  }

  async count(organizationId: string, where: Prisma.ContactWhereInput): Promise<number> {
    return this.prisma.contact.count({ where: { organizationId, ...where } });
  }

  async findSummaryById(organizationId: string, id: string): Promise<ContactSummary | null> {
    return this.prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: summaryInclude,
    });
  }

  async findDetailById(organizationId: string, id: string): Promise<ContactDetail | null> {
    return this.prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: detailInclude,
    });
  }

  async findUpcomingFollowUps(
    organizationId: string,
    contactId: string,
  ): Promise<
    Array<{
      id: string;
      dueAt: Date;
      priority: string;
      status: string;
      note: string | null;
      responsible: { id: string; firstName: string; lastName: string | null };
      opportunity: { id: string; title: string };
    }>
  > {
    return this.prisma.followUp.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['PENDING', 'RESCHEDULED'] },
        opportunity: { organizationId, contactId, deletedAt: null },
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
        opportunity: { select: { id: true, title: true } },
      },
    });
  }

  async findForMutation(organizationId: string, id: string): Promise<ContactMutation | null> {
    return this.prisma.contact.findFirst({
      where: { id, organizationId },
      select: mutationSelect,
    });
  }

  async findPhoneAcrossOrganization(
    organizationId: string,
    phoneNormalized: string,
    excludedId?: string,
  ): Promise<ContactMutation | null> {
    return this.prisma.contact.findFirst({
      where: {
        organizationId,
        phoneNormalized,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      orderBy: [{ deletedAt: 'asc' }, { archivedAt: 'asc' }, { createdAt: 'asc' }],
      select: mutationSelect,
    });
  }

  async findActiveEmail(
    organizationId: string,
    email: string,
    excludedId?: string,
  ): Promise<ContactMutation | null> {
    return this.prisma.contact.findFirst({
      where: {
        organizationId,
        email,
        archivedAt: null,
        deletedAt: null,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: mutationSelect,
    });
  }

  async findAssignee(organizationId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
        role: { deletedAt: null },
      },
      select: { id: true },
    });
  }

  async findAssignees(
    organizationId: string,
  ): Promise<Array<{ id: string; firstName: string; lastName: string | null }>> {
    return this.prisma.user.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
        role: { deletedAt: null },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    });
  }

  async findTag(
    organizationId: string,
    id: string,
  ): Promise<{
    id: string;
    name: string;
    color: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    return this.prisma.tag.findFirst({
      where: { organizationId, id },
      select: {
        id: true,
        name: true,
        color: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
