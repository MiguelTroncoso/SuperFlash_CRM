import type { ReactNode } from 'react';

import { Card } from './card';

export function MetricCard({
  label,
  value,
  trend,
  icon,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly trend?: string;
  readonly icon: ReactNode;
}): React.ReactElement {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-slate-400">
            {label}
          </p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            {value}
          </p>
          {trend ? <p className="mt-2 text-xs font-medium text-emerald-600">{trend}</p> : null}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          {icon}
        </div>
      </div>
      <div className="absolute -bottom-7 -right-6 h-20 w-20 rounded-full bg-brand-50/80 dark:bg-brand-500/5" />
    </Card>
  );
}
