import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
        className,
      )}
      {...props}
    />
  );
}

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  COMPLETED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  WON: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  PENDING: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  REQUESTED: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  DRAFT: 'bg-surface-muted text-content-secondary',
  ASSIGNED: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  PROCESSING: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  APPROVED: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  OPEN: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  FAILED: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  CANCELLED: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  ARCHIVED: 'bg-surface-muted text-content-secondary',
  SUSPENDED: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  EXPIRED: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  REVOKED: 'bg-surface-muted text-content-secondary',
};

export function StatusBadge({ status }: { readonly status: string }): React.ReactElement {
  return (
    <Badge className={statusStyles[status] ?? 'bg-surface-muted text-content-secondary'}>
      {status.replaceAll('_', ' ')}
    </Badge>
  );
}
