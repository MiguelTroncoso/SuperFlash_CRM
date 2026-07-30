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
    <div className="mb-4 flex min-w-0 flex-col justify-between gap-3 sm:mb-6 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">
          {eyebrow ?? 'SuperFlash'}
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-content-primary sm:mt-2 sm:text-2xl">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-content-secondary sm:text-sm">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function PageGrid({ children }: { readonly children: ReactNode }): React.ReactElement {
  return <div className="min-w-0 space-y-4 sm:space-y-6">{children}</div>;
}
