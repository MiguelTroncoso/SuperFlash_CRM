import type { ReactNode } from 'react';

export function Timeline({
  items,
}: {
  readonly items: { id: string; title: string; detail?: string; date?: string; icon?: ReactNode }[];
}): React.ReactElement {
  return (
    <ol className="space-y-5">
      {items.map((item, index) => (
        <li className="relative flex gap-3" key={item.id}>
          {index < items.length - 1 ? (
            <span className="absolute left-4 top-9 h-[calc(100%+1rem)] w-px bg-slate-200 dark:bg-slate-800" />
          ) : null}
          <div className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
            {item.icon ?? '•'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {item.title}
              </p>
              {item.date ? (
                <time className="shrink-0 text-[11px] text-slate-400">{item.date}</time>
              ) : null}
            </div>
            {item.detail ? (
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {item.detail}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
