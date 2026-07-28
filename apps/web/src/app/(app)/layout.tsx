import type { ReactNode } from 'react';

import { LayoutShell } from '@/components/layout/layout-shell';

export default function AppLayout({
  children,
}: {
  readonly children: ReactNode;
}): React.ReactElement {
  return <LayoutShell>{children}</LayoutShell>;
}
