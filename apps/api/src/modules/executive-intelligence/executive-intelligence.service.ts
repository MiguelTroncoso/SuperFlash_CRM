import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  GlobalSearchQueryDto,
  IntelligenceQueryDto,
  PipelineIntelligenceQueryDto,
} from './dto/intelligence.dto';

interface MoneyRow {
  currency: string;
  amount: string | number | Prisma.Decimal | null;
  count: string | number | bigint;
}

interface LabelRow {
  label: string | null;
  count: string | number | bigint;
  amount?: string | number | Prisma.Decimal | null;
  units?: string | number | Prisma.Decimal | null;
}

interface TrendRow {
  bucket: Date | string;
  currency: string;
  amount: string | number | Prisma.Decimal | null;
  count: string | number | bigint;
}

function numberValue(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimalValue(value: unknown): string {
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  return numberValue(value).toFixed(2);
}

function dateValue(value: string | Date | undefined, endOfDay = false): Date {
  if (value) {
    const source =
      typeof value === 'string' && value.length === 10
        ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
        : value;
    const parsed = new Date(source);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function monthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addMonths(value: Date, months: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function isoBucket(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function nameOf(
  firstName: string | null,
  lastName: string | null,
  fallback = 'Sin nombre',
): string {
  return `${firstName ?? ''} ${lastName ?? ''}`.trim() || fallback;
}

@Injectable()
export class ExecutiveIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(
    query: IntelligenceQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const range = this.range(query);
    const month = monthStart(range.to);
    const nextMonth = addMonths(month, 1);
    const weekStart = new Date(range.to);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const [
      salesToday,
      salesWeek,
      salesMonth,
      billingToday,
      billingMonth,
      mrr,
      activeCustomers,
      newCustomers,
      lostCustomers,
      renewalsMonth,
      pendingRenewals,
      pendingBalance,
      pendingFulfillments,
      pendingActivations,
      revenueDaily,
      revenueMonthly,
      salesCountry,
      salesProduct,
      newCustomersWeekly,
      funnel,
      renewalsTrend,
      mrrHistory,
      paymentMethods,
    ] = await Promise.all([
      this.salesMoney(user.organizationId, this.dayStart(range.to), range.to, query),
      this.salesMoney(user.organizationId, weekStart, range.to, query),
      this.salesMoney(user.organizationId, month, nextMonth, query),
      this.paymentMoney(user.organizationId, this.dayStart(range.to), range.to, query),
      this.paymentMoney(user.organizationId, month, nextMonth, query),
      this.mrr(user.organizationId, query),
      this.prisma.contact.count({
        where: { organizationId: user.organizationId, deletedAt: null, isCustomer: true },
      }),
      this.prisma.contact.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          createdAt: { gte: month, lt: nextMonth },
        },
      }),
      this.lostCustomers(user.organizationId, month, nextMonth),
      this.prisma.renewal.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: 'PAID',
          paidAt: { gte: month, lt: nextMonth },
        },
      }),
      this.prisma.renewal.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: { notIn: ['PAID', 'CANCELLED'] },
          dueAt: { lte: nextMonth },
        },
      }),
      this.pendingBalance(user.organizationId, query),
      this.prisma.fulfillment.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: { in: ['PENDING', 'ASSIGNED', 'PROCESSING', 'FAILED'] },
        },
      }),
      this.prisma.activation.count({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          status: { in: ['PENDING', 'FAILED'] },
        },
      }),
      this.revenueDaily(user.organizationId, range, query),
      this.revenueMonthly(user.organizationId, range.to, query),
      this.salesByCountry(user.organizationId, range, query),
      this.salesByProduct(user.organizationId, range, query),
      this.newCustomersWeekly(user.organizationId, range.to),
      this.funnel(user.organizationId, range, query),
      this.renewalsTrend(user.organizationId, range, query),
      this.mrrHistory(user.organizationId, range.to, query),
      this.paymentMethods(user.organizationId, range, query),
    ]);
    const conversion = await this.generalConversion(user.organizationId, range, query);
    const money = (rows: MoneyRow[]) =>
      rows.map((row) => ({
        currency: row.currency,
        amount: decimalValue(row.amount),
        count: numberValue(row.count),
      }));
    return {
      generatedAt: new Date().toISOString(),
      period: { from: range.from, to: range.to },
      kpis: {
        salesToday: money(salesToday),
        salesWeek: money(salesWeek),
        salesMonth: money(salesMonth),
        billingToday: money(billingToday),
        billingMonth: money(billingMonth),
        mrr: money(mrr),
        arr: money(mrr.map((row) => ({ ...row, amount: numberValue(row.amount) * 12 }))),
        activeCustomers,
        newCustomers,
        lostCustomers,
        renewalsMonth,
        pendingRenewals,
        pendingBalance,
        pendingFulfillments,
        pendingActivations,
        conversion,
      },
      charts: {
        revenueDaily,
        revenueMonthly,
        salesCountry,
        salesProduct,
        newCustomersWeekly,
        funnel,
        renewalsTrend,
        mrrHistory,
        paymentMethods,
      },
    };
  }

  async businessIntelligence(
    query: IntelligenceQueryDto,
    user: AuthenticatedUser,
    view = 'summary',
  ): Promise<Record<string, unknown>> {
    const range = this.range(query);
    const data =
      view === 'countries'
        ? await this.countries(user.organizationId, range, query)
        : view === 'products'
          ? await this.products(user.organizationId, range, query)
          : view === 'campaigns'
            ? await this.campaigns(user.organizationId, range, query)
            : view === 'sellers'
              ? await this.sellers(user.organizationId, range, query)
              : view === 'providers'
                ? await this.providers(user.organizationId, range, query)
                : view === 'renewals'
                  ? await this.renewalBreakdown(user.organizationId, range, query)
                  : await this.summary(user.organizationId, range, query);
    return { generatedAt: new Date().toISOString(), period: range, view, data };
  }

  async customer360(contactId: string, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const organizationId = user.organizationId;
    const contact = await this.prisma.contact.findFirst({
      where: { organizationId, id: contactId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        country: true,
        source: true,
        notes: true,
        isCustomer: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        tags: {
          where: { deletedAt: null, tag: { deletedAt: null } },
          select: { tag: { select: { id: true, name: true, color: true } } },
        },
      },
    });
    if (!contact)
      throw new HttpException(
        { statusCode: 404, code: 'CUSTOMER_NOT_FOUND', message: 'El cliente no existe.' },
        HttpStatus.NOT_FOUND,
      );
    const [opportunities, activities, sales, subscriptions, conversations] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: { organizationId, contactId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          expectedAmount: true,
          currency: true,
          priority: true,
          probability: true,
          createdAt: true,
          lastStageChangedAt: true,
          pipelineStage: { select: { id: true, name: true, color: true, category: true } },
          category: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.activity.findMany({
        where: { organizationId, contactId, deletedAt: null },
        orderBy: { occurredAt: 'desc' },
        take: 100,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          occurredAt: true,
          metadata: true,
          requestId: true,
        },
      }),
      this.prisma.sale.findMany({
        where: { organizationId, contactId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          status: true,
          total: true,
          currency: true,
          createdAt: true,
          soldAt: true,
          items: {
            where: { deletedAt: null },
            select: {
              id: true,
              productNameSnapshot: true,
              quantity: true,
              total: true,
              currency: true,
            },
          },
          payments: {
            where: { deletedAt: null },
            select: {
              id: true,
              status: true,
              grossAmount: true,
              refundedAmount: true,
              currency: true,
              paymentDate: true,
            },
          },
        },
      }),
      this.prisma.subscription.findMany({
        where: { organizationId, contactId, deletedAt: null },
        orderBy: { nextBillingAt: 'asc' },
        select: {
          id: true,
          status: true,
          productNameSnapshot: true,
          amount: true,
          currency: true,
          startsAt: true,
          currentPeriodEnd: true,
          nextBillingAt: true,
          renewals: {
            where: { deletedAt: null },
            orderBy: { dueAt: 'desc' },
            take: 50,
            select: {
              id: true,
              status: true,
              workflowStatus: true,
              amount: true,
              currency: true,
              dueAt: true,
              paidAt: true,
              periodStart: true,
              periodEnd: true,
            },
          },
          fulfillments: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              status: true,
              mode: true,
              provider: { select: { id: true, name: true } },
              createdAt: true,
              completedAt: true,
            },
          },
          activations: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              status: true,
              activatedAt: true,
              expiresAt: true,
              provider: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.whatsAppConversation.findMany({
        where: { organizationId, contactId, deletedAt: null },
        orderBy: { lastMessageAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          lastMessageAt: true,
          unreadCount: true,
          windowExpiresAt: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              direction: true,
              type: true,
              text: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);
    const opportunityIds = opportunities.map((item) => item.id);
    const followUps = opportunityIds.length
      ? await this.prisma.followUp.findMany({
          where: { organizationId, opportunityId: { in: opportunityIds }, deletedAt: null },
          orderBy: { dueAt: 'asc' },
          take: 100,
          select: {
            id: true,
            opportunityId: true,
            title: true,
            dueAt: true,
            priority: true,
            status: true,
            note: true,
            responsible: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      : [];
    const subscriptionIds = subscriptions.map((item) => item.id);
    const fulfillmentIds = subscriptions.flatMap((item) => item.fulfillments.map((row) => row.id));
    const activationIds = subscriptions.flatMap((item) => item.activations.map((row) => row.id));
    const emptyId = '00000000-0000-0000-0000-000000000000';
    const credentials = await this.prisma.credentialRecord.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { subscriptionId: { in: subscriptionIds.length ? subscriptionIds : [emptyId] } },
          { fulfillmentId: { in: fulfillmentIds.length ? fulfillmentIds : [emptyId] } },
          { activationId: { in: activationIds.length ? activationIds : [emptyId] } },
        ],
      },
      select: {
        id: true,
        credentialKey: true,
        status: true,
        expiration: true,
        instructions: true,
        revealCount: true,
      },
      take: 100,
    });
    const confirmedSales = sales.filter(
      (sale) => sale.status === 'CONFIRMED' || sale.status === 'FULFILLED',
    );
    const ltv = new Map<string, number>();
    let pendingBalance = 0;
    for (const sale of sales) {
      const confirmed = sale.payments
        .filter((payment) => payment.status === 'CONFIRMED')
        .reduce(
          (sum, payment) =>
            sum + numberValue(payment.grossAmount) - numberValue(payment.refundedAmount),
          0,
        );
      pendingBalance += Math.max(numberValue(sale.total) - confirmed, 0);
      if (confirmedSales.includes(sale))
        ltv.set(sale.currency, (ltv.get(sale.currency) ?? 0) + numberValue(sale.total));
    }
    const activeSubscriptions = subscriptions.filter((item) => item.status === 'ACTIVE');
    const mrr = new Map<string, number>();
    for (const subscription of activeSubscriptions)
      mrr.set(
        subscription.currency,
        (mrr.get(subscription.currency) ?? 0) + numberValue(subscription.amount),
      );
    const timeline = [
      ...activities.map((item) => ({ ...item, kind: 'activity' })),
      ...conversations.flatMap((conversation) =>
        conversation.messages.map((message) => ({
          ...message,
          conversationId: conversation.id,
          kind: 'message',
          occurredAt: message.createdAt,
        })),
      ),
    ]
      .sort(
        (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
      )
      .slice(0, 150);
    const allRenewals = subscriptions.flatMap((subscription) => subscription.renewals);
    const nextRenewal = allRenewals
      .filter((renewal) => renewal.status !== 'PAID' && renewal.status !== 'CANCELLED')
      .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())[0];
    return {
      contact: { ...contact, tags: contact.tags.map((item) => item.tag) },
      opportunities,
      activities,
      followUps,
      conversations,
      sales,
      payments: sales.flatMap((sale) => sale.payments),
      subscriptions,
      renewals: allRenewals,
      products: subscriptions.map((item) => ({
        name: item.productNameSnapshot,
        status: item.status,
        active: item.status === 'ACTIVE',
      })),
      fulfillments: subscriptions.flatMap((item) => item.fulfillments),
      activations: subscriptions.flatMap((item) => item.activations),
      credentials: credentials.map((item) => ({ ...item, masked: true })),
      timeline,
      metrics: {
        mrr: [...mrr.entries()].map(([currency, amount]) => ({
          currency,
          amount: amount.toFixed(2),
        })),
        ltv: [...ltv.entries()].map(([currency, amount]) => ({
          currency,
          amount: amount.toFixed(2),
        })),
        averageTicket: confirmedSales.length
          ? (
              confirmedSales.reduce((sum, sale) => sum + numberValue(sale.total), 0) /
              confirmedSales.length
            ).toFixed(2)
          : '0.00',
        timeAsCustomerDays: Math.max(
          0,
          Math.floor((Date.now() - contact.createdAt.getTime()) / 86_400_000),
        ),
        timeToFirstPurchaseDays: confirmedSales[0]
          ? Math.max(
              0,
              Math.floor(
                (new Date(confirmedSales[0].soldAt ?? confirmedSales[0].createdAt).getTime() -
                  contact.createdAt.getTime()) /
                  86_400_000,
              ),
            )
          : null,
        lastContactAt: timeline[0]?.occurredAt ?? null,
        nextRenewalAt: nextRenewal?.dueAt ?? null,
        pendingBalance: pendingBalance.toFixed(2),
      },
    };
  }

  async globalSearch(
    query: GlobalSearchQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const term = query.search.trim();
    if (term.length < 2) return { query: term, results: [] };
    const contains = { contains: term, mode: 'insensitive' as const };
    const uuidTerm =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(term)
        ? term
        : undefined;
    const org = user.organizationId;
    const limit = query.limit;
    const [
      contacts,
      opportunities,
      sales,
      payments,
      products,
      providers,
      renewals,
      fulfillments,
      activations,
      campaigns,
      messages,
      credentials,
    ] = await Promise.all([
      this.prisma.contact.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [
            { firstName: contains },
            { lastName: contains },
            { email: contains },
            { phone: contains },
            { phoneNormalized: contains },
          ],
        },
        take: limit,
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      }),
      this.prisma.opportunity.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [
            { title: contains },
            { contact: { firstName: contains } },
            { contact: { lastName: contains } },
          ],
        },
        take: limit,
        select: {
          id: true,
          title: true,
          pipelineStage: { select: { name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.sale.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [
            { note: contains },
            { contact: { firstName: contains } },
            { contact: { lastName: contains } },
            { items: { some: { productNameSnapshot: contains } } },
            { items: { some: { skuSnapshot: contains } } },
            ...(uuidTerm ? [{ id: uuidTerm }] : []),
          ],
        },
        take: limit,
        select: {
          id: true,
          status: true,
          total: true,
          currency: true,
          contact: { select: { firstName: true, lastName: true } },
          items: { select: { productNameSnapshot: true, skuSnapshot: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [{ reference: contains }],
        },
        take: limit,
        select: { id: true, status: true, grossAmount: true, currency: true, reference: true },
      }),
      this.prisma.product.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [{ name: contains }, { slug: contains }, { sku: contains }],
        },
        take: limit,
        select: { id: true, name: true, slug: true, sku: true },
      }),
      this.prisma.provider.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [{ name: contains }, { slug: contains }],
        },
        take: limit,
        select: { id: true, name: true, status: true },
      }),
      this.prisma.renewal.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [{ productNameSnapshot: contains }],
        },
        take: limit,
        select: {
          id: true,
          status: true,
          workflowStatus: true,
          productNameSnapshot: true,
          dueAt: true,
        },
      }),
      this.prisma.fulfillment.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [{ identityKey: contains }, { failureReason: contains }],
        },
        take: limit,
        select: { id: true, status: true, identityKey: true },
      }),
      this.prisma.activation.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [{ externalReference: contains }],
        },
        take: limit,
        select: { id: true, status: true, externalReference: true },
      }),
      this.prisma.campaign.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          OR: [{ name: contains }, { source: contains }, { platform: contains }],
        },
        take: limit,
        select: { id: true, name: true, source: true, platform: true },
      }),
      this.prisma.whatsAppMessage.findMany({
        where: { organizationId: org, deletedAt: null, text: contains },
        take: limit,
        select: { id: true, text: true, createdAt: true, conversationId: true },
      }),
      this.prisma.credentialRecord.findMany({
        where: { organizationId: org, deletedAt: null, credentialKey: contains },
        take: limit,
        select: { id: true, credentialKey: true, status: true },
      }),
    ]);
    const results = [
      ...contacts.map((item) => ({
        type: 'contact',
        id: item.id,
        label: nameOf(item.firstName, item.lastName, item.email ?? item.phone ?? 'Contacto'),
        detail: item.email ?? item.phone,
        href: `/contacts?contactId=${item.id}`,
      })),
      ...opportunities.map((item) => ({
        type: 'opportunity',
        id: item.id,
        label: item.title,
        detail: item.pipelineStage.name,
        href: `/pipeline?opportunityId=${item.id}`,
      })),
      ...sales.map((item) => ({
        type: 'sale',
        id: item.id,
        label: `${item.currency} ${item.total.toFixed(2)}`,
        detail: item.status,
        href: `/sales?saleId=${item.id}`,
      })),
      ...payments.map((item) => ({
        type: 'payment',
        id: item.id,
        label: `${item.currency} ${item.grossAmount.toFixed(2)}`,
        detail: item.reference ?? item.status,
        href: `/sales`,
      })),
      ...products.map((item) => ({
        type: 'product',
        id: item.id,
        label: item.name,
        detail: item.sku ?? item.slug,
        href: `/catalog?productId=${item.id}`,
      })),
      ...providers.map((item) => ({
        type: 'provider',
        id: item.id,
        label: item.name,
        detail: item.status,
        href: `/providers?providerId=${item.id}`,
      })),
      ...renewals.map((item) => ({
        type: 'renewal',
        id: item.id,
        label: item.productNameSnapshot,
        detail: `${item.workflowStatus} · ${item.dueAt.toISOString().slice(0, 10)}`,
        href: `/renewals/customers/${item.id}`,
      })),
      ...fulfillments.map((item) => ({
        type: 'fulfillment',
        id: item.id,
        label: item.identityKey,
        detail: item.status,
        href: `/fulfillment?fulfillmentId=${item.id}`,
      })),
      ...activations.map((item) => ({
        type: 'activation',
        id: item.id,
        label: item.externalReference ?? item.id.slice(0, 8),
        detail: item.status,
        href: `/activations?activationId=${item.id}`,
      })),
      ...campaigns.map((item) => ({
        type: 'campaign',
        id: item.id,
        label: item.name,
        detail: `${item.source} · ${item.platform}`,
        href: `/business-intelligence/campaigns?campaignId=${item.id}`,
      })),
      ...messages.map((item) => ({
        type: 'message',
        id: item.id,
        label: item.text ?? 'Mensaje',
        detail: item.createdAt,
        href: `/whatsapp?conversationId=${item.conversationId}`,
      })),
      ...credentials.map((item) => ({
        type: 'credential',
        id: item.id,
        label: item.credentialKey,
        detail: `${item.status} · enmascarada`,
        href: `/credentials?credentialId=${item.id}`,
        masked: true,
      })),
    ];
    return { query: term, results: results.slice(0, 80) };
  }

  async operationalAgenda(user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const org = user.organizationId;
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const [
      followUps,
      promises,
      renewals,
      pendingSales,
      pendingPayments,
      fulfillments,
      activations,
      trials,
      inactive,
    ] = await Promise.all([
      this.prisma.followUp.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          ...(user.roleName === 'Sales' ? { userId: user.userId } : {}),
          status: { in: ['PENDING', 'RESCHEDULED'] },
          dueAt: { lt: tomorrow },
        },
        orderBy: { dueAt: 'asc' },
        take: 100,
        select: {
          id: true,
          title: true,
          dueAt: true,
          priority: true,
          status: true,
          opportunity: {
            select: {
              id: true,
              title: true,
              contact: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.renewal.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          workflowStatus: 'PAYMENT_PROMISE',
          status: { not: 'PAID' },
        },
        orderBy: { dueAt: 'asc' },
        take: 100,
        select: {
          id: true,
          productNameSnapshot: true,
          amount: true,
          currency: true,
          dueAt: true,
          subscription: {
            select: { contact: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.renewal.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          status: { notIn: ['PAID', 'CANCELLED'] },
          dueAt: { lte: new Date(now.getTime() + 30 * 86_400_000) },
        },
        orderBy: { dueAt: 'asc' },
        take: 100,
        select: {
          id: true,
          workflowStatus: true,
          productNameSnapshot: true,
          amount: true,
          currency: true,
          dueAt: true,
          subscription: {
            select: { contact: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.sale.findMany({
        where: { organizationId: org, deletedAt: null, status: { in: ['DRAFT', 'PENDING'] } },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: {
          id: true,
          createdAt: true,
          status: true,
          total: true,
          currency: true,
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { organizationId: org, deletedAt: null, status: 'PENDING' },
        orderBy: { paymentDate: 'asc' },
        take: 100,
        select: {
          id: true,
          grossAmount: true,
          currency: true,
          paymentDate: true,
          sale: {
            select: {
              id: true,
              contact: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.fulfillment.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          status: { in: ['PENDING', 'ASSIGNED', 'PROCESSING', 'FAILED'] },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: {
          id: true,
          status: true,
          identityKey: true,
          createdAt: true,
          sale: { select: { contact: { select: { id: true, firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.activation.findMany({
        where: { organizationId: org, deletedAt: null, status: { in: ['PENDING', 'FAILED'] } },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: {
          id: true,
          status: true,
          createdAt: true,
          fulfillment: {
            select: {
              sale: {
                select: { contact: { select: { id: true, firstName: true, lastName: true } } },
              },
            },
          },
        },
      }),
      this.prisma.trial.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          status: { in: ['REQUESTED', 'APPROVED', 'ACTIVE'] },
          endsAt: { lte: new Date(now.getTime() + 7 * 86_400_000) },
        },
        orderBy: { endsAt: 'asc' },
        take: 100,
        select: {
          id: true,
          status: true,
          endsAt: true,
          product: { select: { name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.contact.findMany({
        where: {
          organizationId: org,
          deletedAt: null,
          isCustomer: true,
          lastActivityAt: { lt: new Date(now.getTime() - 30 * 86_400_000) },
        },
        orderBy: { lastActivityAt: 'asc' },
        take: 100,
        select: { id: true, firstName: true, lastName: true, lastActivityAt: true },
      }),
    ]);
    const item = (id: string, title: string, dueAt: Date | null, detail: string, href: string) => ({
      id,
      title,
      dueAt,
      detail,
      href,
    });
    return {
      generatedAt: now,
      sections: {
        followUps: followUps.map((row) =>
          item(
            row.id,
            row.title,
            row.dueAt,
            `${nameOf(row.opportunity.contact.firstName, row.opportunity.contact.lastName)} · ${row.priority}`,
            `/pipeline?opportunityId=${row.opportunity.id}`,
          ),
        ),
        paymentPromises: promises.map((row) =>
          item(
            row.id,
            row.productNameSnapshot,
            row.dueAt,
            `${nameOf(row.subscription.contact.firstName, row.subscription.contact.lastName)} · ${row.currency} ${row.amount.toFixed(2)}`,
            `/renewals/customers/${row.subscription.contact.id}`,
          ),
        ),
        renewals: renewals.map((row) =>
          item(
            row.id,
            row.productNameSnapshot,
            row.dueAt,
            `${nameOf(row.subscription.contact.firstName, row.subscription.contact.lastName)} · ${row.workflowStatus}`,
            `/renewals/customers/${row.subscription.contact.id}`,
          ),
        ),
        pendingSales: pendingSales.map((row) =>
          item(
            row.id,
            `Venta ${row.id.slice(0, 8)}`,
            row.createdAt,
            `${nameOf(row.contact.firstName, row.contact.lastName)} · ${row.currency} ${row.total.toFixed(2)}`,
            `/sales?saleId=${row.id}`,
          ),
        ),
        pendingPayments: pendingPayments.map((row) =>
          item(
            row.id,
            `Pago ${row.id.slice(0, 8)}`,
            row.paymentDate,
            `${nameOf(row.sale.contact.firstName, row.sale.contact.lastName)} · ${row.currency} ${row.grossAmount.toFixed(2)}`,
            `/sales?saleId=${row.sale.id}`,
          ),
        ),
        fulfillments: fulfillments.map((row) =>
          item(
            row.id,
            row.identityKey,
            row.createdAt,
            `${nameOf(row.sale.contact.firstName, row.sale.contact.lastName)} · ${row.status}`,
            `/fulfillment?fulfillmentId=${row.id}`,
          ),
        ),
        activations: activations.map((row) =>
          item(
            row.id,
            `Activación ${row.id.slice(0, 8)}`,
            row.createdAt,
            `${nameOf(row.fulfillment.sale.contact.firstName, row.fulfillment.sale.contact.lastName)} · ${row.status}`,
            `/activations?activationId=${row.id}`,
          ),
        ),
        trials: trials.map((row) =>
          item(
            row.id,
            row.product.name,
            row.endsAt,
            `${nameOf(row.contact.firstName, row.contact.lastName)} · ${row.status}`,
            `/trials?trialId=${row.id}`,
          ),
        ),
        inactiveCustomers: inactive.map((row) =>
          item(
            row.id,
            nameOf(row.firstName, row.lastName),
            row.lastActivityAt,
            'Sin actividad en 30 días',
            `/customers/${row.id}`,
          ),
        ),
      },
    };
  }

  async pipeline(
    query: PipelineIntelligenceQueryDto,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    const now = new Date();
    const ageCutoff =
      query.minAgeDays !== undefined
        ? new Date(now.getTime() - query.minAgeDays * 86_400_000)
        : undefined;
    const stalledCutoff = new Date(now.getTime() - query.stalledDays * 86_400_000);
    const where: Prisma.OpportunityWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      archivedAt: null,
      ...(query.stageId ? { pipelineStageId: query.stageId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.country
        ? { contact: { country: query.country.toUpperCase(), deletedAt: null } }
        : { contact: { deletedAt: null } }),
      ...(ageCutoff ? { createdAt: { lte: ageCutoff } } : {}),
      ...(query.noActivity
        ? {
            contact: {
              deletedAt: null,
              OR: [{ lastActivityAt: null }, { lastActivityAt: { lte: stalledCutoff } }],
            },
          }
        : {}),
      ...(query.overdueFollowUp
        ? {
            followUps: {
              some: {
                deletedAt: null,
                status: { in: ['PENDING', 'RESCHEDULED'] },
                dueAt: { lt: now },
              },
            },
          }
        : {}),
      ...(query.stalled ? { lastStageChangedAt: { lte: stalledCutoff } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          title: true,
          expectedAmount: true,
          currency: true,
          probability: true,
          priority: true,
          createdAt: true,
          lastStageChangedAt: true,
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              country: true,
              lastActivityAt: true,
            },
          },
          pipelineStage: { select: { id: true, name: true, color: true, category: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
          product: { select: { id: true, name: true } },
          campaign: { select: { id: true, name: true } },
          followUps: {
            where: { deletedAt: null, status: { in: ['PENDING', 'RESCHEDULED'] } },
            orderBy: { dueAt: 'asc' },
            take: 1,
            select: { id: true, dueAt: true, status: true },
          },
        },
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        expectedAmount: row.expectedAmount?.toFixed(2) ?? null,
        ageDays: Math.floor((now.getTime() - row.createdAt.getTime()) / 86_400_000),
        daysInStage: row.lastStageChangedAt
          ? Math.floor((now.getTime() - row.lastStageChangedAt.getTime()) / 86_400_000)
          : null,
        weightedValue: row.expectedAmount
          ? row.expectedAmount.mul(row.probability).div(100).toFixed(2)
          : null,
        stalled: !row.lastStageChangedAt || row.lastStageChangedAt <= stalledCutoff,
        nextFollowUp: row.followUps[0] ?? null,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private range(query: IntelligenceQueryDto): { from: Date; to: Date } {
    const to = dateValue(query.to, true);
    const from = query.from ? dateValue(query.from) : new Date(to.getTime() - 30 * 86_400_000);
    if (from > to)
      throw new HttpException(
        {
          statusCode: 400,
          code: 'INTELLIGENCE_INVALID_RANGE',
          message: 'El rango de fechas no es válido.',
        },
        HttpStatus.BAD_REQUEST,
      );
    return { from, to };
  }

  private dayStart(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private async raw<T>(query: Prisma.Sql): Promise<T[]> {
    return this.prisma.$queryRaw<T[]>(query);
  }

  private salesFilters(org: string, query: IntelligenceQueryDto, alias = 's'): Prisma.Sql[] {
    const parts: Prisma.Sql[] = [
      Prisma.sql`${Prisma.raw(`"${alias}"."organizationId"`)} = ${org}::uuid`,
      Prisma.sql`${Prisma.raw(`"${alias}"."deletedAt"`)} IS NULL`,
      Prisma.sql`${Prisma.raw(`"${alias}"."status"`)} IN ('CONFIRMED', 'FULFILLED')`,
    ];
    if (query.currency)
      parts.push(
        Prisma.sql`${Prisma.raw(`"${alias}"."currency"`)} = ${query.currency.toUpperCase()}`,
      );
    if (query.userId)
      parts.push(Prisma.sql`${Prisma.raw(`"${alias}"."userId"`)} = ${query.userId}::uuid`);
    if (query.country)
      parts.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Contact" cf WHERE cf."organizationId" = ${org}::uuid AND cf."id" = ${Prisma.raw(`"${alias}"."contactId"`)} AND cf."country" = ${query.country.toUpperCase()})`,
      );
    if (query.productId)
      parts.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "SaleItem" si WHERE si."organizationId" = ${org}::uuid AND si."saleId" = ${Prisma.raw(`"${alias}"."id"`)} AND si."productId" = ${query.productId}::uuid AND si."deletedAt" IS NULL)`,
      );
    if (query.campaignId)
      parts.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Opportunity" so WHERE so."organizationId" = ${org}::uuid AND so."id" = ${Prisma.raw(`"${alias}"."opportunityId"`)} AND so."campaignId" = ${query.campaignId}::uuid AND so."deletedAt" IS NULL)`,
      );
    if (query.providerId)
      parts.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "Fulfillment" sf WHERE sf."organizationId" = ${org}::uuid AND sf."saleId" = ${Prisma.raw(`"${alias}"."id"`)} AND sf."providerId" = ${query.providerId}::uuid AND sf."deletedAt" IS NULL)`,
      );
    return parts;
  }

  private async salesMoney(
    org: string,
    from: Date,
    to: Date,
    query: IntelligenceQueryDto,
  ): Promise<MoneyRow[]> {
    const parts = [
      ...this.salesFilters(org, query),
      Prisma.sql`COALESCE(s."soldAt", s."createdAt") >= ${from}`,
      Prisma.sql`COALESCE(s."soldAt", s."createdAt") < ${to}`,
    ];
    return this.raw<MoneyRow>(
      Prisma.sql`SELECT s."currency", SUM(s."total")::numeric AS amount, COUNT(*)::bigint AS count FROM "Sale" s WHERE ${Prisma.join(parts, ' AND ')} GROUP BY s."currency" ORDER BY s."currency"`,
    );
  }

  private async paymentMoney(
    org: string,
    from: Date,
    to: Date,
    query: IntelligenceQueryDto,
  ): Promise<MoneyRow[]> {
    const saleParts = this.salesFilters(org, query);
    return this.raw<MoneyRow>(
      Prisma.sql`SELECT p."currency", SUM(p."netAmount" - p."refundedAmount")::numeric AS amount, COUNT(*)::bigint AS count FROM "Payment" p JOIN "Sale" s ON s."organizationId" = p."organizationId" AND s."id" = p."saleId" WHERE ${Prisma.join(
        [
          ...saleParts,
          Prisma.sql`p."organizationId" = ${org}::uuid`,
          Prisma.sql`p."deletedAt" IS NULL`,
          Prisma.sql`p."status" IN ('CONFIRMED', 'REFUNDED')`,
          Prisma.sql`p."paymentDate" >= ${from}`,
          Prisma.sql`p."paymentDate" < ${to}`,
        ],
        ' AND ',
      )} GROUP BY p."currency" ORDER BY p."currency"`,
    );
  }

  private async paymentMethods(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const saleParts = this.salesFilters(org, query);
    const rows = await this.raw<{
      method: string;
      currency: string;
      amount: string | number | Prisma.Decimal;
      count: string | bigint;
    }>(
      Prisma.sql`SELECT p."method", p."currency", SUM(p."netAmount" - p."refundedAmount")::numeric AS amount, COUNT(*)::bigint AS count FROM "Payment" p JOIN "Sale" s ON s."organizationId" = p."organizationId" AND s."id" = p."saleId" WHERE ${Prisma.join(
        [
          ...saleParts,
          Prisma.sql`p."organizationId" = ${org}::uuid`,
          Prisma.sql`p."deletedAt" IS NULL`,
          Prisma.sql`p."status" IN ('CONFIRMED', 'REFUNDED')`,
          Prisma.sql`p."paymentDate" >= ${range.from}`,
          Prisma.sql`p."paymentDate" < ${range.to}`,
        ],
        ' AND ',
      )} GROUP BY p."method", p."currency" ORDER BY amount DESC`,
    );
    return rows.map((row) => ({
      method: row.method,
      currency: row.currency,
      amount: decimalValue(row.amount),
      count: numberValue(row.count),
    }));
  }

  private async mrr(org: string, query: IntelligenceQueryDto): Promise<MoneyRow[]> {
    return this.raw<MoneyRow>(
      Prisma.sql`SELECT s."currency", SUM(s."amount")::numeric AS amount, COUNT(*)::bigint AS count FROM "Subscription" s JOIN "Contact" c ON c."organizationId" = s."organizationId" AND c."id" = s."contactId" WHERE s."organizationId" = ${org}::uuid AND s."deletedAt" IS NULL AND s."status" = 'ACTIVE' ${query.currency ? Prisma.sql`AND s."currency" = ${query.currency.toUpperCase()}` : Prisma.empty} ${query.country ? Prisma.sql`AND c."country" = ${query.country.toUpperCase()}` : Prisma.empty} ${query.userId ? Prisma.sql`AND s."userId" = ${query.userId}::uuid` : Prisma.empty} GROUP BY s."currency" ORDER BY s."currency"`,
    );
  }

  private async lostCustomers(org: string, from: Date, to: Date): Promise<number> {
    const rows = await this.raw<{ count: string | bigint }>(
      Prisma.sql`SELECT COUNT(DISTINCT s."contactId")::bigint AS count FROM "Renewal" r JOIN "Subscription" s ON s."organizationId" = r."organizationId" AND s."id" = r."subscriptionId" WHERE r."organizationId" = ${org}::uuid AND r."deletedAt" IS NULL AND r."workflowStatus" IN ('LOST', 'NOT_RENEWED') AND r."dueAt" >= ${from} AND r."dueAt" < ${to}`,
    );
    return numberValue(rows[0]?.count);
  }

  private async pendingBalance(
    org: string,
    query: IntelligenceQueryDto,
  ): Promise<Array<{ currency: string; amount: string }>> {
    const filters = this.salesFilters(org, query);
    const rows = await this.raw<{ currency: string; amount: string | number | Prisma.Decimal }>(
      Prisma.sql`SELECT s."currency", SUM(GREATEST(s."total" - COALESCE(p."paid", 0), 0))::numeric AS amount FROM "Sale" s LEFT JOIN (SELECT "organizationId", "saleId", SUM("grossAmount" - "refundedAmount") FILTER (WHERE "status" = 'CONFIRMED') AS paid FROM "Payment" WHERE "organizationId" = ${org}::uuid AND "deletedAt" IS NULL GROUP BY "organizationId", "saleId") p ON p."organizationId" = s."organizationId" AND p."saleId" = s."id" WHERE ${Prisma.join(filters, ' AND ')} GROUP BY s."currency" ORDER BY s."currency"`,
    );
    return rows.map((row) => ({ currency: row.currency, amount: decimalValue(row.amount) }));
  }

  private async revenueDaily(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const filters = [
      ...this.salesFilters(org, query),
      Prisma.sql`COALESCE(s."soldAt", s."createdAt") >= ${range.from}`,
      Prisma.sql`COALESCE(s."soldAt", s."createdAt") < ${range.to}`,
    ];
    const rows = await this.raw<TrendRow>(
      Prisma.sql`SELECT DATE_TRUNC('day', COALESCE(s."soldAt", s."createdAt"))::date AS bucket, s."currency", SUM(s."total")::numeric AS amount, COUNT(*)::bigint AS count FROM "Sale" s WHERE ${Prisma.join(filters, ' AND ')} GROUP BY bucket, s."currency" ORDER BY bucket`,
    );
    return rows.map((row) => ({
      date: isoBucket(row.bucket),
      currency: row.currency,
      revenue: decimalValue(row.amount),
      sales: numberValue(row.count),
    }));
  }

  private async revenueMonthly(
    org: string,
    to: Date,
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const from = addMonths(monthStart(to), -11);
    const filters = [
      ...this.salesFilters(org, query),
      Prisma.sql`COALESCE(s."soldAt", s."createdAt") >= ${from}`,
      Prisma.sql`COALESCE(s."soldAt", s."createdAt") < ${addMonths(monthStart(to), 1)}`,
    ];
    const rows = await this.raw<TrendRow>(
      Prisma.sql`SELECT DATE_TRUNC('month', COALESCE(s."soldAt", s."createdAt"))::date AS bucket, s."currency", SUM(s."total")::numeric AS amount, COUNT(*)::bigint AS count FROM "Sale" s WHERE ${Prisma.join(filters, ' AND ')} GROUP BY bucket, s."currency" ORDER BY bucket`,
    );
    return rows.map((row) => ({
      month: String(row.bucket).slice(0, 7),
      currency: row.currency,
      revenue: decimalValue(row.amount),
      sales: numberValue(row.count),
    }));
  }

  private async salesByCountry(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.raw<LabelRow & { currency: string }>(
      Prisma.sql`SELECT COALESCE(NULLIF(c."country", ''), 'Sin país') AS label, s."currency", SUM(s."total")::numeric AS amount, COUNT(*)::bigint AS count FROM "Sale" s JOIN "Contact" c ON c."organizationId" = s."organizationId" AND c."id" = s."contactId" WHERE s."organizationId" = ${org}::uuid AND s."deletedAt" IS NULL AND s."status" IN ('CONFIRMED', 'FULFILLED') AND COALESCE(s."soldAt", s."createdAt") >= ${range.from} AND COALESCE(s."soldAt", s."createdAt") < ${range.to} ${query.country ? Prisma.sql`AND c."country" = ${query.country.toUpperCase()}` : Prisma.empty} GROUP BY label, s."currency" ORDER BY amount DESC LIMIT 100`,
    );
    return rows.map((row) => ({
      country: row.label,
      currency: row.currency,
      revenue: decimalValue(row.amount),
      sales: numberValue(row.count),
    }));
  }

  private async salesByProduct(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.raw<LabelRow & { currency: string }>(
      Prisma.sql`SELECT si."productNameSnapshot" AS label, si."currency", SUM(si."total")::numeric AS amount, SUM(si."quantity")::numeric AS units, COUNT(DISTINCT si."saleId")::bigint AS count FROM "SaleItem" si JOIN "Sale" s ON s."organizationId" = si."organizationId" AND s."id" = si."saleId" WHERE si."organizationId" = ${org}::uuid AND si."deletedAt" IS NULL AND s."deletedAt" IS NULL AND s."status" IN ('CONFIRMED', 'FULFILLED') AND COALESCE(s."soldAt", s."createdAt") >= ${range.from} AND COALESCE(s."soldAt", s."createdAt") < ${range.to} ${query.productId ? Prisma.sql`AND si."productId" = ${query.productId}::uuid` : Prisma.empty} GROUP BY label, si."currency" ORDER BY amount DESC LIMIT 100`,
    );
    return rows.map((row) => ({
      product: row.label,
      currency: row.currency,
      revenue: decimalValue(row.amount),
      units: decimalValue(row.units),
      sales: numberValue(row.count),
    }));
  }

  private async newCustomersWeekly(org: string, to: Date): Promise<Array<Record<string, unknown>>> {
    const from = new Date(to.getTime() - 56 * 86_400_000);
    const rows = await this.raw<{ bucket: Date | string; count: string | bigint }>(
      Prisma.sql`SELECT DATE_TRUNC('week', c."createdAt")::date AS bucket, COUNT(*)::bigint AS count FROM "Contact" c WHERE c."organizationId" = ${org}::uuid AND c."deletedAt" IS NULL AND c."createdAt" >= ${from} AND c."createdAt" <= ${to} GROUP BY bucket ORDER BY bucket`,
    );
    return rows.map((row) => ({ week: isoBucket(row.bucket), customers: numberValue(row.count) }));
  }

  private async funnel(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.raw<{ name: string; category: string; count: string | bigint }>(
      Prisma.sql`SELECT ps."name", ps."category", COUNT(*)::bigint AS count FROM "Opportunity" o JOIN "PipelineStage" ps ON ps."organizationId" = o."organizationId" AND ps."id" = o."pipelineStageId" WHERE o."organizationId" = ${org}::uuid AND o."deletedAt" IS NULL AND o."createdAt" >= ${range.from} AND o."createdAt" < ${range.to} ${query.country ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Contact" c WHERE c."organizationId" = o."organizationId" AND c."id" = o."contactId" AND c."country" = ${query.country.toUpperCase()})` : Prisma.empty} GROUP BY ps."name", ps."category", ps."order" ORDER BY ps."order"`,
    );
    return rows.map((row) => ({
      stage: row.name,
      category: row.category,
      count: numberValue(row.count),
    }));
  }

  private async renewalsTrend(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.raw<{
      bucket: Date | string;
      status: string;
      count: string | bigint;
      amount: string | number | Prisma.Decimal;
      currency: string;
    }>(
      Prisma.sql`SELECT DATE_TRUNC('month', r."dueAt")::date AS bucket, r."status", r."currency", COUNT(*)::bigint AS count, SUM(r."amount")::numeric AS amount FROM "Renewal" r WHERE r."organizationId" = ${org}::uuid AND r."deletedAt" IS NULL AND r."dueAt" >= ${range.from} AND r."dueAt" < ${range.to} ${query.currency ? Prisma.sql`AND r."currency" = ${query.currency.toUpperCase()}` : Prisma.empty} GROUP BY bucket, r."status", r."currency" ORDER BY bucket`,
    );
    return rows.map((row) => ({
      month: String(row.bucket).slice(0, 7),
      status: row.status,
      currency: row.currency,
      count: numberValue(row.count),
      amount: decimalValue(row.amount),
    }));
  }

  private async mrrHistory(
    org: string,
    to: Date,
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const from = addMonths(monthStart(to), -11);
    const rows = await this.raw<{
      bucket: Date | string;
      currency: string;
      amount: string | number | Prisma.Decimal;
    }>(
      Prisma.sql`SELECT DATE_TRUNC('month', COALESCE(s."currentPeriodStart", s."startsAt"))::date AS bucket, s."currency", SUM(s."amount")::numeric AS amount FROM "Subscription" s JOIN "Contact" c ON c."organizationId" = s."organizationId" AND c."id" = s."contactId" WHERE s."organizationId" = ${org}::uuid AND s."deletedAt" IS NULL AND s."status" = 'ACTIVE' AND COALESCE(s."currentPeriodStart", s."startsAt") >= ${from} ${query.currency ? Prisma.sql`AND s."currency" = ${query.currency.toUpperCase()}` : Prisma.empty} GROUP BY bucket, s."currency" ORDER BY bucket`,
    );
    return rows.map((row) => ({
      month: String(row.bucket).slice(0, 7),
      currency: row.currency,
      mrr: decimalValue(row.amount),
    }));
  }

  private async generalConversion(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<number> {
    const rows = await this.raw<{ total: string | bigint; won: string | bigint }>(
      Prisma.sql`SELECT COUNT(*)::bigint AS total, COUNT(*) FILTER (WHERE ps."category" = 'WON')::bigint AS won FROM "Opportunity" o JOIN "PipelineStage" ps ON ps."organizationId" = o."organizationId" AND ps."id" = o."pipelineStageId" WHERE o."organizationId" = ${org}::uuid AND o."deletedAt" IS NULL AND o."createdAt" >= ${range.from} AND o."createdAt" < ${range.to} ${query.productId ? Prisma.sql`AND o."productId" = ${query.productId}::uuid` : Prisma.empty}`,
    );
    return rows[0] && numberValue(rows[0].total) > 0
      ? Number(((numberValue(rows[0].won) / numberValue(rows[0].total)) * 100).toFixed(2))
      : 0;
  }

  private async summary(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Record<string, unknown>> {
    const [countries, products, campaigns, sellers, providers, renewals] = await Promise.all([
      this.countries(org, range, query),
      this.products(org, range, query),
      this.campaigns(org, range, query),
      this.sellers(org, range, query),
      this.providers(org, range, query),
      this.renewalBreakdown(org, range, query),
    ]);
    return { countries, products, campaigns, sellers, providers, renewals };
  }

  private async countries(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    void query;
    const [leads, opportunities, sales, subscriptions] = await Promise.all([
      this.raw<LabelRow>(
        Prisma.sql`SELECT COALESCE(NULLIF("country", ''), 'Sin país') AS label, COUNT(*)::bigint AS count FROM "Contact" WHERE "organizationId" = ${org}::uuid AND "deletedAt" IS NULL AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to} GROUP BY label ORDER BY count DESC`,
      ),
      this.raw<LabelRow>(
        Prisma.sql`SELECT COALESCE(NULLIF(c."country", ''), 'Sin país') AS label, COUNT(*)::bigint AS count FROM "Opportunity" o JOIN "Contact" c ON c."organizationId" = o."organizationId" AND c."id" = o."contactId" WHERE o."organizationId" = ${org}::uuid AND o."deletedAt" IS NULL AND o."createdAt" >= ${range.from} AND o."createdAt" < ${range.to} GROUP BY label`,
      ),
      this.raw<LabelRow & { currency: string }>(
        Prisma.sql`SELECT COALESCE(NULLIF(c."country", ''), 'Sin país') AS label, s."currency", SUM(s."total")::numeric AS amount, COUNT(*)::bigint AS count FROM "Sale" s JOIN "Contact" c ON c."organizationId" = s."organizationId" AND c."id" = s."contactId" WHERE s."organizationId" = ${org}::uuid AND s."deletedAt" IS NULL AND s."status" IN ('CONFIRMED', 'FULFILLED') AND COALESCE(s."soldAt", s."createdAt") >= ${range.from} AND COALESCE(s."soldAt", s."createdAt") < ${range.to} GROUP BY label, s."currency"`,
      ),
      this.raw<LabelRow & { currency: string }>(
        Prisma.sql`SELECT COALESCE(NULLIF(c."country", ''), 'Sin país') AS label, s."currency", SUM(s."amount")::numeric AS amount, COUNT(*)::bigint AS count FROM "Subscription" s JOIN "Contact" c ON c."organizationId" = s."organizationId" AND c."id" = s."contactId" WHERE s."organizationId" = ${org}::uuid AND s."deletedAt" IS NULL AND s."status" = 'ACTIVE' GROUP BY label, s."currency"`,
      ),
    ]);
    const labels = new Set(
      [...leads, ...opportunities, ...sales, ...subscriptions].map(
        (row) => row.label ?? 'Sin país',
      ),
    );
    const map = (rows: LabelRow[]) => new Map(rows.map((row) => [row.label ?? 'Sin país', row]));
    const leadMap = map(leads);
    const opportunityMap = map(opportunities);
    return [...labels].slice(0, 100).map((label) => {
      const salesRows = sales.filter((row) => (row.label ?? 'Sin país') === label);
      const subRows = subscriptions.filter((row) => (row.label ?? 'Sin país') === label);
      const salesCount = salesRows.reduce((sum, row) => sum + numberValue(row.count), 0);
      const opportunityCount = numberValue(opportunityMap.get(label)?.count);
      return {
        country: label,
        leads: numberValue(leadMap.get(label)?.count),
        opportunities: opportunityCount,
        sales: salesCount,
        conversion: opportunityCount
          ? Number(((salesCount / opportunityCount) * 100).toFixed(2))
          : 0,
        revenue: salesRows.map((row) => ({
          currency: row.currency,
          amount: decimalValue(row.amount),
        })),
        mrr: subRows.map((row) => ({ currency: row.currency, amount: decimalValue(row.amount) })),
        ltv: null,
        churn: null,
        averageTimeToSaleDays: null,
        averageTimeToActivationDays: null,
      };
    });
  }

  private async products(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.raw<
      LabelRow & {
        currency: string;
        success: string | bigint;
        failures: string | bigint;
        retries: string | bigint;
      }
    >(
      Prisma.sql`SELECT si."productNameSnapshot" AS label, si."currency", SUM(si."quantity")::numeric AS units, SUM(si."total")::numeric AS amount, COUNT(DISTINCT si."saleId")::bigint AS count, COUNT(DISTINCT f."id") FILTER (WHERE f."status" = 'COMPLETED')::bigint AS success, COUNT(DISTINCT f."id") FILTER (WHERE f."status" = 'FAILED')::bigint AS failures, COALESCE(SUM(f."attemptCount"), 0)::bigint AS retries FROM "SaleItem" si JOIN "Sale" s ON s."organizationId" = si."organizationId" AND s."id" = si."saleId" LEFT JOIN "Fulfillment" f ON f."organizationId" = si."organizationId" AND f."saleItemId" = si."id" AND f."deletedAt" IS NULL WHERE si."organizationId" = ${org}::uuid AND si."deletedAt" IS NULL AND s."deletedAt" IS NULL AND s."status" IN ('CONFIRMED', 'FULFILLED') AND COALESCE(s."soldAt", s."createdAt") >= ${range.from} AND COALESCE(s."soldAt", s."createdAt") < ${range.to} ${query.productId ? Prisma.sql`AND si."productId" = ${query.productId}::uuid` : Prisma.empty} GROUP BY label, si."currency" ORDER BY amount DESC LIMIT 100`,
    );
    return rows.map((row) => ({
      product: row.label,
      currency: row.currency,
      units: decimalValue(row.units),
      revenue: decimalValue(row.amount),
      averageTicket: numberValue(row.count)
        ? (numberValue(row.amount) / numberValue(row.count)).toFixed(2)
        : '0.00',
      conversion: null,
      renewal: null,
      churn: null,
      mrr: null,
      ltv: null,
      fulfillments: {
        successful: numberValue(row.success),
        failed: numberValue(row.failures),
        retries: numberValue(row.retries),
      },
    }));
  }

  private async campaigns(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.raw<{
      id: string;
      name: string;
      source: string;
      platform: string;
      leads: string | bigint;
      sales: string | bigint;
      revenue: string | number | Prisma.Decimal;
      costs: string | number | Prisma.Decimal;
    }>(
      Prisma.sql`WITH lead_stats AS (SELECT "campaignId", COUNT(*)::bigint AS leads FROM "Opportunity" WHERE "organizationId" = ${org}::uuid AND "deletedAt" IS NULL AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to} GROUP BY "campaignId"), sale_stats AS (SELECT o."campaignId", COUNT(DISTINCT s."id")::bigint AS sales, SUM(s."total")::numeric AS revenue FROM "Opportunity" o JOIN "Sale" s ON s."organizationId" = o."organizationId" AND s."opportunityId" = o."id" WHERE o."organizationId" = ${org}::uuid AND s."deletedAt" IS NULL AND s."status" IN ('CONFIRMED', 'FULFILLED') AND COALESCE(s."soldAt", s."createdAt") >= ${range.from} AND COALESCE(s."soldAt", s."createdAt") < ${range.to} GROUP BY o."campaignId"), cost_stats AS (SELECT "campaignId", SUM("amount")::numeric AS costs FROM "Expense" WHERE "organizationId" = ${org}::uuid AND "deletedAt" IS NULL AND "expenseDate" >= ${range.from} AND "expenseDate" < ${range.to} GROUP BY "campaignId") SELECT c."id", c."name", c."source", c."platform", COALESCE(l."leads", 0)::bigint AS leads, COALESCE(s."sales", 0)::bigint AS sales, COALESCE(s."revenue", 0)::numeric AS revenue, COALESCE(e."costs", 0)::numeric AS costs FROM "Campaign" c LEFT JOIN lead_stats l ON l."campaignId" = c."id" LEFT JOIN sale_stats s ON s."campaignId" = c."id" LEFT JOIN cost_stats e ON e."campaignId" = c."id" WHERE c."organizationId" = ${org}::uuid AND c."deletedAt" IS NULL ${query.campaignId ? Prisma.sql`AND c."id" = ${query.campaignId}::uuid` : Prisma.empty} ORDER BY revenue DESC LIMIT 100`,
    );
    return rows.map((row) => {
      const cost = numberValue(row.costs);
      const revenue = numberValue(row.revenue);
      return {
        id: row.id,
        campaign: row.name,
        source: row.source,
        platform: row.platform,
        leads: numberValue(row.leads),
        sales: numberValue(row.sales),
        conversion: numberValue(row.leads)
          ? Number(((numberValue(row.sales) / numberValue(row.leads)) * 100).toFixed(2))
          : 0,
        revenue: decimalValue(row.revenue),
        costs: decimalValue(row.costs),
        cpa: numberValue(row.sales) ? (cost / numberValue(row.sales)).toFixed(2) : null,
        roi: cost ? Number((((revenue - cost) / cost) * 100).toFixed(2)) : null,
        roas: cost ? Number((revenue / cost).toFixed(2)) : null,
      };
    });
  }

  private async sellers(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.raw<{
      id: string;
      firstName: string;
      lastName: string | null;
      leads: string | bigint;
      sales: string | bigint;
      revenue: string | number | Prisma.Decimal;
      pending: string | bigint;
    }>(
      Prisma.sql`WITH lead_stats AS (SELECT "userId", COUNT(*)::bigint AS leads FROM "Opportunity" WHERE "organizationId" = ${org}::uuid AND "deletedAt" IS NULL AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to} GROUP BY "userId"), sale_stats AS (SELECT "userId", COUNT(*)::bigint AS sales, SUM("total")::numeric AS revenue FROM "Sale" WHERE "organizationId" = ${org}::uuid AND "deletedAt" IS NULL AND "status" IN ('CONFIRMED', 'FULFILLED') AND COALESCE("soldAt", "createdAt") >= ${range.from} AND COALESCE("soldAt", "createdAt") < ${range.to} GROUP BY "userId"), followup_stats AS (SELECT "userId", COUNT(*)::bigint AS pending FROM "FollowUp" WHERE "organizationId" = ${org}::uuid AND "deletedAt" IS NULL AND "status" IN ('PENDING', 'RESCHEDULED') GROUP BY "userId") SELECT u."id", u."firstName", u."lastName", COALESCE(l."leads", 0)::bigint AS leads, COALESCE(s."sales", 0)::bigint AS sales, COALESCE(s."revenue", 0)::numeric AS revenue, COALESCE(f."pending", 0)::bigint AS pending FROM "User" u LEFT JOIN lead_stats l ON l."userId" = u."id" LEFT JOIN sale_stats s ON s."userId" = u."id" LEFT JOIN followup_stats f ON f."userId" = u."id" WHERE u."organizationId" = ${org}::uuid AND u."deletedAt" IS NULL AND u."status" = 'ACTIVE' ${query.userId ? Prisma.sql`AND u."id" = ${query.userId}::uuid` : Prisma.empty} ORDER BY revenue DESC LIMIT 100`,
    );
    return rows.map((row) => ({
      id: row.id,
      seller: nameOf(row.firstName, row.lastName),
      leads: numberValue(row.leads),
      demos: null,
      sales: numberValue(row.sales),
      conversion: numberValue(row.leads)
        ? Number(((numberValue(row.sales) / numberValue(row.leads)) * 100).toFixed(2))
        : 0,
      averageTicket: numberValue(row.sales)
        ? (numberValue(row.revenue) / numberValue(row.sales)).toFixed(2)
        : '0.00',
      revenue: decimalValue(row.revenue),
      averageCloseDays: null,
      pendingFollowUps: numberValue(row.pending),
    }));
  }

  private async providers(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.raw<{
      id: string;
      name: string;
      fulfillments: string | bigint;
      success: string | bigint;
      failures: string | bigint;
      retries: string | bigint;
      avgSeconds: string | number | null;
    }>(
      Prisma.sql`SELECT p."id", p."name", COUNT(f."id")::bigint AS fulfillments, COUNT(f."id") FILTER (WHERE f."status" = 'COMPLETED')::bigint AS success, COUNT(f."id") FILTER (WHERE f."status" = 'FAILED')::bigint AS failures, COALESCE(SUM(f."attemptCount"), 0)::bigint AS retries, AVG(EXTRACT(EPOCH FROM (f."completedAt" - f."startedAt"))) FILTER (WHERE f."completedAt" IS NOT NULL AND f."startedAt" IS NOT NULL) AS "avgSeconds" FROM "Provider" p LEFT JOIN "Fulfillment" f ON f."organizationId" = p."organizationId" AND f."providerId" = p."id" AND f."deletedAt" IS NULL AND f."createdAt" >= ${range.from} AND f."createdAt" < ${range.to} WHERE p."organizationId" = ${org}::uuid AND p."deletedAt" IS NULL ${query.providerId ? Prisma.sql`AND p."id" = ${query.providerId}::uuid` : Prisma.empty} GROUP BY p."id", p."name" ORDER BY fulfillments DESC LIMIT 100`,
    );
    return rows.map((row) => ({
      id: row.id,
      provider: row.name,
      fulfillments: numberValue(row.fulfillments),
      success: numberValue(row.success),
      failures: numberValue(row.failures),
      retries: numberValue(row.retries),
      successRate: numberValue(row.fulfillments)
        ? Number(((numberValue(row.success) / numberValue(row.fulfillments)) * 100).toFixed(2))
        : 0,
      averageDeliveryMinutes: row.avgSeconds === null ? null : Number(row.avgSeconds) / 60,
      cost: null,
    }));
  }

  private async renewalBreakdown(
    org: string,
    range: { from: Date; to: Date },
    query: IntelligenceQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.raw<{
      bucket: Date | string;
      status: string;
      currency: string;
      count: string | bigint;
      amount: string | number | Prisma.Decimal;
    }>(
      Prisma.sql`SELECT DATE_TRUNC('month', r."dueAt")::date AS bucket, r."status", r."currency", COUNT(*)::bigint AS count, SUM(r."amount")::numeric AS amount FROM "Renewal" r WHERE r."organizationId" = ${org}::uuid AND r."deletedAt" IS NULL AND r."dueAt" >= ${range.from} AND r."dueAt" < ${range.to} ${query.currency ? Prisma.sql`AND r."currency" = ${query.currency.toUpperCase()}` : Prisma.empty} GROUP BY bucket, r."status", r."currency" ORDER BY bucket`,
    );
    return rows.map((row) => ({
      month: String(row.bucket).slice(0, 7),
      status: row.status,
      currency: row.currency,
      renewals: numberValue(row.count),
      amount: decimalValue(row.amount),
    }));
  }
}
