'use client';

import { create } from 'zustand';

import { cn } from '@/lib/utils';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: 'success' | 'error' | 'info';
}
interface ToastStore {
  items: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (toast) => {
    const id = Date.now() + Math.random();
    set((state) => ({ items: [...state.items, { ...toast, id }] }));
    window.setTimeout(
      () => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      4_500,
    );
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));

export function ToastViewport(): React.ReactElement {
  const items = useToastStore((state) => state.items);
  const dismiss = useToastStore((state) => state.dismiss);
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((item) => (
        <button
          className={cn(
            'rounded-2xl border p-4 text-left shadow-xl transition hover:-translate-y-0.5',
            item.tone === 'error' && 'border-rose-200 bg-rose-50 text-rose-900',
            item.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
            item.tone === 'info' && 'border-slate-200 bg-white text-slate-900',
            'dark:border-slate-700 dark:bg-slate-900 dark:text-white',
          )}
          key={item.id}
          onClick={() => dismiss(item.id)}
          type="button"
        >
          <p className="text-sm font-bold">{item.title}</p>
          {item.description ? <p className="mt-1 text-xs opacity-75">{item.description}</p> : null}
        </button>
      ))}
    </div>
  );
}
