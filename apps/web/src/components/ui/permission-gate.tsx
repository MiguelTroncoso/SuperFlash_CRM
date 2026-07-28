import type { ReactNode } from 'react';

import { useAuthStore } from '@/lib/auth-store';

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  readonly permission: string;
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}): React.ReactElement | null {
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  return permissions.includes(permission) ? <>{children}</> : <>{fallback}</>;
}
