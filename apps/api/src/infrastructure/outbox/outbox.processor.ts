import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ApplicationEventBus, CommercialEventName } from '../events/application-event-bus';
import { PrismaService } from '../prisma/prisma.service';

interface ClaimedOutboxEvent {
  id: string;
  eventType: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  actorId: string | null;
  requestId: string;
  deduplicationKey: string | null;
  occurredAt: Date;
  payload: Prisma.JsonValue;
  attempts: number;
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class OutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessor.name);
  private interval: NodeJS.Timeout | undefined;
  private running = false;
  private shuttingDown = false;
  private activeRun: Promise<void> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ApplicationEventBus,
  ) {}

  onModuleInit(): void {
    void this.processAvailable();
    this.interval = setInterval(() => void this.processAvailable(), 1_000);
    this.interval.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.interval) clearInterval(this.interval);
    await this.activeRun;
  }

  async processAvailable(): Promise<void> {
    if (this.running || this.shuttingDown) return;
    this.running = true;
    const run = this.processBatch();
    this.activeRun = run;
    try {
      await run;
    } finally {
      if (this.activeRun === run) this.activeRun = undefined;
      this.running = false;
    }
  }

  private async processBatch(): Promise<void> {
    try {
      const claimed = await this.claimBatch();
      for (const event of claimed) await this.dispatch(event);
    } catch (error: unknown) {
      this.logger.error(error instanceof Error ? error.message : 'Outbox processing failed');
    }
  }

  private async claimBatch(): Promise<ClaimedOutboxEvent[]> {
    const now = new Date();
    const staleAt = new Date(now.getTime() - 5 * 60 * 1_000);
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<ClaimedOutboxEvent[]>(Prisma.sql`
        SELECT "id", "eventType", "organizationId", "aggregateType", "aggregateId", "actorId",
               "requestId", "deduplicationKey", "occurredAt", "payload", "attempts"
        FROM "OutboxEvent"
        WHERE ("status" IN ('PENDING', 'FAILED') AND "availableAt" <= ${now})
           OR ("status" = 'PROCESSING' AND "processingAt" < ${staleAt})
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 20
      `);
      if (rows.length > 0) {
        await transaction.outboxEvent.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { status: 'PROCESSING', processingAt: now, attempts: { increment: 1 } },
        });
      }
      return rows;
    });
  }

  private async dispatch(event: ClaimedOutboxEvent): Promise<void> {
    try {
      if (!isJsonObject(event.payload)) throw new Error('Outbox payload must be a JSON object');
      await this.events.publishAsync(event.eventType as CommercialEventName, {
        eventId: event.id,
        occurredAt: event.occurredAt,
        organizationId: event.organizationId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        actorUserId: event.actorId ?? 'system',
        requestId: event.requestId,
        payload: event.payload,
      });
      await this.prisma.outboxEvent.updateMany({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date(), processingAt: null, lastError: null },
      });
    } catch (error: unknown) {
      const attempts = Math.min(10, event.attempts + 1);
      const delaySeconds = Math.min(300, 2 ** Math.min(8, attempts));
      const availableAt = new Date(Date.now() + delaySeconds * 1_000);
      await this.prisma.outboxEvent.updateMany({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          availableAt,
          processingAt: null,
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown error',
        },
      });
      this.logger.error(`Outbox event ${event.id} failed`);
    }
  }
}
