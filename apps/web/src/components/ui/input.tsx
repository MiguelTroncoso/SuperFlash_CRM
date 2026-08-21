import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref): React.ReactElement {
    return (
      <input
        className={cn(
          'h-10 w-full rounded-xl border border-border-default bg-surface-card px-3 text-sm text-content-primary outline-none transition placeholder:text-content-muted focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>): React.ReactElement {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-xl border border-border-default bg-surface-card px-3 text-sm text-content-primary outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10',
        className,
      )}
      {...props}
    />
  );
}

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref): React.ReactElement {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full resize-y rounded-xl border border-border-default bg-surface-card px-3 py-2.5 text-sm text-content-primary outline-none transition placeholder:text-content-muted focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
