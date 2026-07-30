import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border-default bg-surface-card shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>): React.ReactElement {
  return <h2 className={cn('text-sm font-bold text-content-primary', className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
  return <p className={cn('mt-1 text-xs text-content-secondary', className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardStat({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail?: ReactNode;
}): React.ReactElement {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-muted">
        {label}
      </p>
      <p className="mt-3 text-2xl font-bold tracking-tight text-content-primary">{value}</p>
      {detail ? <p className="mt-1 text-xs text-content-secondary">{detail}</p> : null}
    </Card>
  );
}
