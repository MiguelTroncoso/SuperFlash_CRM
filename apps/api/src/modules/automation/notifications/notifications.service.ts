import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/auth.types';
import { ListNotificationsQueryDto } from '../dto/list-notifications-query.dto';
import { asInputJson } from '../automation.types';

export const NOTIFICATION_ERROR_CODES = { NOT_FOUND: 'NOTIFICATION_NOT_FOUND' } as const;

function notificationError(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ statusCode: status, code, message }, status);
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: ListNotificationsQueryDto,
    user: AuthenticatedUser,
  ): Promise<{
    data: Record<string, unknown>[];
    pagination: Record<string, number>;
    unread: number;
  }> {
    const where: Prisma.NotificationWhereInput = {
      organizationId: user.organizationId,
      userId: user.userId,
      ...(query.status
        ? { status: query.status }
        : { status: { not: NotificationStatus.ARCHIVED } }),
    };
    const skip = (query.page - 1) * query.limit;
    const [records, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          organizationId: user.organizationId,
          userId: user.userId,
          status: NotificationStatus.UNREAD,
        },
      }),
    ]);
    return {
      data: records.map((record) => this.toPublic(record)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      unread,
    };
  }

  async read(
    id: string,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<Record<string, unknown>> {
    const updated = await this.prisma.notification.updateMany({
      where: {
        organizationId: user.organizationId,
        userId: user.userId,
        id,
        status: NotificationStatus.UNREAD,
      },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { organizationId: user.organizationId, userId: user.userId, id },
      });
      if (!exists)
        throw notificationError(
          HttpStatus.NOT_FOUND,
          NOTIFICATION_ERROR_CODES.NOT_FOUND,
          'La notificación no existe.',
        );
    }
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'NOTIFICATION_READ',
      tableName: 'Notification',
      recordId: id,
      requestId,
    });
    const record = await this.prisma.notification.findFirst({
      where: { organizationId: user.organizationId, userId: user.userId, id },
    });
    return record ? this.toPublic(record) : {};
  }

  async archive(id: string, user: AuthenticatedUser, requestId?: string): Promise<void> {
    const updated = await this.prisma.notification.updateMany({
      where: {
        organizationId: user.organizationId,
        userId: user.userId,
        id,
        status: { not: NotificationStatus.ARCHIVED },
      },
      data: { status: NotificationStatus.ARCHIVED, archivedAt: new Date() },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { organizationId: user.organizationId, userId: user.userId, id },
      });
      if (!exists)
        throw notificationError(
          HttpStatus.NOT_FOUND,
          NOTIFICATION_ERROR_CODES.NOT_FOUND,
          'La notificación no existe.',
        );
    }
    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.userId,
      action: 'NOTIFICATION_ARCHIVED',
      tableName: 'Notification',
      recordId: id,
      requestId,
    });
  }

  async readAll(user: AuthenticatedUser, requestId?: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        organizationId: user.organizationId,
        userId: user.userId,
        status: NotificationStatus.UNREAD,
      },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
    if (result.count > 0) {
      await this.audit.record({
        organizationId: user.organizationId,
        userId: user.userId,
        action: 'NOTIFICATIONS_READ_ALL',
        tableName: 'Notification',
        recordId: user.userId,
        newValue: asInputJson({ updated: result.count }),
        requestId,
      });
    }
    return { updated: result.count };
  }

  private toPublic(record: {
    id: string;
    type: string;
    title: string;
    body: string;
    status: NotificationStatus;
    actionUrl: string | null;
    metadata: Prisma.JsonValue | null;
    readAt: Date | null;
    archivedAt: Date | null;
    createdAt: Date;
  }): Record<string, unknown> {
    return {
      id: record.id,
      type: record.type,
      title: record.title,
      body: record.body,
      status: record.status,
      actionUrl: record.actionUrl,
      metadata: record.metadata,
      readAt: record.readAt,
      archivedAt: record.archivedAt,
      createdAt: record.createdAt,
    };
  }
}
