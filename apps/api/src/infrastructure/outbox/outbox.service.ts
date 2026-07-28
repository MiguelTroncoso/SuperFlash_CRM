import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface OutboxEventInput {
  eventType: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  actorId?: string | null;
  requestId: string;
  deduplicationKey?: string;
  occurredAt?: Date;
  payload: Prisma.InputJsonObject;
}

export type OutboxClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  enqueue(input: OutboxEventInput): Promise<{ id: string }> {
    return this.enqueueWithClient(this.prisma, input);
  }

  async enqueueWithClient(client: OutboxClient, input: OutboxEventInput): Promise<{ id: string }> {
    const deduplicationKey =
      input.deduplicationKey ??
      `${input.eventType}:${input.aggregateType}:${input.aggregateId}:${input.requestId}`;
    try {
      return await client.outboxEvent.create({
        data: {
          eventType: input.eventType,
          organizationId: input.organizationId,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          actorId: input.actorId ?? null,
          requestId: input.requestId,
          deduplicationKey,
          occurredAt: input.occurredAt ?? new Date(),
          payload: input.payload,
        },
        select: { id: true },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await client.outboxEvent.findUnique({
          where: {
            organizationId_deduplicationKey: {
              organizationId: input.organizationId,
              deduplicationKey,
            },
          },
          select: { id: true },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }
}
