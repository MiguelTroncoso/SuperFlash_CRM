import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AppConfiguration } from '../../config/configuration';
import { RenewalIntelligenceService } from './renewal-intelligence.service';

@Injectable()
export class RenewalReminderProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenewalReminderProcessor.name);
  private interval: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly service: RenewalIntelligenceService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.getOrThrow<AppConfiguration>('app').nodeEnv === 'test') return;
    void this.process();
    this.interval = setInterval(() => void this.process(), 60_000);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private async process(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const organizations = await this.prisma.organization.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      for (const organization of organizations) {
        const actor = await this.prisma.user.findFirst({
          where: { organizationId: organization.id, status: 'ACTIVE', deletedAt: null },
          select: { id: true },
        });
        if (!actor) continue;
        await this.service.generateReminders(
          {
            userId: actor.id,
            organizationId: organization.id,
            sessionId: randomUUID(),
            roleId: randomUUID(),
            roleName: 'Owner',
            permissions: ['renewals.read'],
          },
          `renewal-scheduler:${dateKey(new Date())}`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        error instanceof Error ? error.message : 'Renewal reminder scheduler failed',
      );
    } finally {
      this.running = false;
    }
  }
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}
