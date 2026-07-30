import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

interface CountRow {
  count: number | bigint;
}

interface KeyCountRow {
  key: string | null;
  count: number | bigint;
}

interface ContactCountRow {
  contactId: string;
  name: string | null;
  count: number | bigint;
}

interface ConversationCountRow {
  conversationId: string;
  contactId: string;
  name: string | null;
  lastMessageAt: Date | null;
  count: number | bigint;
}

export interface WhatsAppReadOnlyMetrics {
  generatedAt: string;
  period: { from: string; to: string };
  conversationsToday: number;
  conversationsByCountry: Array<{ country: string; conversations: number }>;
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
  newContacts: number;
  activeCustomers: number;
  inactiveCustomers: number;
  minutesSinceLastMessage: number | null;
  topCountry: { country: string; conversations: number } | null;
  topContact: { contactId: string; name: string; messages: number } | null;
  topConversations: Array<{
    conversationId: string;
    contactId: string;
    name: string;
    messages: number;
    lastMessageAt: string | null;
  }>;
  activityByHour: Array<{ hour: number; messages: number }>;
  activityByDay: Array<{ day: number; messages: number }>;
  activityByMonth: Array<{ month: string; messages: number }>;
}

function count(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function displayName(name: string | null, fallback: string): string {
  return name?.trim() || fallback;
}

@Injectable()
export class WhatsAppReadOnlyAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    organizationId: string,
    from?: Date,
    to = new Date(),
  ): Promise<WhatsAppReadOnlyMetrics> {
    const periodFrom = from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const week = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1_000);
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      conversationsToday,
      messagesToday,
      messagesThisWeek,
      messagesThisMonth,
      newContacts,
      activeCustomers,
      inactiveCustomers,
      lastMessage,
      countries,
      topContacts,
      topConversations,
      activityByHour,
      activityByDay,
      activityByMonth,
    ] = await Promise.all([
      this.distinctConversationCount(organizationId, today, now),
      this.messageCount(organizationId, today, now),
      this.messageCount(organizationId, week, now),
      this.messageCount(organizationId, month, now),
      this.prisma.contact.count({
        where: {
          organizationId,
          source: 'WHATSAPP',
          deletedAt: null,
          createdAt: { gte: month, lte: now },
        },
      }),
      this.prisma.contact.count({
        where: {
          organizationId,
          isCustomer: true,
          deletedAt: null,
          lastActivityAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000) },
        },
      }),
      this.prisma.contact.count({
        where: {
          organizationId,
          isCustomer: true,
          deletedAt: null,
          OR: [
            { lastActivityAt: null },
            { lastActivityAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000) } },
          ],
        },
      }),
      this.prisma.whatsAppMessage.findFirst({
        where: { organizationId, direction: 'INBOUND', deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
      this.queryCountries(organizationId, periodFrom, to),
      this.queryTopContacts(organizationId, periodFrom, to),
      this.queryTopConversations(organizationId, periodFrom, to),
      this.queryActivityByHour(organizationId, periodFrom, to),
      this.queryActivityByDay(organizationId, periodFrom, to),
      this.queryActivityByMonth(organizationId, periodFrom, to),
    ]);

    const conversationsByCountry = countries.map((row) => ({
      country: row.key ?? 'UNKNOWN',
      conversations: count(row.count),
    }));
    const contact = topContacts[0];
    const country = conversationsByCountry[0] ?? null;

    return {
      generatedAt: now.toISOString(),
      period: { from: periodFrom.toISOString(), to: to.toISOString() },
      conversationsToday,
      conversationsByCountry,
      messagesToday,
      messagesThisWeek,
      messagesThisMonth,
      newContacts,
      activeCustomers,
      inactiveCustomers,
      minutesSinceLastMessage: lastMessage
        ? Math.max(0, Math.round((now.getTime() - lastMessage.createdAt.getTime()) / 60_000))
        : null,
      topCountry: country,
      topContact: contact
        ? {
            contactId: contact.contactId,
            name: displayName(contact.name, 'Contacto sin nombre'),
            messages: count(contact.count),
          }
        : null,
      topConversations: topConversations.map((row) => ({
        conversationId: row.conversationId,
        contactId: row.contactId,
        name: displayName(row.name, 'Contacto sin nombre'),
        messages: count(row.count),
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      })),
      activityByHour: activityByHour.map((row) => ({
        hour: Number(row.key ?? 0),
        messages: count(row.count),
      })),
      activityByDay: activityByDay.map((row) => ({
        day: Number(row.key ?? 0),
        messages: count(row.count),
      })),
      activityByMonth: activityByMonth.map((row) => ({
        month: row.key ?? 'UNKNOWN',
        messages: count(row.count),
      })),
    };
  }

  private async messageCount(organizationId: string, from: Date, to: Date): Promise<number> {
    const [row] = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "WhatsAppMessage"
      WHERE "organizationId" = CAST(${organizationId} AS uuid)
        AND "direction" = 'INBOUND'
        AND "deletedAt" IS NULL
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
    `);
    return count(row?.count ?? 0);
  }

  private async distinctConversationCount(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const [row] = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT "conversationId")::int AS count
      FROM "WhatsAppMessage"
      WHERE "organizationId" = CAST(${organizationId} AS uuid)
        AND "direction" = 'INBOUND'
        AND "deletedAt" IS NULL
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
    `);
    return count(row?.count ?? 0);
  }

  private queryCountries(organizationId: string, from: Date, to: Date): Promise<KeyCountRow[]> {
    return this.prisma.$queryRaw<KeyCountRow[]>(Prisma.sql`
      SELECT COALESCE(NULLIF(c."country", ''), 'UNKNOWN') AS key,
             COUNT(DISTINCT m."conversationId")::int AS count
      FROM "WhatsAppMessage" m
      JOIN "Contact" c ON c."organizationId" = m."organizationId" AND c."id" = m."contactId"
      WHERE m."organizationId" = CAST(${organizationId} AS uuid)
        AND m."direction" = 'INBOUND'
        AND m."deletedAt" IS NULL
        AND m."createdAt" >= ${from}
        AND m."createdAt" <= ${to}
      GROUP BY COALESCE(NULLIF(c."country", ''), 'UNKNOWN')
      ORDER BY count DESC, key ASC
      LIMIT 20
    `);
  }

  private queryTopContacts(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ContactCountRow[]> {
    return this.prisma.$queryRaw<ContactCountRow[]>(Prisma.sql`
      SELECT m."contactId" AS "contactId",
             CONCAT_WS(' ', c."firstName", c."lastName") AS name,
             COUNT(*)::int AS count
      FROM "WhatsAppMessage" m
      JOIN "Contact" c ON c."organizationId" = m."organizationId" AND c."id" = m."contactId"
      WHERE m."organizationId" = CAST(${organizationId} AS uuid)
        AND m."direction" = 'INBOUND'
        AND m."deletedAt" IS NULL
        AND c."deletedAt" IS NULL
        AND m."createdAt" >= ${from}
        AND m."createdAt" <= ${to}
      GROUP BY m."contactId", c."firstName", c."lastName"
      ORDER BY count DESC, m."contactId" ASC
      LIMIT 10
    `);
  }

  private queryTopConversations(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<ConversationCountRow[]> {
    return this.prisma.$queryRaw<ConversationCountRow[]>(Prisma.sql`
      SELECT m."conversationId" AS "conversationId",
             m."contactId" AS "contactId",
             CONCAT_WS(' ', c."firstName", c."lastName") AS name,
             MAX(m."createdAt") AS "lastMessageAt",
             COUNT(*)::int AS count
      FROM "WhatsAppMessage" m
      JOIN "Contact" c ON c."organizationId" = m."organizationId" AND c."id" = m."contactId"
      WHERE m."organizationId" = CAST(${organizationId} AS uuid)
        AND m."direction" = 'INBOUND'
        AND m."deletedAt" IS NULL
        AND c."deletedAt" IS NULL
        AND m."createdAt" >= ${from}
        AND m."createdAt" <= ${to}
      GROUP BY m."conversationId", m."contactId", c."firstName", c."lastName"
      ORDER BY count DESC, "lastMessageAt" DESC
      LIMIT 10
    `);
  }

  private queryActivityByHour(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<KeyCountRow[]> {
    return this.queryBucket(
      organizationId,
      from,
      to,
      Prisma.sql`EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'UTC')::text`,
    );
  }

  private queryActivityByDay(organizationId: string, from: Date, to: Date): Promise<KeyCountRow[]> {
    return this.queryBucket(
      organizationId,
      from,
      to,
      Prisma.sql`EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'UTC')::text`,
    );
  }

  private queryActivityByMonth(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<KeyCountRow[]> {
    return this.queryBucket(
      organizationId,
      from,
      to,
      Prisma.sql`TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM')`,
    );
  }

  private queryBucket(
    organizationId: string,
    from: Date,
    to: Date,
    bucket: Prisma.Sql,
  ): Promise<KeyCountRow[]> {
    return this.prisma.$queryRaw<KeyCountRow[]>(Prisma.sql`
      SELECT ${bucket} AS key, COUNT(*)::int AS count
      FROM "WhatsAppMessage"
      WHERE "organizationId" = CAST(${organizationId} AS uuid)
        AND "direction" = 'INBOUND'
        AND "deletedAt" IS NULL
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
      GROUP BY ${bucket}
      ORDER BY key ASC
    `);
  }
}
