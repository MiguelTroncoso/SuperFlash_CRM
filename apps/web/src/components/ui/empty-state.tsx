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
        'flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border-default bg-surface-inset p-6 text-center sm:p-8',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-card text-xl shadow-sm">
        ✦
      </div>
      <h3 className="text-sm font-bold text-content-primary">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-content-secondary">{description}</p>
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
