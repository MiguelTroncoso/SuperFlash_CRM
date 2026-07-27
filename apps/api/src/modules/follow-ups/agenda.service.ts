import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime, IANAZone } from 'luxon';
import { FollowUpPriority, FollowUpStatus, Prisma } from '@prisma/client';

import { AppConfiguration } from '../../config/configuration';
import { AuthenticatedUser } from '../auth/auth.types';
import { FollowUpAccessPolicy } from './access/followup-access.policy';
import { FOLLOW_UP_ERROR_CODES, followUpException } from './followups.errors';
import { FollowUpsRepository } from './followups.repository';
import { FollowUpsService, PublicFollowUp } from './followups.service';
import { AgendaQueryDto } from './dto/agenda-query.dto';
import { AgendaSummaryQueryDto } from './dto/agenda-summary-query.dto';

interface DayWindow {
  date: string;
  timezone: string;
  start: DateTime;
  end: DateTime;
}

@Injectable()
export class AgendaService {
  private readonly configuration: AppConfiguration;

  constructor(
    private readonly repository: FollowUpsRepository,
    private readonly followUps: FollowUpsService,
    private readonly accessPolicy: FollowUpAccessPolicy,
    configService: ConfigService,
  ) {
    this.configuration = configService.getOrThrow<AppConfiguration>('app');
  }

  async getAgenda(query: AgendaQueryDto, user: AuthenticatedUser): Promise<AgendaResponse> {
    this.accessPolicy.assertCanRead(user);
    const window = this.dayWindow(query.date, query.timezone);
    const where = this.agendaWhere(query, user, window);
    const [records, total, pending, completed, cancelled, rescheduled, overdueAtStartOfDay] =
      await Promise.all([
        this.repository.findForList(
          user.organizationId,
          where,
          [{ dueAt: 'asc' }, { id: 'asc' }],
          0,
          100,
        ),
        this.repository.count(user.organizationId, where),
        this.countStatus(user, window, FollowUpStatus.PENDING, query),
        this.countStatus(user, window, FollowUpStatus.COMPLETED, query),
        this.countStatus(user, window, FollowUpStatus.CANCELLED, query),
        this.countStatus(user, window, FollowUpStatus.RESCHEDULED, query),
        this.repository.count(
          user.organizationId,
          this.combine(this.accessPolicy.listWhere(user), {
            archivedAt: null,
            status: FollowUpStatus.PENDING,
            dueAt: { lt: window.start.toUTC().toJSDate() },
            ...(query.assignedUserId && user.roleName !== 'Sales'
              ? { userId: query.assignedUserId }
              : {}),
          }),
        ),
      ]);
    return {
      date: window.date,
      timezone: window.timezone,
      data: records.map((record) => this.followUps.toPublic(record)),
      summary: { total, pending, completed, cancelled, rescheduled, overdueAtStartOfDay },
    };
  }

  async getSummary(
    query: AgendaSummaryQueryDto,
    user: AuthenticatedUser,
  ): Promise<AgendaSummaryResponse> {
    this.accessPolicy.assertCanRead(user);
    const timezone = this.validTimezone(query.timezone);
    const today = DateTime.now().setZone(timezone).startOf('day');
    const from = this.parseDate(query.dateFrom ?? today.toISODate() ?? '', timezone);
    const to = this.parseDate(query.dateTo ?? from.toISODate() ?? '', timezone);
    const days = Math.floor(to.diff(from, 'days').days) + 1;
    if (days < 1 || days > 90) {
      throw followUpException(
        HttpStatus.BAD_REQUEST,
        FOLLOW_UP_ERROR_CODES.AGENDA_INVALID_RANGE,
        'El rango de agenda debe tener entre 1 y 90 días.',
      );
    }
    const result = await Promise.all(
      Array.from({ length: days }, (_, index) =>
        this.daySummary(user, from.plus({ days: index }), query),
      ),
    );
    return { days: result };
  }

  private async daySummary(
    user: AuthenticatedUser,
    day: DateTime,
    query: AgendaSummaryQueryDto,
  ): Promise<AgendaDaySummary> {
    const start = day.startOf('day').toUTC().toJSDate();
    const end = day.plus({ days: 1 }).startOf('day').toUTC().toJSDate();
    const base = this.combine(this.accessPolicy.listWhere(user), {
      archivedAt: null,
      dueAt: { gte: start, lt: end },
      ...(query.assignedUserId && user.roleName !== 'Sales'
        ? { userId: query.assignedUserId }
        : {}),
    });
    const [total, pending, completed, cancelled, rescheduled, urgent, overdue] = await Promise.all([
      this.repository.count(user.organizationId, base),
      this.repository.count(user.organizationId, { ...base, status: FollowUpStatus.PENDING }),
      this.repository.count(user.organizationId, { ...base, status: FollowUpStatus.COMPLETED }),
      this.repository.count(user.organizationId, { ...base, status: FollowUpStatus.CANCELLED }),
      this.repository.count(user.organizationId, { ...base, status: FollowUpStatus.RESCHEDULED }),
      this.repository.count(user.organizationId, {
        ...base,
        status: FollowUpStatus.PENDING,
        priority: FollowUpPriority.URGENT,
      }),
      this.repository.count(
        user.organizationId,
        this.combine(this.accessPolicy.listWhere(user), {
          archivedAt: null,
          status: FollowUpStatus.PENDING,
          dueAt: { lt: start },
        }),
      ),
    ]);
    return {
      date: day.toISODate() ?? '',
      total,
      pending,
      completed,
      cancelled,
      rescheduled,
      urgent,
      overdue,
    };
  }

  private async countStatus(
    user: AuthenticatedUser,
    window: DayWindow,
    status: FollowUpStatus,
    query: AgendaQueryDto,
  ): Promise<number> {
    return this.repository.count(
      user.organizationId,
      this.combine(this.accessPolicy.listWhere(user), {
        archivedAt: null,
        status,
        dueAt: { gte: window.start.toUTC().toJSDate(), lt: window.end.toUTC().toJSDate() },
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.assignedUserId && user.roleName !== 'Sales'
          ? { userId: query.assignedUserId }
          : {}),
      }),
    );
  }

  private agendaWhere(
    query: AgendaQueryDto,
    user: AuthenticatedUser,
    window: DayWindow,
  ): Prisma.FollowUpWhereInput {
    return this.combine(this.accessPolicy.listWhere(user), {
      archivedAt: null,
      dueAt: { gte: window.start.toUTC().toJSDate(), lt: window.end.toUTC().toJSDate() },
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedUserId && user.roleName !== 'Sales'
        ? { userId: query.assignedUserId }
        : {}),
    });
  }

  private combine(...where: Prisma.FollowUpWhereInput[]): Prisma.FollowUpWhereInput {
    return { AND: where };
  }

  private dayWindow(date: string | undefined, timezone: string | undefined): DayWindow {
    const validTimezone = this.validTimezone(timezone);
    const dateTime = date
      ? this.parseDate(date, validTimezone)
      : DateTime.now().setZone(validTimezone).startOf('day');
    return {
      date: dateTime.toISODate() ?? '',
      timezone: validTimezone,
      start: dateTime.startOf('day'),
      end: dateTime.plus({ days: 1 }).startOf('day'),
    };
  }

  private parseDate(value: string, timezone: string): DateTime {
    const result = DateTime.fromISO(value, { zone: timezone });
    if (!result.isValid || result.toISODate() !== value) {
      throw followUpException(
        HttpStatus.BAD_REQUEST,
        FOLLOW_UP_ERROR_CODES.AGENDA_INVALID_DATE,
        'La fecha de agenda no es válida.',
      );
    }
    return result;
  }

  private validTimezone(timezone: string | undefined): string {
    const value = timezone?.trim() || this.configuration.defaultTimezone;
    if (!IANAZone.isValidZone(value)) {
      throw followUpException(
        HttpStatus.BAD_REQUEST,
        FOLLOW_UP_ERROR_CODES.AGENDA_INVALID_TIMEZONE,
        'La zona horaria no es válida.',
      );
    }
    return value;
  }
}

export interface AgendaResponse {
  date: string;
  timezone: string;
  data: PublicFollowUp[];
  summary: {
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
    rescheduled: number;
    overdueAtStartOfDay: number;
  };
}

export interface AgendaDaySummary {
  date: string;
  total: number;
  pending: number;
  completed: number;
  cancelled: number;
  rescheduled: number;
  urgent: number;
  overdue: number;
}

export interface AgendaSummaryResponse {
  days: AgendaDaySummary[];
}
