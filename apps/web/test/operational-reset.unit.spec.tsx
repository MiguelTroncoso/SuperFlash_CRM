import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Sidebar } from '@/components/layout/sidebar';
import { CollectionsPage } from '@/features/collections/collections-page';
import { ExecutiveDashboardPage } from '@/features/executive-intelligence/executive-dashboard-page';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type { AuthUser, IntelligenceDashboard, Sale } from '@/lib/types';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const user: AuthUser = {
  id: 'user-1',
  email: 'owner@example.com',
  firstName: 'Owner',
  lastName: 'Demo',
  phone: null,
  timezone: 'America/Santiago',
  organization: { id: 'org-1', name: 'Demo', slug: 'demo' },
  role: { id: 'role-1', name: 'Owner' },
  permissions: [
    'followups.read',
    'contacts.read',
    'opportunities.read',
    'sales.read',
    'payments.read',
    'renewals.read',
    'catalog.read',
  ],
};

function withQuery(ui: React.ReactElement): React.ReactElement {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>
  );
}

const dashboard: IntelligenceDashboard = {
  generatedAt: '2026-08-07T00:00:00.000Z',
  period: { from: '2026-08-01', to: '2026-08-08' },
  kpis: {
    salesToday: [],
    salesWeek: [],
    salesMonth: [{ currency: 'USD', amount: '100.00', count: 1 }],
    billingToday: [],
    billingMonth: [{ currency: 'USD', amount: '80.00', count: 1 }],
    mrr: [],
    arr: [],
    activeCustomers: 2,
    newCustomers: 1,
    lostCustomers: 0,
    renewalsMonth: 3,
    pendingRenewals: 1,
    pendingBalance: [{ currency: 'USD', amount: '25.00' }],
    pendingFulfillments: 0,
    pendingActivations: 0,
    conversion: 40,
  },
  charts: {
    revenueDaily: [],
    revenueMonthly: [],
    salesCountry: [],
    salesProduct: [],
    newCustomersWeekly: [],
    funnel: [],
    renewalsTrend: [],
    mrrHistory: [],
  },
};

describe('operational CRM reset', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession('token', user);
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows only the daily operating menu', () => {
    render(<Sidebar />);
    for (const label of [
      'Dashboard',
      'Mi Día',
      'Leads',
      'Pipeline',
      'Ventas',
      'Cobros',
      'Renovaciones',
      'Catálogo',
      'Configuración',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Revenue Intelligence' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Contactos' })).not.toBeInTheDocument();
  });

  it('renders only the six operational dashboard signals', async () => {
    jest.spyOn(api, 'getExecutiveDashboard').mockResolvedValue(dashboard);
    jest.spyOn(api, 'getMyDaySummary').mockResolvedValue({ newLeads: 4 });
    render(withQuery(<ExecutiveDashboardPage />));
    await waitFor(() => expect(screen.getByText('Leads del día')).toBeInTheDocument());
    expect(screen.getByText('Ventas del mes')).toBeInTheDocument();
    expect(screen.getByText('Cobros pendientes')).toBeInTheDocument();
    expect(screen.getByText('Renovaciones')).toBeInTheDocument();
    expect(screen.getByText('Conversión')).toBeInTheDocument();
    expect(screen.getByText('Ingresos')).toBeInTheDocument();
    expect(screen.queryByText('Ingresos por día')).not.toBeInTheDocument();
  });

  it('shows the operational collections queue from existing sales and payments', async () => {
    const sale = {
      id: 'sale-1',
      status: 'CONFIRMED',
      currency: 'USD',
      subtotal: '100.00',
      discountAmount: '0.00',
      taxAmount: '0.00',
      total: '100.00',
      contact: { id: 'contact-1', name: 'Juan Lead' },
      opportunity: null,
      seller: null,
      items: [],
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:00:00.000Z',
    } satisfies Sale;
    jest.spyOn(api, 'getSales').mockResolvedValue({
      data: [sale],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    jest.spyOn(api, 'getPayments').mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    render(withQuery(<CollectionsPage />));
    await waitFor(() => expect(screen.getByText('Juan Lead')).toBeInTheDocument());
    expect(screen.getByText('Registrar pago')).toBeInTheDocument();
    expect(screen.getByText('Marcar pagado')).toBeInTheDocument();
  });
});
