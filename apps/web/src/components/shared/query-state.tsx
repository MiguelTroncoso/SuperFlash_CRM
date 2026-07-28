import type { ReactNode } from 'react';

import { ErrorState } from '@/components/ui/empty-state';
import { PageSkeleton } from '@/components/ui/skeleton';

export function QueryState({
  isLoading,
  isError,
  onRetry,
  children,
}: {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly children: ReactNode;
}): React.ReactElement {
  if (isLoading) return <PageSkeleton />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  return <>{children}</>;
}
