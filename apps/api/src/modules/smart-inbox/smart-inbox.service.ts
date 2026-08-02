import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityType,
  Prisma,
  RenewalStatus,
  SaleStatus,
  SubscriptionStatus,
  WhatsAppConversationStatus,
  WhatsAppMessageDirection,
} from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, RequestMetadata } from '../auth/auth.types';
import { CommercialRequestContext } from '../commercial/commercial.types';
import { FollowUpsService } from '../follow-ups/followups.service';
import { OperationsRequestContext } from '../operations/operations.types';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { SalesService } from '../sales/sales.service';
import { CreateSaleDto } from '../sales/dto/sales.dto';
import { CreateTrialDto } from '../trials/dto/trials.dto';
import { TrialsService } from '../trials/trials.service';
import {
  AssignWhatsAppConversationDto,
  SendWhatsAppMessageDto,
} from '../whatsapp/dto/whatsapp.dto';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { SmartInboxEventsService } from './smart-inbox.events';
import {
  AddInboxNoteDto,
  CreateInboxFulfillmentDto,
  CreateInboxSaleDto,
  CreateInboxTrialDto,
  ListSmartInboxQueryDto,
  MoveInboxPipelineDto,
  ScheduleInboxFollowUpDto,
  SmartInboxView,
} from './dto/smart-inbox.dto';

type Context = { user: AuthenticatedUser; metadata: RequestMetadata };

const listInclude = {
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      country: true,
      source: true,
      isCustomer: true,
      tags: {
        where: { deletedAt: null },
        include: { tag: { select: { id: true, name: true, color: true } } },
      },
      opportunities: {
        where: { deletedAt: null },
        orderBy: { updatedAt: 'desc' as const },
        take: 3,
        include: {
          pipelineStage: { select: { id: true, name: true, color: true, category: true } },
          campaign: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      subscriptions: {
        where: { deletedAt: null },
        select: {
          id: true,
          status: true,
          nextBillingAt: true,
          renewals: {
            where: { deletedAt: null, status: { in: [RenewalStatus.DUE, RenewalStatus.OVERDUE] } },
            select: { id: true, status: true, dueAt: true },
            take: 2,
          },
        },
        take: 5,
      },
      sales: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' as const },
        take: 5,
        select: { id: true, total: true, currency: true, status: true, createdAt: true },
      },
      trials: {
        where: { deletedAt: null },
        take: 5,
        select: { id: true, status: true, startsAt: true, endsAt: true },
      },
    },
  },
  assignedUser: { select: { id: true, firstName: true, lastName: true } },
  connection: { select: { wabaId: true } },
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      direction: true,
      type: true,
      status: true,
      text: true,
      caption: true,
      createdAt: true,
    },
  },
} satisfies Prisma.WhatsAppConversationInclude;

const detailInclude = {
  ...listInclude,
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 100,
  },
  contact: {
    include: {
      tags: {
        where: { deletedAt: null },
        include: { tag: { select: { id: true, name: true, color: true } } },
      },
      opportunities: {
        where: { deletedAt: null },
        orderBy: { updatedAt: 'desc' as const },
        take: 10,
        include: {
          pipelineStage: { select: { id: true, name: true, color: true, category: true } },
          campaign: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
          followUps: {
            where: { deletedAt: null, archivedAt: null, status: 'PENDING' },
            orderBy: { dueAt: 'asc' as const },
            take: 10,
            select: { id: true, title: true, dueAt: true, priority: true, status: true },
          },
        },
      },
      sales: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' as const },
        take: 10,
        include: {
          items: {
            where: { deletedAt: null },
            select: {
              id: true,
              saleId: true,
              productId: true,
              productNameSnapshot: true,
              quantity: true,
              unitPrice: true,
              total: true,
              currency: true,
              requiresSubscriptionSnapshot: true,
            },
          },
        },
      },
      subscriptions: {
        where: { deletedAt: null },
        orderBy: { nextBillingAt: 'asc' as const },
        take: 10,
        include: {
          renewals: {
            where: { deletedAt: null },
            orderBy: { dueAt: 'asc' as const },
            take: 10,
            select: { id: true, status: true, dueAt: true, amount: true, currency: true },
          },
        },
      },
      trials: {
        where: { deletedAt: null },
        orderBy: { endsAt: 'desc' as const },
        take: 10,
        select: { id: true, status: true, startsAt: true, endsAt: true, productId: true },
      },
    },
  },
} satisfies Prisma.WhatsAppConversationInclude;

type ListRecord = Prisma.WhatsAppConversationGetPayload<{ include: typeof listInclude }>;
type DetailRecord = Prisma.WhatsAppConversationGetPayload<{ include: typeof detailInclude }>;

function displayName(firstName: string | null, lastName: string | null): string {
  return (
    [firstName, lastName].filter((value): value is string => Boolean(value)).join(' ') ||
    'Sin nombre'
  );
}

function decimal(value: Prisma.Decimal | null | undefined): string | null {
  return value?.toFixed(2) ?? null;
}

function flag(country: string | null): string {
  if (!country || country.length !== 2) return '🌐';
  return country
    .toUpperCase()
    .split('')
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('');
}

@Injectable()
export class SmartInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: SmartInboxEventsService,
    _whatsapp: WhatsAppService,
    private readonly opportunities: OpportunitiesService,
    private readonly sales: SalesService,
    private readonly followUps: FollowUpsService,
    private readonly fulfillments: FulfillmentService,
    private readonly trials: TrialsService,
    _outbox: OutboxService,
  ) {}

  async list(
    query: ListSmartInboxQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const where = this.buildWhere(query, user);
    const [rows, total] = await Promise.all([
      this.prisma.whatsAppConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: listInclude,
      }),
      this.prisma.whatsAppConversation.count({ where }),
    ]);
    return {
      data: (rows as ListRecord[]).map((row) => this.mapConversation(row)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      views: await this.viewCounts(user),
    };
  }

  async detail(id: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const row = await this.prisma.whatsAppConversation.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      include: detailInclude,
    });
    if (!row) this.notFound();
    const record = row as DetailRecord;
    const [timeline, responseStats] = await Promise.all([
      this.timeline(id, user),
      this.responseStats(id, user.organizationId),
    ]);
    const upcomingFollowUps = record.contact.opportunities.flatMap((opportunity) =>
      opportunity.followUps.map((followUp) => ({ ...followUp, opportunityId: opportunity.id })),
    );
    const revenue = record.contact.sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    return {
      conversation: this.mapConversation(record),
      messages: [...record.messages].reverse().map((message) => this.mapMessage(message)),
      timeline: timeline.data,
      panel: {
        contact: {
          id: record.contact.id,
          name: displayName(record.contact.firstName, record.contact.lastName),
          email: record.contact.email,
          phone: record.contact.phone,
          country: record.contact.country,
          source: record.contact.source,
          isCustomer: record.contact.isCustomer,
          tags: record.contact.tags.map(({ tag }) => tag),
        },
        opportunities: record.contact.opportunities.map((opportunity) => ({
          id: opportunity.id,
          title: opportunity.title,
          pipelineStage: opportunity.pipelineStage,
          campaign: opportunity.campaign,
          product: opportunity.product,
          assignedTo: opportunity.owner,
        })),
        sales: record.contact.sales.map((sale) => ({
          id: sale.id,
          status: sale.status,
          total: decimal(sale.total),
          currency: sale.currency,
          createdAt: sale.createdAt,
          items: sale.items.map((item) => ({
            ...item,
            quantity: decimal(item.quantity),
            unitPrice: decimal(item.unitPrice),
            total: decimal(item.total),
          })),
        })),
        subscriptions: record.contact.subscriptions,
        trials: record.contact.trials,
        followUps: upcomingFollowUps,
        metrics: {
          firstResponseSeconds: responseStats.firstResponseSeconds,
          averageResponseSeconds: responseStats.averageResponseSeconds,
          messageCount: responseStats.messageCount,
          saleCount: record.contact.sales.length,
          revenue: revenue.toFixed(2),
          mrr: record.contact.subscriptions
            .filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE)
            .reduce((sum, subscription) => sum + Number(subscription.amount), 0)
            .toFixed(2),
          ltv: revenue.toFixed(2),
          lastPurchaseAt: record.contact.sales[0]?.createdAt ?? null,
          nextRenewalAt:
            record.contact.subscriptions
              .map((subscription) => subscription.nextBillingAt)
              .filter((value): value is Date => Boolean(value))
              .sort((a, b) => a.getTime() - b.getTime())[0]
              ?.toISOString() ?? null,
          activeProducts: record.contact.sales.flatMap((sale) =>
            sale.items.map((item) => item.productNameSnapshot),
          ),
        },
      },
    };
  }

  async timeline(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ data: Array<Record<string, unknown>> }> {
    await this.requireConversation(id, user.organizationId);
    const [
      messages,
      activities,
      stageChanges,
      sales,
      payments,
      fulfillments,
      renewals,
      credentials,
    ] = await Promise.all([
      this.prisma.whatsAppMessage.findMany({
        where: { organizationId: user.organizationId, conversationId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, direction: true, type: true, text: true, createdAt: true },
      }),
      this.prisma.activity.findMany({
        where: {
          organizationId: user.organizationId,
          contact: { whatsappConversations: { some: { id } } },
          deletedAt: null,
        },
        orderBy: { occurredAt: 'desc' },
        take: 100,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          metadata: true,
          occurredAt: true,
        },
      }),
      this.prisma.opportunityStageHistory.findMany({
        where: {
          organizationId: user.organizationId,
          opportunity: { contact: { whatsappConversations: { some: { id } } } },
        },
        orderBy: { changedAt: 'desc' },
        take: 100,
        include: {
          toStage: { select: { name: true, color: true } },
          fromStage: { select: { name: true } },
        },
      }),
      this.prisma.sale.findMany({
        where: {
          organizationId: user.organizationId,
          contact: { whatsappConversations: { some: { id } } },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, status: true, total: true, currency: true, createdAt: true },
      }),
      this.prisma.payment.findMany({
        where: {
          organizationId: user.organizationId,
          sale: { contact: { whatsappConversations: { some: { id } } } },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, status: true, grossAmount: true, currency: true, createdAt: true },
      }),
      this.prisma.fulfillment.findMany({
        where: {
          organizationId: user.organizationId,
          sale: { contact: { whatsappConversations: { some: { id } } } },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, status: true, provider: { select: { name: true } }, createdAt: true },
      }),
      this.prisma.renewal.findMany({
        where: {
          organizationId: user.organizationId,
          subscription: { contact: { whatsappConversations: { some: { id } } } },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          dueAt: true,
          createdAt: true,
        },
      }),
      this.prisma.credentialRecord.findMany({
        where: {
          organizationId: user.organizationId,
          fulfillment: { sale: { contact: { whatsappConversations: { some: { id } } } } },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, status: true, credentialKey: true, createdAt: true },
      }),
    ]);

    const data = [
      ...messages.map((item) => ({
        id: `message-${item.id}`,
        kind: 'MESSAGE',
        title:
          item.direction === WhatsAppMessageDirection.INBOUND
            ? 'Mensaje recibido'
            : 'Mensaje enviado',
        description: item.text ?? item.type,
        occurredAt: item.createdAt,
        metadata: { direction: item.direction, type: item.type },
      })),
      ...activities.map((item) => ({
        id: item.id,
        kind: 'ACTIVITY',
        title: item.title ?? item.type,
        description: item.description,
        occurredAt: item.occurredAt,
        metadata: item.metadata,
      })),
      ...stageChanges.map((item) => ({
        id: `stage-${item.id}`,
        kind: 'PIPELINE',
        title: 'Cambio de pipeline',
        description: `${item.fromStage?.name ?? 'Inicio'} → ${item.toStage.name}`,
        occurredAt: item.changedAt,
        metadata: { color: item.toStage.color, reason: item.reason },
      })),
      ...sales.map((item) => ({
        id: `sale-${item.id}`,
        kind: 'SALE',
        title: `Venta ${item.status}`,
        description: `${item.currency} ${decimal(item.total) ?? '0.00'}`,
        occurredAt: item.createdAt,
        metadata: { saleId: item.id },
      })),
      ...payments.map((item) => ({
        id: `payment-${item.id}`,
        kind: 'PAYMENT',
        title: `Pago ${item.status}`,
        description: `${item.currency} ${decimal(item.grossAmount) ?? '0.00'}`,
        occurredAt: item.createdAt,
        metadata: { paymentId: item.id },
      })),
      ...fulfillments.map((item) => ({
        id: `fulfillment-${item.id}`,
        kind: 'FULFILLMENT',
        title: `Fulfillment ${item.status}`,
        description: item.provider?.name ?? 'Sin provider',
        occurredAt: item.createdAt,
        metadata: { fulfillmentId: item.id },
      })),
      ...renewals.map((item) => ({
        id: `renewal-${item.id}`,
        kind: 'RENEWAL',
        title: `Renovación ${item.status}`,
        description: `${item.currency} ${decimal(item.amount) ?? '0.00'}`,
        occurredAt: item.createdAt,
        metadata: { dueAt: item.dueAt },
      })),
      ...credentials.map((item) => ({
        id: `credential-${item.id}`,
        kind: 'CREDENTIAL',
        title: 'Credenciales entregadas',
        description: item.credentialKey,
        occurredAt: item.createdAt,
        metadata: { status: item.status },
      })),
    ]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 150);
    return { data };
  }

  async markRead(id: string, context: Context): Promise<Record<string, unknown>> {
    void id;
    void context;
    return this.readOnlyMutation();
  }

  async assign(id: string, dto: AssignWhatsAppConversationDto, context: Context) {
    void id;
    void dto;
    void context;
    return this.readOnlyMutation();
  }

  async sendMessage(id: string, dto: SendWhatsAppMessageDto, context: Context) {
    void id;
    void dto;
    void context;
    return this.readOnlyMutation();
  }

  async addNote(id: string, dto: AddInboxNoteDto, context: Context) {
    const conversation = await this.requireConversation(id, context.user.organizationId);
    const result = await this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const activity = await transaction.activity.create({
        data: {
          organizationId: context.user.organizationId,
          userId: context.user.userId,
          contactId: conversation.contactId,
          type: ActivityType.NOTE,
          title: 'Nota agregada desde Inbox',
          description: dto.note.trim(),
          occurredAt: now,
          requestId: context.metadata.requestId ?? null,
        },
      });
      await transaction.contact.update({
        where: {
          organizationId_id: {
            organizationId: context.user.organizationId,
            id: conversation.contactId,
          },
        },
        data: { lastActivityAt: now },
      });
      await this.audit.recordWithClient(transaction, {
        organizationId: context.user.organizationId,
        userId: context.user.userId,
        action: 'SMART_INBOX_NOTE_ADDED',
        tableName: 'Activity',
        recordId: activity.id,
        newValue: { contactId: conversation.contactId, hasNote: true },
        requestId: context.metadata.requestId,
      });
      return activity;
    });
    this.publish('NoteAdded', context, id, { activityId: result.id });
    return { id: result.id, type: result.type, title: result.title };
  }

  async movePipeline(id: string, dto: MoveInboxPipelineDto, context: Context) {
    const conversation = await this.requireConversation(id, context.user.organizationId);
    const opportunity = await this.activeOpportunity(
      conversation.contactId,
      context.user.organizationId,
    );
    if (!opportunity)
      this.domainError(
        'SMART_INBOX_OPPORTUNITY_NOT_FOUND',
        'El contacto no tiene una oportunidad activa.',
      );
    const result = await this.opportunities.move(opportunity.id, dto, {
      user: context.user,
      metadata: context.metadata,
    });
    this.publish('PipelineChanged', context, id, {
      opportunityId: opportunity.id,
      pipelineStageId: dto.pipelineStageId,
    });
    return result;
  }

  async createSale(id: string, dto: CreateInboxSaleDto, context: Context) {
    const conversation = await this.requireConversation(id, context.user.organizationId);
    const opportunity = await this.activeOpportunity(
      conversation.contactId,
      context.user.organizationId,
    );
    const saleDto: CreateSaleDto = {
      contactId: conversation.contactId,
      currency: dto.currency,
      items: dto.items,
    };
    if (opportunity) saleDto.opportunityId = opportunity.id;
    if (dto.discountAmount !== undefined) saleDto.discountAmount = dto.discountAmount;
    if (dto.taxAmount !== undefined) saleDto.taxAmount = dto.taxAmount;
    if (dto.note !== undefined) saleDto.note = dto.note;
    const result = await this.sales.create(saleDto, {
      user: context.user,
      metadata: context.metadata,
    } as CommercialRequestContext);
    this.publish('SaleCreated', context, id, {
      saleId: String((result as { id?: unknown }).id ?? ''),
    });
    return result;
  }

  async scheduleFollowUp(id: string, dto: ScheduleInboxFollowUpDto, context: Context) {
    const conversation = await this.requireConversation(id, context.user.organizationId);
    const opportunity = await this.activeOpportunity(
      conversation.contactId,
      context.user.organizationId,
    );
    if (!opportunity)
      this.domainError(
        'SMART_INBOX_OPPORTUNITY_NOT_FOUND',
        'El contacto no tiene una oportunidad activa.',
      );
    const result = await this.followUps.create(
      { ...dto, opportunityId: opportunity.id },
      { user: context.user, metadata: context.metadata },
    );
    this.publish('FollowUpCreated', context, id, { opportunityId: opportunity.id });
    return result;
  }

  async createFulfillment(id: string, dto: CreateInboxFulfillmentDto, context: Context) {
    const conversation = await this.requireConversation(id, context.user.organizationId);
    const item = await this.prisma.saleItem.findFirst({
      where: {
        id: dto.saleItemId,
        organizationId: context.user.organizationId,
        deletedAt: null,
        sale: { contactId: conversation.contactId, deletedAt: null },
      },
      select: { id: true },
    });
    if (!item)
      this.domainError('SMART_INBOX_SALE_ITEM_NOT_FOUND', 'El ítem no pertenece al contacto.');
    const result = await this.fulfillments.create(dto, {
      user: context.user,
      metadata: context.metadata,
    } as OperationsRequestContext);
    this.publish('FulfillmentCreated', context, id);
    return result;
  }

  async createTrial(id: string, dto: CreateInboxTrialDto, context: Context) {
    const conversation = await this.requireConversation(id, context.user.organizationId);
    const opportunity = await this.activeOpportunity(
      conversation.contactId,
      context.user.organizationId,
    );
    const trialDto: CreateTrialDto = {
      contactId: conversation.contactId,
      productId: dto.productId,
      durationMinutes: dto.durationMinutes,
    };
    if (opportunity) trialDto.opportunityId = opportunity.id;
    if (dto.planId) trialDto.planId = dto.planId;
    if (dto.variantId) trialDto.variantId = dto.variantId;
    if (dto.providerId) trialDto.providerId = dto.providerId;
    if (dto.notes !== undefined) trialDto.notes = dto.notes;
    const result = await this.trials.create(trialDto, {
      user: context.user,
      metadata: context.metadata,
    });
    this.publish('TrialCreated', context, id);
    return result;
  }

  async changeStatus(id: string, status: WhatsAppConversationStatus, context: Context) {
    void id;
    void status;
    void context;
    return this.readOnlyMutation();
  }

  private buildWhere(
    query: ListSmartInboxQueryDto,
    user: AuthenticatedUser,
  ): Prisma.WhatsAppConversationWhereInput {
    const where: Prisma.WhatsAppConversationWhereInput = {
      organizationId: user.organizationId,
      ...(query.view === SmartInboxView.TRASH ? { deletedAt: { not: null } } : { deletedAt: null }),
    };
    if (query.view !== SmartInboxView.TRASH) {
      if (query.view === SmartInboxView.CLOSED) where.status = WhatsAppConversationStatus.CLOSED;
      if (query.view === SmartInboxView.ARCHIVED)
        where.status = WhatsAppConversationStatus.ARCHIVED;
      if (query.view === SmartInboxView.INBOX) where.status = WhatsAppConversationStatus.OPEN;
      if (query.view === SmartInboxView.UNASSIGNED) where.assignedUserId = null;
      if (query.view === SmartInboxView.MINE) where.assignedUserId = user.userId;
    }
    const and: Prisma.WhatsAppConversationWhereInput[] = [];
    if (query.unread) where.unreadCount = { gt: 0 };
    if (query.view === SmartInboxView.PENDING || query.pending)
      and.push({
        contact: {
          opportunities: {
            some: {
              deletedAt: null,
              archivedAt: null,
              followUps: { some: { deletedAt: null, archivedAt: null, status: 'PENDING' } },
            },
          },
        },
      });
    if (query.country) and.push({ contact: { country: query.country.toUpperCase() } });
    if (query.source)
      and.push({ contact: { source: { equals: query.source, mode: 'insensitive' } } });
    if (query.assignedUserId) where.assignedUserId = query.assignedUserId;
    if (query.tagId)
      and.push({ contact: { tags: { some: { tagId: query.tagId, deletedAt: null } } } });
    if (query.productId)
      and.push({
        contact: { opportunities: { some: { productId: query.productId, deletedAt: null } } },
      });
    if (query.campaignId)
      and.push({
        contact: { opportunities: { some: { campaignId: query.campaignId, deletedAt: null } } },
      });
    if (query.demo)
      and.push({
        contact: {
          trials: {
            some: { deletedAt: null, status: { in: ['ACTIVE', 'APPROVED', 'REQUESTED'] } },
          },
        },
      });
    if (query.sale)
      and.push({
        contact: { sales: { some: { deletedAt: null, status: { not: SaleStatus.CANCELLED } } } },
      });
    if (query.renewal)
      and.push({
        contact: {
          subscriptions: {
            some: {
              deletedAt: null,
              renewals: {
                some: {
                  deletedAt: null,
                  status: { in: [RenewalStatus.DUE, RenewalStatus.OVERDUE] },
                },
              },
            },
          },
        },
      });
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { externalContactPhoneNormalized: { contains: term } },
        { externalContactName: { contains: term, mode: 'insensitive' } },
        { contact: { firstName: { contains: term, mode: 'insensitive' } } },
        { contact: { lastName: { contains: term, mode: 'insensitive' } } },
        { contact: { email: { contains: term, mode: 'insensitive' } } },
        { messages: { some: { deletedAt: null, text: { contains: term, mode: 'insensitive' } } } },
      ];
    }
    if (and.length) where.AND = and;
    return where;
  }

  private async viewCounts(user: AuthenticatedUser): Promise<Record<string, number>> {
    const base = { organizationId: user.organizationId, deletedAt: null };
    const [inbox, unassigned, mine, pending, renewals, closed, archived] = await Promise.all([
      this.prisma.whatsAppConversation.count({
        where: { ...base, status: WhatsAppConversationStatus.OPEN },
      }),
      this.prisma.whatsAppConversation.count({ where: { ...base, assignedUserId: null } }),
      this.prisma.whatsAppConversation.count({ where: { ...base, assignedUserId: user.userId } }),
      this.prisma.whatsAppConversation.count({
        where: {
          ...base,
          contact: {
            opportunities: {
              some: {
                deletedAt: null,
                archivedAt: null,
                followUps: { some: { deletedAt: null, archivedAt: null, status: 'PENDING' } },
              },
            },
          },
        },
      }),
      this.prisma.whatsAppConversation.count({
        where: {
          ...base,
          contact: {
            subscriptions: {
              some: {
                deletedAt: null,
                renewals: {
                  some: {
                    deletedAt: null,
                    status: { in: [RenewalStatus.DUE, RenewalStatus.OVERDUE] },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.whatsAppConversation.count({
        where: { ...base, status: WhatsAppConversationStatus.CLOSED },
      }),
      this.prisma.whatsAppConversation.count({
        where: { ...base, status: WhatsAppConversationStatus.ARCHIVED },
      }),
    ]);
    return { inbox, unassigned, mine, pending, renewals, closed, archived };
  }

  private mapConversation(row: ListRecord | DetailRecord): Record<string, unknown> {
    const contact = row.contact;
    const opportunity = contact.opportunities[0] ?? null;
    const now = new Date();
    const renewal = contact.subscriptions.some(
      (subscription) =>
        subscription.renewals.length > 0 ||
        (subscription.nextBillingAt
          ? subscription.nextBillingAt <= new Date(now.getTime() + 14 * 86_400_000)
          : false),
    );
    const vip =
      contact.tags.some(({ tag }) => tag.name.toUpperCase() === 'VIP') || contact.sales.length >= 3;
    const unanswered24h = Boolean(
      row.lastInboundAt &&
      row.lastInboundAt < new Date(now.getTime() - 24 * 60 * 60 * 1000) &&
      (!row.lastOutboundAt || row.lastOutboundAt < row.lastInboundAt),
    );
    const latest = row.messages[0];
    return {
      id: row.id,
      avatar: displayName(contact.firstName, contact.lastName).slice(0, 1).toUpperCase(),
      name: displayName(contact.firstName, contact.lastName),
      externalContactName: row.externalContactName,
      phone: row.externalContactPhone,
      phoneNormalized: row.externalContactPhoneNormalized,
      flag: flag(contact.country),
      country: contact.country,
      lastMessage: latest?.text ?? latest?.caption ?? (latest ? `[${latest.type}]` : null),
      lastMessageAt: row.lastMessageAt,
      responsible: row.assignedUser
        ? displayName(row.assignedUser.firstName, row.assignedUser.lastName)
        : null,
      assignedTo: row.assignedUser,
      pipeline: opportunity?.pipelineStage ?? null,
      opportunity: opportunity ? { id: opportunity.id, title: opportunity.title } : null,
      tags: contact.tags.map(({ tag }) => tag),
      source: contact.source,
      channel:
        row.connection?.wabaId === 'WHATSAPP_WEB_BRIDGE' ? 'WhatsApp Web Bridge' : 'WhatsApp',
      readOnly: row.connection?.wabaId === 'WHATSAPP_WEB_BRIDGE',
      status: row.status,
      window: {
        open: Boolean(row.windowExpiresAt && row.windowExpiresAt > now),
        expiresAt: row.windowExpiresAt,
      },
      unreadCount: row.unreadCount,
      isVip: vip,
      renewalDue: renewal,
      chips: [
        ...(contact.isCustomer ? ['Cliente activo'] : ['Lead nuevo']),
        ...(vip ? ['VIP'] : []),
        ...(renewal ? ['Renovación próxima'] : []),
        ...(contact.sales.length > 0 ? ['Venta cerrada'] : []),
        ...(contact.trials.length > 0 ? ['Demo enviada'] : []),
        ...(unanswered24h ? ['Sin responder 24h'] : []),
      ],
    };
  }

  private mapMessage(message: {
    id: string;
    direction: string;
    type: string;
    status: string;
    text: string | null;
    templateName?: string | null;
    caption?: string | null;
    createdAt: Date;
  }) {
    return {
      ...message,
      createdAt: message.createdAt,
      text: message.text ?? message.caption ?? null,
    };
  }

  private async responseStats(conversationId: string, organizationId: string) {
    const [messageCount, firstInbound, firstOutbound, outboundMessages] = await Promise.all([
      this.prisma.whatsAppMessage.count({
        where: { organizationId, conversationId, deletedAt: null },
      }),
      this.prisma.whatsAppMessage.findFirst({
        where: {
          organizationId,
          conversationId,
          direction: WhatsAppMessageDirection.INBOUND,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.whatsAppMessage.findFirst({
        where: {
          organizationId,
          conversationId,
          direction: WhatsAppMessageDirection.OUTBOUND,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.whatsAppMessage.findMany({
        where: {
          organizationId,
          conversationId,
          direction: WhatsAppMessageDirection.OUTBOUND,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const firstResponseSeconds =
      firstInbound && firstOutbound && firstOutbound.createdAt >= firstInbound.createdAt
        ? Math.round((firstOutbound.createdAt.getTime() - firstInbound.createdAt.getTime()) / 1000)
        : null;
    const intervals = outboundMessages
      .slice(0, -1)
      .map((message, index) => {
        const next = outboundMessages[index + 1];
        return next ? message.createdAt.getTime() - next.createdAt.getTime() : null;
      })
      .filter((value): value is number => value !== null);
    const averageResponseSeconds =
      intervals.length > 0
        ? Math.round(
            Math.abs(intervals.reduce((sum, value) => sum + value, 0) / intervals.length) / 1000,
          )
        : firstResponseSeconds;
    return { messageCount, firstResponseSeconds, averageResponseSeconds };
  }

  private async requireConversation(id: string, organizationId: string) {
    const conversation = await this.prisma.whatsAppConversation.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!conversation) this.notFound();
    return conversation;
  }

  private async activeOpportunity(contactId: string, organizationId: string) {
    return this.prisma.opportunity.findFirst({
      where: { organizationId, contactId, deletedAt: null, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
  }

  private publish(
    type: string,
    context: Context,
    conversationId: string,
    payload?: Record<string, unknown>,
  ): void {
    this.events.publish({
      type,
      organizationId: context.user.organizationId,
      conversationId,
      occurredAt: new Date().toISOString(),
      ...(context.metadata.requestId ? { requestId: context.metadata.requestId } : {}),
      ...(payload ? { payload } : {}),
    });
  }

  private notFound(): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_FOUND,
        code: 'SMART_INBOX_CONVERSATION_NOT_FOUND',
        message: 'Conversación no encontrada.',
      },
      HttpStatus.NOT_FOUND,
    );
  }

  private domainError(code: string, message: string): never {
    throw new HttpException(
      { statusCode: HttpStatus.CONFLICT, code, message },
      HttpStatus.CONFLICT,
    );
  }

  private readOnlyMutation(): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.METHOD_NOT_ALLOWED,
        code: 'WHATSAPP_READ_ONLY',
        message: 'El workspace WhatsApp es exclusivamente de lectura.',
      },
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }
}
