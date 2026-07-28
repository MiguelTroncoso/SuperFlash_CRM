import type { ReactNode } from 'react';

export function SectionTitle({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail?: string;
  readonly action?: ReactNode;
}): React.ReactElement {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
        {detail ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
