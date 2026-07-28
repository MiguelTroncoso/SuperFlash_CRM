import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
}): React.ReactElement {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">
          {eyebrow ?? 'SuperFlash'}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageGrid({ children }: { readonly children: ReactNode }): React.ReactElement {
  return <div className="space-y-6">{children}</div>;
}
