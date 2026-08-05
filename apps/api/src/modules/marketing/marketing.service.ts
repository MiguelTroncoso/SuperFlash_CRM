import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProspectReasonType } from '@prisma/client';
import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  ChangeProspectStateDto,
  CommercialImportDto,
  CreateAttributionDto,
  CreateCampaignDto,
  CreateLossReasonDto,
  CreateProspectReasonDto,
  CreateSpendDto,
  CorrectAttributionDto,
  ListMarketingQueryDto,
  MarketingDateQueryDto,
  MarketingHierarchyDto,
  UpdateCampaignDto,
  UpdateEngagementConfigDto,
  UpdateLossReasonDto,
  UpdateSpendDto,
} from './dto/marketing.dto';
import {
  CsvRecord,
  MarketingRequestMetadata,
  PerformanceMetric,
  PerformanceRow,
} from './marketing.types';

const DEFAULT_FROM = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const DEFAULT_TO = new Date();

function decimal(value: string): Prisma.Decimal {
  const parsed = new Prisma.Decimal(value);
  if (!parsed.isFinite() || parsed.isNegative())
    throw new BadRequestException('El importe debe ser válido y no negativo.');
  return parsed;
}

function decimalString(value: Prisma.Decimal | string | number | null): string {
  return value === null ? '0.00' : new Prisma.Decimal(value).toFixed(2);
}

function integer(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function jsonObject(value: unknown): Prisma.InputJsonValue {
  if (typeof value === 'object' && value !== null) return value as Prisma.InputJsonObject;
  return {};
}

function parseCsv(input: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? '';
    const next = input[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some((item) => item.length > 0)) rows.push(row);
  if (rows.length < 1) return [];
  const headers = (rows[0] ?? []).map((header) => header.trim().toLowerCase());
  return rows.slice(1).map((values) =>
    headers.reduce<CsvRecord>((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {}),
  );
}

@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listCampaigns(query: ListMarketingQueryDto, user: AuthenticatedUser) {
    const where: Prisma.CampaignWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { _count: { select: { adSets: true, ads: true, creatives: true } } },
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return {
      data: data.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        code: campaign.code,
        platform: campaign.platform,
        source: campaign.source,
        status: campaign.status,
        active: campaign.active,
        targetedCountry: campaign.targetedCountry,
        counts: campaign._count,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async createCampaign(
    dto: CreateCampaignDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    await this.assertUser(dto.ownerId, user.organizationId);
    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          organizationId: user.organizationId,
          name: dto.name.trim(),
          source: dto.source.trim(),
          platform: dto.platform.trim().toUpperCase(),
          ...(dto.code ? { code: dto.code.trim().toLowerCase() } : {}),
          ...(dto.externalId ? { externalId: dto.externalId.trim() } : {}),
          ...(dto.status ? { status: dto.status, active: dto.status === 'ACTIVE' } : {}),
          ...(dto.objective ? { objective: dto.objective.trim() } : {}),
          ...(dto.targetedCountry ? { targetedCountry: dto.targetedCountry.toUpperCase() } : {}),
          ...(dto.ownerId ? { userId: dto.ownerId } : {}),
          ...(dto.startedAt ? { startDate: new Date(dto.startedAt) } : {}),
          ...(dto.endedAt ? { endDate: new Date(dto.endedAt) } : {}),
          ...(dto.notes ? { notes: dto.notes.trim() } : {}),
        },
      });
      await this.audit.recordWithClient(tx, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'MARKETING_CAMPAIGN_CREATED',
        tableName: 'Campaign',
        recordId: created.id,
        newValue: { name: created.name, platform: created.platform, source: created.source },
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
      await this.outbox.enqueueWithClient(tx, {
        eventType: 'MarketingCampaignCreated',
        organizationId: user.organizationId,
        aggregateType: 'Campaign',
        aggregateId: created.id,
        actorId: user.userId,
        requestId: metadata.requestId ?? created.id,
        payload: { campaignId: created.id, platform: created.platform, source: created.source },
      });
      return created;
    });
    return {
      id: campaign.id,
      name: campaign.name,
      platform: campaign.platform,
      source: campaign.source,
    };
  }

  async updateCampaign(
    id: string,
    dto: UpdateCampaignDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const current = await this.prisma.campaign.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!current) throw new NotFoundException('MARKETING_CAMPAIGN_NOT_FOUND');
    await this.assertUser(dto.ownerId, user.organizationId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.campaign.update({
        where: { organizationId_id: { organizationId: user.organizationId, id } },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.source !== undefined ? { source: dto.source.trim() } : {}),
          ...(dto.platform !== undefined ? { platform: dto.platform.trim().toUpperCase() } : {}),
          ...(dto.code !== undefined ? { code: dto.code?.trim().toLowerCase() || null } : {}),
          ...(dto.externalId !== undefined ? { externalId: dto.externalId?.trim() || null } : {}),
          ...(dto.status !== undefined
            ? { status: dto.status, active: dto.status === 'ACTIVE' }
            : {}),
          ...(dto.objective !== undefined ? { objective: dto.objective || null } : {}),
          ...(dto.targetedCountry !== undefined
            ? { targetedCountry: dto.targetedCountry?.toUpperCase() || null }
            : {}),
          ...(dto.ownerId !== undefined ? { userId: dto.ownerId || null } : {}),
          ...(dto.startedAt !== undefined
            ? { startDate: dto.startedAt ? new Date(dto.startedAt) : null }
            : {}),
          ...(dto.endedAt !== undefined
            ? { endDate: dto.endedAt ? new Date(dto.endedAt) : null }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      await this.audit.recordWithClient(tx, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'MARKETING_CAMPAIGN_UPDATED',
        tableName: 'Campaign',
        recordId: id,
        previousValue: { name: current.name, status: current.status, active: current.active },
        newValue: { name: result.name, status: result.status, active: result.active },
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
      return result;
    });
    return { id: updated.id, name: updated.name, status: updated.status, active: updated.active };
  }

  async archiveCampaign(id: string, user: AuthenticatedUser, metadata: MarketingRequestMetadata) {
    const existing = await this.prisma.campaign.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('MARKETING_CAMPAIGN_NOT_FOUND');
    await this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { organizationId_id: { organizationId: user.organizationId, id } },
        data: { status: 'ARCHIVED', active: false, deletedAt: new Date() },
      });
      await this.audit.recordWithClient(tx, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'MARKETING_CAMPAIGN_ARCHIVED',
        tableName: 'Campaign',
        recordId: id,
        previousValue: { status: existing.status },
        newValue: { status: 'ARCHIVED' },
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
    });
    return { id, archived: true };
  }

  async listHierarchy(
    kind: 'adSets' | 'ads' | 'creatives',
    query: ListMarketingQueryDto,
    user: AuthenticatedUser,
  ) {
    const skip = (query.page - 1) * query.limit;
    if (kind === 'adSets') {
      const where: Prisma.MarketingAdSetWhereInput = {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      };
      const [data, total] = await Promise.all([
        this.prisma.marketingAdSet.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: { createdAt: 'desc' },
          include: { campaign: { select: { id: true, name: true } } },
        }),
        this.prisma.marketingAdSet.count({ where }),
      ]);
      return {
        data,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    }
    if (kind === 'ads') {
      const where: Prisma.MarketingAdWhereInput = {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(query.adSetId ? { adSetId: query.adSetId } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      };
      const [data, total] = await Promise.all([
        this.prisma.marketingAd.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: { createdAt: 'desc' },
          include: { campaign: { select: { id: true, name: true } } },
        }),
        this.prisma.marketingAd.count({ where }),
      ]);
      return {
        data,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    }
    const where: Prisma.MarketingCreativeWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.adId ? { adId: query.adId } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.marketingCreative.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { campaign: { select: { id: true, name: true } } },
      }),
      this.prisma.marketingCreative.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async createHierarchy(
    kind: 'adSet' | 'ad' | 'creative',
    dto: MarketingHierarchyDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    await this.assertCampaign(dto.campaignId, user.organizationId);
    if (kind !== 'adSet' && dto.adSetId)
      await this.assertAdSet(dto.adSetId, dto.campaignId, user.organizationId);
    if (kind === 'creative' && dto.adId)
      await this.assertAd(dto.adId, dto.campaignId, user.organizationId);
    const data =
      kind === 'adSet'
        ? await this.prisma.marketingAdSet.create({
            data: {
              organizationId: user.organizationId,
              campaignId: dto.campaignId,
              name: dto.name.trim(),
              ...(dto.externalId ? { externalId: dto.externalId } : {}),
              ...(dto.status ? { status: dto.status } : {}),
              ...(dto.targetedCountry
                ? { targetedCountry: dto.targetedCountry.toUpperCase() }
                : {}),
              ...(dto.audience ? { audience: dto.audience } : {}),
            },
          })
        : kind === 'ad'
          ? await this.prisma.marketingAd.create({
              data: {
                organizationId: user.organizationId,
                campaignId: dto.campaignId,
                ...(dto.adSetId ? { adSetId: dto.adSetId } : {}),
                name: dto.name.trim(),
                ...(dto.externalId ? { externalId: dto.externalId } : {}),
                ...(dto.status ? { status: dto.status } : {}),
                ...(dto.destination ? { destination: dto.destination } : {}),
              },
            })
          : await this.prisma.marketingCreative.create({
              data: {
                organizationId: user.organizationId,
                campaignId: dto.campaignId,
                ...(dto.adId ? { adId: dto.adId } : {}),
                name: dto.name.trim(),
                format: dto.format ?? 'OTHER',
                ...(dto.headline ? { headline: dto.headline } : {}),
                ...(dto.body ? { body: dto.body } : {}),
                ...(dto.assetReference ? { assetReference: dto.assetReference } : {}),
              },
            });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: `MARKETING_${kind.toUpperCase()}_CREATED`,
      tableName:
        kind === 'adSet' ? 'MarketingAdSet' : kind === 'ad' ? 'MarketingAd' : 'MarketingCreative',
      recordId: data.id,
      newValue: { name: data.name, campaignId: dto.campaignId },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return data;
  }

  async listSpend(query: MarketingDateQueryDto, user: AuthenticatedUser) {
    const where: Prisma.ExpenseWhereInput = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.adSetId ? { adSetId: query.adSetId } : {}),
      ...(query.adId ? { adId: query.adId } : {}),
      ...(query.from || query.to
        ? {
            expenseDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          campaign: { select: { id: true, name: true } },
          adSet: { select: { id: true, name: true } },
          ad: { select: { id: true, name: true } },
          creative: { select: { id: true, name: true } },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);
    return {
      data: data.map((entry) => ({
        ...entry,
        amount: entry.amount.toFixed(2),
        cpmInput: entry.cpmInput?.toFixed(6) ?? null,
        cpcInput: entry.cpcInput?.toFixed(6) ?? null,
        ctrInput: entry.ctrInput?.toFixed(6) ?? null,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async createSpend(
    dto: CreateSpendDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    await this.assertCampaign(dto.campaignId, user.organizationId);
    if (dto.adSetId) await this.assertAdSet(dto.adSetId, dto.campaignId, user.organizationId);
    if (dto.adId) await this.assertAd(dto.adId, dto.campaignId, user.organizationId);
    if (dto.creativeId)
      await this.assertCreative(dto.creativeId, dto.campaignId, user.organizationId);
    const amount = decimal(dto.amount);
    const existing = dto.idempotencyKey
      ? await this.prisma.expense.findFirst({
          where: { organizationId: user.organizationId, idempotencyKey: dto.idempotencyKey },
        })
      : null;
    if (existing) return { ...existing, amount: existing.amount.toFixed(2), idempotent: true };
    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        const created = await tx.expense.create({
          data: {
            organizationId: user.organizationId,
            campaignId: dto.campaignId,
            ...(dto.adSetId ? { adSetId: dto.adSetId } : {}),
            ...(dto.adId ? { adId: dto.adId } : {}),
            ...(dto.creativeId ? { creativeId: dto.creativeId } : {}),
            amount,
            currency: dto.currency.toUpperCase(),
            expenseDate: new Date(dto.date),
            paymentMethod: 'OTHER',
            frequency: 'ONE_TIME',
            source: 'MANUAL',
            ...(dto.conversations !== undefined ? { conversations: dto.conversations } : {}),
            ...(dto.contacts !== undefined ? { contacts: dto.contacts } : {}),
            ...(dto.impressions !== undefined ? { impressions: dto.impressions } : {}),
            ...(dto.reach !== undefined ? { reach: dto.reach } : {}),
            ...(dto.clicks !== undefined ? { clicks: dto.clicks } : {}),
            ...(dto.cpmInput ? { cpmInput: decimal(dto.cpmInput) } : {}),
            ...(dto.cpcInput ? { cpcInput: decimal(dto.cpcInput) } : {}),
            ...(dto.ctrInput ? { ctrInput: decimal(dto.ctrInput) } : {}),
            ...(dto.notes ? { notes: dto.notes } : {}),
            ...(dto.idempotencyKey ? { idempotencyKey: dto.idempotencyKey } : {}),
            createdByUserId: user.userId,
          },
        });
        await this.audit.recordWithClient(tx, {
          organizationId: user.organizationId,
          userId: user.userId,
          action: 'MARKETING_SPEND_RECORDED',
          tableName: 'Expense',
          recordId: created.id,
          newValue: {
            campaignId: created.campaignId,
            amount: created.amount.toFixed(2),
            currency: created.currency,
            source: created.source,
          },
          ip: metadata.ipAddress,
          requestId: metadata.requestId,
        });
        await this.outbox.enqueueWithClient(tx, {
          eventType: 'MarketingSpendRecorded',
          organizationId: user.organizationId,
          aggregateType: 'Expense',
          aggregateId: created.id,
          actorId: user.userId,
          requestId: metadata.requestId ?? created.id,
          payload: {
            campaignId: dto.campaignId,
            amount: created.amount.toFixed(2),
            currency: created.currency,
          },
        });
        return created;
      });
      return { ...entry, amount: entry.amount.toFixed(2) };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('MARKETING_SPEND_DUPLICATE');
      throw error;
    }
  }

  async updateSpend(
    id: string,
    dto: UpdateSpendDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const current = await this.prisma.expense.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null, source: 'MANUAL' },
    });
    if (!current) throw new NotFoundException('MARKETING_SPEND_NOT_FOUND');
    if (dto.campaignId) await this.assertCampaign(dto.campaignId, user.organizationId);
    const updated = await this.prisma.expense.update({
      where: { organizationId_id: { organizationId: user.organizationId, id } },
      data: {
        ...(dto.amount !== undefined ? { amount: decimal(dto.amount) } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency.toUpperCase() } : {}),
        ...(dto.date !== undefined ? { expenseDate: new Date(dto.date) } : {}),
        ...(dto.campaignId !== undefined ? { campaignId: dto.campaignId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
        ...(dto.conversations !== undefined ? { conversations: dto.conversations } : {}),
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'MARKETING_SPEND_UPDATED',
      tableName: 'Expense',
      recordId: id,
      previousValue: { amount: current.amount.toFixed(2) },
      newValue: { amount: updated.amount.toFixed(2) },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return { ...updated, amount: updated.amount.toFixed(2) };
  }

  async archiveSpend(id: string, user: AuthenticatedUser, metadata: MarketingRequestMetadata) {
    const current = await this.prisma.expense.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null, source: 'MANUAL' },
    });
    if (!current) throw new NotFoundException('MARKETING_SPEND_NOT_FOUND');
    await this.prisma.expense.update({
      where: { organizationId_id: { organizationId: user.organizationId, id } },
      data: { deletedAt: new Date(), active: false },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'MARKETING_SPEND_ARCHIVED',
      tableName: 'Expense',
      recordId: id,
      previousValue: { amount: current.amount.toFixed(2) },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return { id, archived: true };
  }

  async performance(query: MarketingDateQueryDto, user: AuthenticatedUser) {
    const from = query.from ? new Date(query.from) : DEFAULT_FROM;
    const to = query.to ? new Date(query.to) : DEFAULT_TO;
    const conditions = [
      Prisma.sql`c."organizationId" = ${user.organizationId}::uuid`,
      Prisma.sql`c."deletedAt" IS NULL`,
    ];
    if (query.campaignId) conditions.push(Prisma.sql`c."id" = ${query.campaignId}::uuid`);
    if (query.currency)
      conditions.push(Prisma.sql`currency_scope."currency" = ${query.currency.toUpperCase()}`);
    const where = Prisma.join(conditions, ' AND ');
    const actualCountryFilter = query.actualCountry
      ? Prisma.sql`AND a."actualCountry" = ${query.actualCountry.toUpperCase()}`
      : Prisma.empty;
    const sellerFilter = query.sellerId
      ? Prisma.sql`AND s."userId" = ${query.sellerId}::uuid`
      : Prisma.empty;
    const productFilter = query.productId
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM "SaleItem" si_filter WHERE si_filter."organizationId" = s."organizationId" AND si_filter."saleId" = s."id" AND si_filter."productId" = ${query.productId}::uuid AND si_filter."deletedAt" IS NULL)`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<PerformanceRow[]>(Prisma.sql`
      WITH spend AS (
        SELECT e."campaignId" AS "campaignId", e."currency", SUM(e."amount") AS spend
        FROM "Expense" e
        WHERE e."organizationId" = ${user.organizationId}::uuid AND e."deletedAt" IS NULL AND e."campaignId" IS NOT NULL AND e."expenseDate" >= ${from} AND e."expenseDate" < ${to}
        GROUP BY e."campaignId", e."currency"
      ), activity AS (
        SELECT a."campaignId", COUNT(DISTINCT a."conversationId") FILTER (WHERE a."conversationId" IS NOT NULL) AS conversations, COUNT(DISTINCT a."contactId") FILTER (WHERE a."kind" = 'ORIGINAL' AND a."contactId" IS NOT NULL) AS contacts, COUNT(DISTINCT a."trialId") FILTER (WHERE a."trialId" IS NOT NULL) AS demos
        FROM "Attribution" a
        WHERE a."organizationId" = ${user.organizationId}::uuid AND a."deletedAt" IS NULL AND a."campaignId" IS NOT NULL AND a."acquiredAt" >= ${from} AND a."acquiredAt" < ${to}
          ${actualCountryFilter}
        GROUP BY a."campaignId"
      ), payment_totals AS (
        SELECT p."saleId", SUM(p."netAmount" - p."refundedAmount") AS net_received
        FROM "Payment" p
        WHERE p."organizationId" = ${user.organizationId}::uuid AND p."status" IN ('CONFIRMED', 'REFUNDED') AND p."deletedAt" IS NULL
        GROUP BY p."saleId"
      ), item_costs AS (
        SELECT si."saleId", SUM(CASE WHEN (si."catalogSnapshot"->>'costPrice') ~ '^[0-9]+(\\.[0-9]+)?$' THEN ((si."catalogSnapshot"->>'costPrice')::numeric * si."quantity") ELSE 0 END) AS product_cost
        FROM "SaleItem" si WHERE si."organizationId" = ${user.organizationId}::uuid AND si."deletedAt" IS NULL GROUP BY si."saleId"
      ), fulfillment_costs AS (
        SELECT f."saleId", SUM(COALESCE(f."costAmount", 0)) AS fulfillment_cost
        FROM "Fulfillment" f WHERE f."organizationId" = ${user.organizationId}::uuid AND f."deletedAt" IS NULL GROUP BY f."saleId"
      ), sales AS (
        SELECT a."campaignId", s."currency", COUNT(DISTINCT s."id") AS sales, SUM(s."total") AS gross_revenue, SUM(COALESCE(pt.net_received, 0)) AS net_revenue, SUM(COALESCE(ic.product_cost, 0)) AS product_cost, SUM(COALESCE(fc.fulfillment_cost, 0)) AS fulfillment_cost, AVG(EXTRACT(EPOCH FROM (COALESCE(s."soldAt", s."createdAt") - ctc."createdAt"))) AS average_time_to_sale_seconds
        FROM "Attribution" a JOIN "Sale" s ON s."organizationId" = a."organizationId" AND s."id" = a."saleId" JOIN "Contact" ctc ON ctc."organizationId" = s."organizationId" AND ctc."id" = s."contactId" LEFT JOIN payment_totals pt ON pt."saleId" = s."id" LEFT JOIN item_costs ic ON ic."saleId" = s."id" LEFT JOIN fulfillment_costs fc ON fc."saleId" = s."id"
        WHERE a."organizationId" = ${user.organizationId}::uuid AND a."kind" = 'CONVERSION' AND a."saleId" IS NOT NULL AND a."deletedAt" IS NULL AND s."deletedAt" IS NULL AND s."status" IN ('CONFIRMED', 'FULFILLED') AND COALESCE(s."soldAt", s."createdAt") >= ${from} AND COALESCE(s."soldAt", s."createdAt") < ${to}
          ${actualCountryFilter} ${sellerFilter} ${productFilter}
        GROUP BY a."campaignId", s."currency"
      ), currency_scope AS (
        SELECT "campaignId", "currency" FROM spend UNION SELECT "campaignId", "currency" FROM sales
      )
      SELECT c."id", c."name", c."platform", c."source", currency_scope."currency", COALESCE(sp.spend, 0) AS spend, COALESCE(ac.conversations, 0)::bigint AS conversations, COALESCE(ac.contacts, 0)::bigint AS contacts, COALESCE(ac.demos, 0)::bigint AS demos, COALESCE(sa.sales, 0)::bigint AS sales, COALESCE(sa.gross_revenue, 0) AS "grossRevenue", COALESCE(sa.net_revenue, 0) AS "netRevenue", COALESCE(sa.product_cost, 0) AS "productCost", COALESCE(sa.fulfillment_cost, 0) AS "fulfillmentCost", 0::bigint AS unanswered, NULL::numeric AS "averageFollowUps", sa.average_time_to_sale_seconds AS "averageTimeToSaleSeconds"
      FROM currency_scope JOIN "Campaign" c ON c."id" = currency_scope."campaignId" AND c."organizationId" = ${user.organizationId}::uuid LEFT JOIN spend sp ON sp."campaignId" = c."id" AND sp."currency" = currency_scope."currency" LEFT JOIN activity ac ON ac."campaignId" = c."id" LEFT JOIN sales sa ON sa."campaignId" = c."id" AND sa."currency" = currency_scope."currency"
      WHERE ${where}
      ORDER BY spend DESC, c."name" ASC
      LIMIT 500
    `);
    const canReadProfit = user.permissions.includes('commercial.profit.read');
    const mapped = rows.map((row) => this.toPerformance(row, canReadProfit));
    const currencies = [...new Set(mapped.map((item) => item.currency))];
    return { from, to, currencies, data: mapped };
  }

  private toPerformance(
    row: PerformanceRow,
    canReadProfit = true,
  ): PerformanceMetric & {
    campaignId: string;
    campaignName: string;
    platform: string;
    source: string;
  } {
    const spend = new Prisma.Decimal(decimalString(row.spend));
    const gross = new Prisma.Decimal(decimalString(row.grossRevenue));
    const net = new Prisma.Decimal(decimalString(row.netRevenue));
    const costs = new Prisma.Decimal(decimalString(row.productCost)).add(
      decimalString(row.fulfillmentCost),
    );
    const nullableRatio = (
      numerator: Prisma.Decimal,
      denominator: Prisma.Decimal,
    ): string | null => (denominator.isZero() ? null : numerator.div(denominator).toFixed(4));
    const conversations = integer(row.conversations);
    const contacts = integer(row.contacts);
    const demos = integer(row.demos);
    const sales = integer(row.sales);
    return {
      campaignId: row.id,
      campaignName: row.name,
      platform: row.platform,
      source: row.source,
      currency: row.currency,
      spend: spend.toFixed(2),
      conversations,
      contacts,
      demos,
      sales,
      grossRevenue: gross.toFixed(2),
      netRevenue: net.toFixed(2),
      profit: !canReadProfit || (sales === 0 && net.isZero()) ? null : net.sub(costs).toFixed(2),
      costPerConversation: nullableRatio(spend, new Prisma.Decimal(conversations)),
      costPerContact: nullableRatio(spend, new Prisma.Decimal(contacts)),
      costPerDemo: nullableRatio(spend, new Prisma.Decimal(demos)),
      cpa: nullableRatio(spend, new Prisma.Decimal(sales)),
      grossRoas: nullableRatio(gross, spend),
      netRoas: nullableRatio(net, spend),
      conversationToDemoConversion: conversations
        ? new Prisma.Decimal(demos).div(conversations).mul(100).toFixed(2)
        : null,
      demoToSaleConversion: demos ? new Prisma.Decimal(sales).div(demos).mul(100).toFixed(2) : null,
      conversationToSaleConversion: conversations
        ? new Prisma.Decimal(sales).div(conversations).mul(100).toFixed(2)
        : null,
      averageTicket: sales ? net.div(sales).toFixed(2) : null,
      averageTimeToSaleSeconds:
        row.averageTimeToSaleSeconds === null ? null : Number(row.averageTimeToSaleSeconds),
      unansweredPercentage: null,
      averageFollowUpsBeforePurchase:
        row.averageFollowUps === null ? null : decimalString(row.averageFollowUps),
    };
  }

  async listAttributions(query: MarketingDateQueryDto, user: AuthenticatedUser) {
    const records = await this.prisma.attribution.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(query.from || query.to
          ? {
              acquiredAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lt: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { acquiredAt: 'desc' },
      take: query.limit,
      skip: (query.page - 1) * query.limit,
      include: {
        campaign: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true, country: true } },
      },
    });
    return records.map((record) => ({
      id: record.id,
      kind: record.kind,
      platform: record.platform,
      source: record.source,
      targetedCountry: record.targetedCountry,
      actualCountry: record.actualCountry,
      acquiredAt: record.acquiredAt,
      campaign: record.campaign,
      contact: record.contact,
    }));
  }

  async createAttribution(
    dto: CreateAttributionDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const targetCount = [
      dto.contactId,
      dto.conversationId,
      dto.opportunityId,
      dto.trialId,
      dto.saleId,
    ].filter(Boolean).length;
    if (targetCount !== 1) throw new BadRequestException('MARKETING_ATTRIBUTION_TARGET_REQUIRED');
    if (dto.campaignId) await this.assertCampaign(dto.campaignId, user.organizationId);
    if ((dto.adSetId || dto.adId || dto.creativeId) && !dto.campaignId)
      throw new BadRequestException('MARKETING_CAMPAIGN_REQUIRED');
    if (dto.adSetId)
      await this.assertAdSet(dto.adSetId, dto.campaignId as string, user.organizationId);
    if (dto.adId) await this.assertAd(dto.adId, dto.campaignId as string, user.organizationId);
    if (dto.creativeId)
      await this.assertCreative(dto.creativeId, dto.campaignId as string, user.organizationId);
    if (dto.contactId) await this.assertContact(dto.contactId, user.organizationId);
    if (dto.conversationId) await this.assertConversation(dto.conversationId, user.organizationId);
    if (dto.opportunityId) await this.assertOpportunity(dto.opportunityId, user.organizationId);
    if (dto.trialId) await this.assertTrial(dto.trialId, user.organizationId);
    if (dto.saleId) await this.assertSale(dto.saleId, user.organizationId);
    const existing =
      dto.kind === 'ORIGINAL' && dto.contactId
        ? await this.prisma.attribution.findFirst({
            where: {
              organizationId: user.organizationId,
              contactId: dto.contactId,
              kind: 'ORIGINAL',
              deletedAt: null,
            },
          })
        : null;
    if (existing) throw new ConflictException('MARKETING_ORIGINAL_ATTRIBUTION_EXISTS');
    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.attribution.create({
        data: {
          organizationId: user.organizationId,
          kind: dto.kind,
          ...(dto.contactId ? { contactId: dto.contactId } : {}),
          ...(dto.conversationId ? { conversationId: dto.conversationId } : {}),
          ...(dto.opportunityId ? { opportunityId: dto.opportunityId } : {}),
          ...(dto.trialId ? { trialId: dto.trialId } : {}),
          ...(dto.saleId ? { saleId: dto.saleId } : {}),
          ...(dto.campaignId ? { campaignId: dto.campaignId } : {}),
          ...(dto.adSetId ? { adSetId: dto.adSetId } : {}),
          ...(dto.adId ? { adId: dto.adId } : {}),
          ...(dto.creativeId ? { creativeId: dto.creativeId } : {}),
          platform: dto.platform,
          source: dto.source,
          ...(dto.targetedCountry ? { targetedCountry: dto.targetedCountry.toUpperCase() } : {}),
          ...(dto.actualCountry ? { actualCountry: dto.actualCountry.toUpperCase() } : {}),
          ...(dto.acquiredAt ? { acquiredAt: new Date(dto.acquiredAt) } : {}),
          createdByUserId: user.userId,
          ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
        },
      });
      await this.audit.recordWithClient(tx, {
        organizationId: user.organizationId,
        userId: user.userId,
        action:
          dto.kind === 'ORIGINAL'
            ? 'ORIGINAL_ATTRIBUTION_ASSIGNED'
            : 'CONVERSION_ATTRIBUTION_ASSIGNED',
        tableName: 'Attribution',
        recordId: record.id,
        newValue: {
          kind: record.kind,
          campaignId: record.campaignId,
          platform: record.platform,
          source: record.source,
        },
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
      await this.outbox.enqueueWithClient(tx, {
        eventType:
          dto.kind === 'ORIGINAL' ? 'OriginalAttributionAssigned' : 'ConversionAttributionAssigned',
        organizationId: user.organizationId,
        aggregateType: 'Attribution',
        aggregateId: record.id,
        actorId: user.userId,
        requestId: metadata.requestId ?? record.id,
        payload: { kind: record.kind, campaignId: record.campaignId },
      });
      return record;
    });
    return created;
  }

  async correctAttribution(
    id: string,
    dto: CorrectAttributionDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const correctionReason = dto.correctionReason?.trim();
    if (!correctionReason)
      throw new BadRequestException('MARKETING_ATTRIBUTION_CORRECTION_REASON_REQUIRED');
    if ((dto.adSetId || dto.adId || dto.creativeId) && !dto.campaignId)
      throw new BadRequestException('MARKETING_CAMPAIGN_REQUIRED');
    if (dto.campaignId) await this.assertCampaign(dto.campaignId, user.organizationId);
    if (dto.adSetId)
      await this.assertAdSet(dto.adSetId, dto.campaignId as string, user.organizationId);
    if (dto.adId) await this.assertAd(dto.adId, dto.campaignId as string, user.organizationId);
    if (dto.creativeId)
      await this.assertCreative(dto.creativeId, dto.campaignId as string, user.organizationId);
    const current = await this.prisma.attribution.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null, kind: 'ORIGINAL' },
    });
    if (!current) throw new NotFoundException('MARKETING_ATTRIBUTION_NOT_FOUND');
    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.attribution.update({
        where: { organizationId_id: { organizationId: user.organizationId, id } },
        data: {
          ...(dto.campaignId !== undefined ? { campaignId: dto.campaignId || null } : {}),
          ...(dto.adSetId !== undefined ? { adSetId: dto.adSetId || null } : {}),
          ...(dto.adId !== undefined ? { adId: dto.adId || null } : {}),
          ...(dto.creativeId !== undefined ? { creativeId: dto.creativeId || null } : {}),
          ...(dto.platform ? { platform: dto.platform } : {}),
          ...(dto.source ? { source: dto.source } : {}),
          ...(dto.targetedCountry !== undefined
            ? { targetedCountry: dto.targetedCountry?.toUpperCase() || null }
            : {}),
          ...(dto.actualCountry !== undefined
            ? { actualCountry: dto.actualCountry?.toUpperCase() || null }
            : {}),
          correctionReason,
          correctedAt: new Date(),
          correctedByUserId: user.userId,
          ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
        },
      });
      await this.audit.recordWithClient(tx, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'ORIGINAL_ATTRIBUTION_CORRECTED',
        tableName: 'Attribution',
        recordId: id,
        previousValue: {
          campaignId: current.campaignId,
          platform: current.platform,
          source: current.source,
        },
        newValue: {
          campaignId: record.campaignId,
          platform: record.platform,
          source: record.source,
          reason: record.correctionReason,
        },
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
      await this.outbox.enqueueWithClient(tx, {
        eventType: 'OriginalAttributionCorrected',
        organizationId: user.organizationId,
        aggregateType: 'Attribution',
        aggregateId: id,
        actorId: user.userId,
        requestId: metadata.requestId ?? id,
        payload: { campaignId: record.campaignId, reason: record.correctionReason },
      });
      return record;
    });
    return updated;
  }

  async getProspectState(contactId: string, user: AuthenticatedUser) {
    await this.assertContact(contactId, user.organizationId);
    return this.prisma.prospectConversationState.findUnique({
      where: { organizationId_contactId: { organizationId: user.organizationId, contactId } },
      include: { contact: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async changeProspectState(
    contactId: string,
    dto: ChangeProspectStateDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    await this.assertContact(contactId, user.organizationId);
    const result = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.prospectConversationState.findUnique({
        where: { organizationId_contactId: { organizationId: user.organizationId, contactId } },
      });
      const current = await tx.prospectConversationState.upsert({
        where: { organizationId_contactId: { organizationId: user.organizationId, contactId } },
        update: {
          state: dto.state,
          changedByUserId: user.userId,
          ...(dto.reason ? { changeReason: dto.reason } : {}),
          ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
        },
        create: {
          organizationId: user.organizationId,
          contactId,
          state: dto.state,
          changedByUserId: user.userId,
          ...(dto.reason ? { changeReason: dto.reason } : {}),
          ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
        },
      });
      await tx.prospectConversationStateHistory.create({
        data: {
          organizationId: user.organizationId,
          contactId,
          state: dto.state,
          ...(previous ? { previousState: previous.state } : {}),
          ...(dto.reason ? { reason: dto.reason } : {}),
          source: 'MANUAL',
          changedByUserId: user.userId,
          ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
        },
      });
      await this.audit.recordWithClient(tx, {
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'PROSPECT_STATE_CHANGED',
        tableName: 'ProspectConversationState',
        recordId: current.id,
        previousValue: previous ? { state: previous.state } : undefined,
        newValue: { state: current.state, reason: dto.reason },
        ip: metadata.ipAddress,
        requestId: metadata.requestId,
      });
      await this.outbox.enqueueWithClient(tx, {
        eventType: 'ProspectStateChanged',
        organizationId: user.organizationId,
        aggregateType: 'Contact',
        aggregateId: contactId,
        actorId: user.userId,
        requestId: metadata.requestId ?? current.id,
        payload: { state: current.state, previousState: previous?.state ?? null },
      });
      return current;
    });
    return result;
  }

  async listLossReasons(type: ProspectReasonType | undefined, user: AuthenticatedUser) {
    return this.prisma.lossReason.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        active: true,
        ...(type ? { type } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createLossReason(
    dto: CreateLossReasonDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const reason = await this.prisma.lossReason.create({
      data: {
        organizationId: user.organizationId,
        type: dto.type,
        systemKey: dto.systemKey.toUpperCase(),
        name: dto.name.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'LOSS_REASON_CREATED',
      tableName: 'LossReason',
      recordId: reason.id,
      newValue: { type: reason.type, systemKey: reason.systemKey, name: reason.name },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return reason;
  }

  async updateLossReason(
    id: string,
    dto: UpdateLossReasonDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const reason = await this.prisma.lossReason.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!reason) throw new NotFoundException('LOSS_REASON_NOT_FOUND');
    const updated = await this.prisma.lossReason.update({
      where: { organizationId_id: { organizationId: user.organizationId, id } },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'LOSS_REASON_UPDATED',
      tableName: 'LossReason',
      recordId: id,
      previousValue: { name: reason.name, active: reason.active },
      newValue: { name: updated.name, active: updated.active },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return updated;
  }

  async createProspectReason(
    dto: CreateProspectReasonDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const targetCount = [dto.contactId, dto.conversationId, dto.opportunityId].filter(
      Boolean,
    ).length;
    if (targetCount !== 1) throw new BadRequestException('MARKETING_REASON_TARGET_REQUIRED');
    const reason = await this.prisma.lossReason.findFirst({
      where: {
        id: dto.reasonId,
        organizationId: user.organizationId,
        deletedAt: null,
        active: true,
      },
    });
    if (!reason) throw new NotFoundException('LOSS_REASON_NOT_FOUND');
    if (dto.contactId) await this.assertContact(dto.contactId, user.organizationId);
    if (dto.conversationId) await this.assertConversation(dto.conversationId, user.organizationId);
    if (dto.opportunityId) await this.assertOpportunity(dto.opportunityId, user.organizationId);
    const event = await this.prisma.prospectReason.create({
      data: {
        organizationId: user.organizationId,
        reasonId: dto.reasonId,
        ...(dto.contactId ? { contactId: dto.contactId } : {}),
        ...(dto.conversationId ? { conversationId: dto.conversationId } : {}),
        ...(dto.opportunityId ? { opportunityId: dto.opportunityId } : {}),
        ...(dto.note ? { note: dto.note } : {}),
        createdByUserId: user.userId,
        ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
      },
      include: { reason: true },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'LOSS_REASON_RECORDED',
      tableName: 'ProspectReason',
      recordId: event.id,
      newValue: {
        reasonId: event.reasonId,
        type: reason.type,
        contactId: event.contactId,
        opportunityId: event.opportunityId,
      },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    await this.outbox.enqueue({
      eventType: 'LossReasonRecorded',
      organizationId: user.organizationId,
      aggregateType: 'ProspectReason',
      aggregateId: event.id,
      actorId: user.userId,
      requestId: metadata.requestId ?? event.id,
      payload: { reasonId: event.reasonId, type: reason.type },
    });
    return event;
  }

  async getEngagementConfig(user: AuthenticatedUser) {
    return this.prisma.prospectEngagementConfig.upsert({
      where: { organizationId: user.organizationId },
      update: {},
      create: {
        organizationId: user.organizationId,
        slaFirstResponseThresholdMinutes: 15,
        cadenceDays: [2, 4, 7, 14, 30],
        maxUnansweredAttempts: 3,
      },
    });
  }

  async updateEngagementConfig(
    dto: UpdateEngagementConfigDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    let cadence: unknown;
    try {
      cadence = JSON.parse(dto.cadenceDays) as unknown;
    } catch {
      throw new BadRequestException('MARKETING_CADENCE_INVALID');
    }
    if (
      !Array.isArray(cadence) ||
      cadence.some((item) => typeof item !== 'number' || item < 1 || item > 365)
    )
      throw new BadRequestException('MARKETING_CADENCE_INVALID');
    const updated = await this.prisma.prospectEngagementConfig.upsert({
      where: { organizationId: user.organizationId },
      update: {
        slaFirstResponseThresholdMinutes: dto.slaFirstResponseThresholdMinutes,
        cadenceDays: jsonObject(cadence),
        maxUnansweredAttempts: dto.maxUnansweredAttempts,
      },
      create: {
        organizationId: user.organizationId,
        slaFirstResponseThresholdMinutes: dto.slaFirstResponseThresholdMinutes,
        cadenceDays: jsonObject(cadence),
        maxUnansweredAttempts: dto.maxUnansweredAttempts,
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'MARKETING_ENGAGEMENT_CONFIG_UPDATED',
      tableName: 'ProspectEngagementConfig',
      recordId: updated.id,
      newValue: {
        slaFirstResponseThresholdMinutes: updated.slaFirstResponseThresholdMinutes,
        cadenceDays: updated.cadenceDays,
        maxUnansweredAttempts: updated.maxUnansweredAttempts,
      },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    return updated;
  }

  async previewImport(dto: CommercialImportDto, user: AuthenticatedUser) {
    const records = parseCsv(dto.csv);
    const errors = records
      .slice(0, 100)
      .flatMap((record, index) => this.validateImportRow(dto.type, record, index + 2));
    return {
      type: dto.type,
      rows: records.length,
      preview: records.slice(0, 20),
      errors,
      dryRun: true,
      organizationId: user.organizationId,
    };
  }

  async executeImport(
    dto: CommercialImportDto,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const existing = await this.prisma.commercialImport.findFirst({
      where: { organizationId: user.organizationId, idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return existing;
    const records = parseCsv(dto.csv);
    const validationErrors = records.flatMap((record, index) =>
      this.validateImportRow(dto.type, record, index + 2),
    );
    const report = {
      errors: validationErrors.slice(0, 1000),
      supported: ['CONTACTS', 'ATTRIBUTION'],
    };
    if (validationErrors.length > 0)
      throw new BadRequestException({ code: 'COMMERCIAL_IMPORT_INVALID', ...report });
    const created = await this.prisma.$transaction(async (tx) => {
      const imported = await tx.commercialImport.create({
        data: {
          organizationId: user.organizationId,
          createdByUserId: user.userId,
          type: dto.type,
          status: 'PROCESSING',
          idempotencyKey: dto.idempotencyKey,
          ...(dto.fileName ? { fileName: dto.fileName } : {}),
          rowCount: records.length,
          ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
          report: report as Prisma.InputJsonObject,
        },
      });
      for (const [index, record] of records.entries())
        await tx.commercialImportRow.create({
          data: {
            organizationId: user.organizationId,
            importId: imported.id,
            rowNumber: index + 2,
            payload: record as Prisma.InputJsonObject,
          },
        });
      return imported;
    });
    let succeeded = 0;
    let failed = 0;
    for (const [index, record] of records.entries()) {
      try {
        if (dto.type === 'CONTACTS') await this.importContact(record, user, metadata);
        else if (dto.type === 'ATTRIBUTION') await this.importAttribution(record, user, metadata);
        else
          throw new BadRequestException(
            'COMMERCIAL_IMPORT_TYPE_NOT_SUPPORTED_WITHOUT_REQUIRED_SNAPSHOT',
          );
        succeeded += 1;
        await this.prisma.commercialImportRow.updateMany({
          where: {
            organizationId: user.organizationId,
            importId: created.id,
            rowNumber: index + 2,
          },
          data: { status: 'SUCCEEDED' },
        });
      } catch (error: unknown) {
        failed += 1;
        await this.prisma.commercialImportRow.updateMany({
          where: {
            organizationId: user.organizationId,
            importId: created.id,
            rowNumber: index + 2,
          },
          data: {
            status: 'FAILED',
            errorMessage: error instanceof Error ? error.message : 'Error de importación',
          },
        });
      }
    }
    const status = failed > 0 ? 'FAILED' : 'COMPLETED';
    const completed = await this.prisma.commercialImport.update({
      where: { organizationId_id: { organizationId: user.organizationId, id: created.id } },
      data: {
        status,
        succeededCount: succeeded,
        failedCount: failed,
        report: { ...report, succeeded, failed },
      },
    });
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'COMMERCIAL_IMPORT_COMPLETED',
      tableName: 'CommercialImport',
      recordId: created.id,
      newValue: { type: dto.type, succeeded, failed },
      ip: metadata.ipAddress,
      requestId: metadata.requestId,
    });
    await this.outbox.enqueue({
      eventType: 'CommercialImportCompleted',
      organizationId: user.organizationId,
      aggregateType: 'CommercialImport',
      aggregateId: created.id,
      actorId: user.userId,
      requestId: metadata.requestId ?? created.id,
      payload: { type: dto.type, succeeded, failed },
    });
    return completed;
  }

  async listImports(user: AuthenticatedUser) {
    return this.prisma.commercialImport.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private validateImportRow(
    type: CommercialImportDto['type'],
    record: CsvRecord,
    row: number,
  ): string[] {
    if (
      type === 'CONTACTS' &&
      !record.email &&
      !record.phone &&
      !record.firstname &&
      !record.first_name &&
      !record.lastname &&
      !record.last_name
    )
      return [`Fila ${row}: se requiere email, phone o nombre.`];
    if (
      type === 'ATTRIBUTION' &&
      (!record.contactid || !record.campaignid || !record.platform || !record.source)
    )
      return [`Fila ${row}: contactId, campaignId, platform y source son obligatorios.`];
    return [];
  }

  private async importContact(
    record: CsvRecord,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const phone = record.phone?.trim();
    const country = record.country?.trim().toUpperCase();
    const parsed = phone ? parsePhoneNumberFromString(phone, country as CountryCode) : undefined;
    if (phone && !parsed?.isValid()) throw new BadRequestException('CONTACT_INVALID_PHONE');
    const phoneNormalized = parsed?.number;
    if (phoneNormalized) {
      const existing = await this.prisma.contact.findFirst({
        where: { organizationId: user.organizationId, phoneNormalized, deletedAt: null },
      });
      if (existing) throw new ConflictException('CONTACT_PHONE_ALREADY_EXISTS');
    }
    const contact = await this.prisma.contact.create({
      data: {
        organizationId: user.organizationId,
        firstName: record.firstname ?? record.first_name ?? null,
        lastName: record.lastname ?? record.last_name ?? null,
        email: record.email?.trim().toLowerCase() || null,
        phone: phone || null,
        phoneNormalized: phoneNormalized ?? null,
        country: country || null,
        source: record.source || 'IMPORT',
      },
    });
    await this.outbox.enqueue({
      eventType: 'ContactImported',
      organizationId: user.organizationId,
      aggregateType: 'Contact',
      aggregateId: contact.id,
      actorId: user.userId,
      requestId: metadata.requestId ?? contact.id,
      payload: { contactId: contact.id, source: 'IMPORT' },
    });
  }

  private async importAttribution(
    record: CsvRecord,
    user: AuthenticatedUser,
    metadata: MarketingRequestMetadata,
  ) {
    const contactId = record.contactid;
    const campaignId = record.campaignid;
    const platform = record.platform;
    const source = record.source;
    if (!contactId || !campaignId || !platform || !source)
      throw new BadRequestException('MARKETING_ATTRIBUTION_IMPORT_ROW_INVALID');
    await this.createAttribution(
      {
        kind: 'ORIGINAL',
        contactId,
        campaignId,
        platform,
        source,
        ...(record.targetedcountry ? { targetedCountry: record.targetedcountry } : {}),
        ...(record.actualcountry ? { actualCountry: record.actualcountry } : {}),
      },
      user,
      metadata,
    );
  }

  private async assertCampaign(id: string, organizationId: string) {
    const record = await this.prisma.campaign.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundException('MARKETING_CAMPAIGN_NOT_FOUND');
    return record;
  }

  private async assertAdSet(id: string, campaignId: string, organizationId: string) {
    const record = await this.prisma.marketingAdSet.findFirst({
      where: { id, campaignId, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundException('MARKETING_AD_SET_NOT_FOUND');
    return record;
  }

  private async assertAd(id: string, campaignId: string, organizationId: string) {
    const record = await this.prisma.marketingAd.findFirst({
      where: { id, campaignId, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundException('MARKETING_AD_NOT_FOUND');
    return record;
  }

  private async assertCreative(id: string, campaignId: string, organizationId: string) {
    const record = await this.prisma.marketingCreative.findFirst({
      where: { id, campaignId, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundException('MARKETING_CREATIVE_NOT_FOUND');
    return record;
  }

  private async assertContact(id: string, organizationId: string) {
    const record = await this.prisma.contact.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundException('CONTACT_NOT_FOUND');
    return record;
  }

  private async assertOpportunity(id: string, organizationId: string) {
    const record = await this.prisma.opportunity.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundException('OPPORTUNITY_NOT_FOUND');
    return record;
  }

  private async assertConversation(id: string, organizationId: string) {
    const record = await this.prisma.whatsAppConversation.findFirst({
      where: { id, organizationId },
    });
    if (!record) throw new NotFoundException('WHATSAPP_CONVERSATION_NOT_FOUND');
    return record;
  }

  private async assertTrial(id: string, organizationId: string) {
    const record = await this.prisma.trial.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundException('TRIAL_NOT_FOUND');
    return record;
  }

  private async assertSale(id: string, organizationId: string) {
    const record = await this.prisma.sale.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!record) throw new NotFoundException('SALE_NOT_FOUND');
    return record;
  }

  private async assertUser(id: string | undefined, organizationId: string) {
    if (!id) return;
    const record = await this.prisma.user.findFirst({
      where: { id, organizationId, status: 'ACTIVE', deletedAt: null },
    });
    if (!record) throw new ForbiddenException('MARKETING_ASSIGNEE_NOT_FOUND');
  }
}
