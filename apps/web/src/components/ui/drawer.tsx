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
          'relative h-full w-full max-w-xl overflow-y-auto border-l border-border-default bg-surface-card shadow-2xl',
          className,
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border-subtle bg-surface-card/95 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
          <div>
            <h2 className="text-lg font-bold text-content-primary">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs text-content-secondary">{description}</p>
            ) : null}
          </div>
          <Button aria-label="Cerrar" onClick={onClose} size="sm" variant="ghost">
            ×
          </Button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </aside>
    </div>
  );
}
