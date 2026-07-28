'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

interface ProvidersProps {
  readonly children: ReactNode;
}

export function Providers({ children }: ProvidersProps): ReactNode {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const setStatus = useAuthStore((state) => state.setStatus);
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    let active = true;
    void api.refresh().then((session) => {
      if (!active) return;
      if (session) setSession(session.accessToken, session.user);
      else setStatus('unauthenticated');
    });
    return () => {
      active = false;
    };
  }, [setSession, setStatus]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
