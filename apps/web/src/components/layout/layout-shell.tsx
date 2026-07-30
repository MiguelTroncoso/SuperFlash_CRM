'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAuthStore } from '@/lib/auth-store';
import { useUiStore } from '@/lib/ui-store';

import { CommandPalette } from '../ui/command-palette';
import { PageSkeleton } from '../ui/skeleton';
import { ToastViewport } from '../ui/toast';
import { Header } from './header';
import { Sidebar } from './sidebar';

interface LayoutShellProps {
  readonly children: ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((state) => state.status);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  useEffect(() => {
    if (status === 'unauthenticated') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [pathname, router, status]);
  if (status !== 'authenticated')
    return (
      <div className="min-h-screen bg-surface-page p-4 sm:p-6">
        <PageSkeleton />
      </div>
    );
  return (
    <div className="min-h-screen min-w-0 bg-surface-page">
      <Sidebar />
      <div className={collapsed ? 'lg:pl-[78px]' : 'lg:pl-[260px]'}>
        <Header />
        <main className="min-w-0 px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
      </div>
      <CommandPalette />
      <ToastViewport />
    </div>
  );
}
