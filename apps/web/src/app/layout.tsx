import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { LayoutShell } from '@/components/layout/layout-shell';

import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'SuperFlash CRM',
  description: 'Plataforma CRM multiempresa de SuperFlash.',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html lang="es">
      <body>
        <Providers>
          <LayoutShell>{children}</LayoutShell>
        </Providers>
      </body>
    </html>
  );
}
