import type { ReactNode } from 'react';

export function FilterBar({ children }: { readonly children: ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      {children}
    </div>
  );
}
