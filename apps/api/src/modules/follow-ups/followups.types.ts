import { FollowUpPriority, FollowUpStatus, Prisma } from '@prisma/client';

export const FOLLOW_UP_SORT_FIELDS = [
  'dueAt',
  'priority',
  'createdAt',
  'updatedAt',
  'completedAt',
] as const;

export type FollowUpSortField = (typeof FOLLOW_UP_SORT_FIELDS)[number];

export function normalizeFollowUpTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeFollowUpNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isFollowUpOverdue(status: FollowUpStatus, dueAt: Date, now = new Date()): boolean {
  return status === FollowUpStatus.PENDING && dueAt.getTime() < now.getTime();
}

export function followUpPriorityWeight(priority: FollowUpPriority): number {
  return {
    [FollowUpPriority.LOW]: 1,
    [FollowUpPriority.NORMAL]: 2,
    [FollowUpPriority.HIGH]: 3,
    [FollowUpPriority.URGENT]: 4,
  }[priority];
}

export function asFollowUpJson(
  value: Record<string, string | boolean | null>,
): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null),
  ) as Prisma.InputJsonObject;
}
