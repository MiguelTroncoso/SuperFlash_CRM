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

  enqueueWithClient(client: OutboxClient, input: OutboxEventInput): Promise<{ id: string }> {
    return client.outboxEvent.create({
      data: {
        eventType: input.eventType,
        organizationId: input.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actorId: input.actorId ?? null,
        requestId: input.requestId,
        occurredAt: input.occurredAt ?? new Date(),
        payload: input.payload,
      },
      select: { id: true },
    });
  }
}
