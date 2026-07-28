'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Button } from './button';

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}): React.ReactElement | null {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        aria-label="Cerrar panel"
        className="absolute inset-0 cursor-default bg-slate-950/30 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <aside
        className={cn(
          'relative h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900',
          className,
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-6 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            ) : null}
          </div>
          <Button aria-label="Cerrar" onClick={onClose} size="sm" variant="ghost">
            ×
          </Button>
        </div>
        <div className="p-6">{children}</div>
      </aside>
    </div>
  );
}
