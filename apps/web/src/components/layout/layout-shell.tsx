import type { ReactNode } from 'react';

import { Header } from './header';
import { Sidebar } from './sidebar';

interface LayoutShellProps {
  readonly children: ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps): React.ReactElement {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div>
        <Header />
        <main>{children}</main>
      </div>
    </div>
  );
}
