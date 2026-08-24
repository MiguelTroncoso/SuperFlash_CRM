import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ExchangeRatesService } from './exchange-rates.service';

/** Lock TTL: 10 minutes. Prevents duplicate execution across multiple API instances. */
const LOCK_TTL_MS = 10 * 60 * 1000;
/** Lock key stored in FxSchedulerLock table */
const LOCK_KEY = 'fx_weekly_refresh';

@Injectable()
export class FxSchedulerService {
  private readonly logger = new Logger(FxSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: ExchangeRatesService,
  ) {}

  /**
   * Weekly FX rate refresh — runs every Monday at 03:00 UTC.
   * Uses a DB-level advisory lock to prevent duplicate execution when
   * multiple API instances are running.
   */
  @Cron('0 3 * * 1', { name: 'fx_weekly_refresh', timeZone: 'UTC' })
  async weeklyRefresh(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    const acquired = await this.acquireLock();
    if (!acquired) {
      this.logger.log('FX weekly refresh: lock already held by another instance, skipping.');
      return;
    }

    try {
      this.logger.log('FX weekly refresh: starting for all organizations...');
      const orgs = await this.prisma.organization.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });

      let successCount = 0;
      let failCount = 0;

      for (const org of orgs) {
        try {
          const result = await this.fx.refreshRates(org.id);
          this.logger.log(
            `FX weekly refresh: org ${org.id} — ${result.updatedCount} currencies, source=${result.source}`,
          );
          successCount++;
        } catch (err: unknown) {
          this.logger.error(
            `FX weekly refresh: org ${org.id} failed — ${err instanceof Error ? err.message : String(err)}`,
          );
          failCount++;
        }
      }

      this.logger.log(
        `FX weekly refresh: complete. orgs=${orgs.length}, success=${successCount}, fail=${failCount}`,
      );
    } finally {
      await this.releaseLock();
    }
  }

  /** Acquire distributed lock. Returns true if acquired, false if already held. */
  async acquireLock(): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
    try {
      const existing = await this.prisma.fxSchedulerLock.findUnique({
        where: { key: LOCK_KEY },
      });
      if (existing && existing.expiresAt > now) {
        return false;
      }
      await this.prisma.fxSchedulerLock.upsert({
        where: { key: LOCK_KEY },
        update: { acquiredAt: now, expiresAt, instanceId: process.env.HOSTNAME ?? 'unknown' },
        create: {
          key: LOCK_KEY,
          acquiredAt: now,
          expiresAt,
          instanceId: process.env.HOSTNAME ?? 'unknown',
        },
      });
      return true;
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to acquire FX scheduler lock: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  async releaseLock(): Promise<void> {
    try {
      await this.prisma.fxSchedulerLock.deleteMany({ where: { key: LOCK_KEY } });
    } catch {
      // Non-critical
    }
  }

  /** Expose schedule metadata for the /exchange-rates/scheduler-status endpoint. */
  async getStatus() {
    const lastRun = await this.prisma.fxSchedulerLock.findUnique({
      where: { key: LOCK_KEY },
    });
    const latestRate = await this.prisma.exchangeRate.findFirst({
      orderBy: { capturedAt: 'desc' },
      select: { capturedAt: true, provider: true },
    });
    const rateCount = await this.prisma.exchangeRate.count();

    // Calculate next Monday 03:00 UTC
    const now = new Date();
    const nextRun = new Date(now);
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
    const daysUntilMonday = (8 - (dayOfWeek === 0 ? 7 : dayOfWeek)) % 7 || 7;
    // If today is Monday and before 03:00 UTC, next run is today at 03:00 UTC
    if (dayOfWeek === 1 && now.getUTCHours() < 3) {
      nextRun.setUTCHours(3, 0, 0, 0);
    } else {
      nextRun.setUTCDate(now.getUTCDate() + daysUntilMonday);
      nextRun.setUTCHours(3, 0, 0, 0);
    }

    return {
      schedule: '0 3 * * 1',
      frequency: 'weekly',
      timezone: 'UTC',
      nextRunAt: nextRun.toISOString(),
      lastLockAcquiredAt: lastRun?.acquiredAt?.toISOString() ?? null,
      lastRateUpdate: latestRate?.capturedAt?.toISOString() ?? null,
      lastProvider: latestRate?.provider ?? null,
      currenciesConfigured: rateCount,
    };
  }
}
