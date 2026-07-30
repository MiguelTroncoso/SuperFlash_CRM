import type { ReactNode } from 'react';

export function FilterBar({ children }: { readonly children: ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-default bg-surface-card p-3">
      {children}
    </div>
  );
}
