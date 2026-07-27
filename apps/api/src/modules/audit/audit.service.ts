import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface AuditRecordInput {
  organizationId?: string | undefined;
  userId?: string | undefined;
  action: string;
  tableName: string;
  recordId: string;
  previousValue?: Prisma.InputJsonValue | undefined;
  newValue?: Prisma.InputJsonValue | undefined;
  ip?: string | undefined;
}

type AuditClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.recordWithClient(this.prisma, input);
  }

  async recordWithClient(client: AuditClient, input: AuditRecordInput): Promise<void> {
    await client.auditLog.create({
      data: {
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        action: input.action,
        tableName: input.tableName,
        recordId: input.recordId,
        ...(input.previousValue !== undefined ? { previousValue: input.previousValue } : {}),
        ...(input.newValue !== undefined ? { newValue: input.newValue } : {}),
        ...(input.ip ? { ip: input.ip } : {}),
      },
    });
  }

  async recordSecurity(input: {
    organizationId?: string | undefined;
    userId?: string | undefined;
    action: string;
    recordId: string;
    ip?: string | undefined;
    metadata?: Prisma.InputJsonValue | undefined;
  }): Promise<void> {
    await this.record({
      organizationId: input.organizationId,
      userId: input.userId,
      action: input.action,
      tableName: 'Auth',
      recordId: input.recordId,
      newValue: input.metadata,
      ip: input.ip,
    });
  }
}
