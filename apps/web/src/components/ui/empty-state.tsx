import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center dark:border-slate-800 dark:bg-slate-950/50',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl shadow-sm dark:bg-slate-900">
        ✦
      </div>
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ onRetry }: { readonly onRetry?: () => void }): React.ReactElement {
  return (
    <EmptyState
      title="No pudimos cargar estos datos"
      description="Revisa tu conexión o inténtalo nuevamente. Si el problema persiste, contacta al administrador."
      action={
        onRetry ? (
          <button
            className="text-xs font-bold text-brand-600 hover:underline"
            onClick={onRetry}
            type="button"
          >
            Reintentar
          </button>
        ) : undefined
      }
    />
  );
}
