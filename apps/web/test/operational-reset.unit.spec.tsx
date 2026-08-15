import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Sidebar } from '@/components/layout/sidebar';
import { CollectionsPage } from '@/features/collections/collections-page';
import { ExecutiveDashboardPage } from '@/features/executive-intelligence/executive-dashboard-page';
import { OperationalDashboardPage } from '@/features/operations/operational-dashboard-page';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type {
  AuthUser,
  FinancialDashboard,
  IntelligenceDashboard,
  OperationalDashboard,
  Sale,
} from '@/lib/types';

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
    'financial.read',
    'operations.read',
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

const operationalDashboard: OperationalDashboard = {
  period: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-16T00:00:00.000Z' },
  today: {
    conversations: 4,
    demos: 1,
    informativeSales: 0,
    adSpend: [{ currency: 'USD', amount: '10.00' }],
    grossRevenue: [{ currency: 'USD', amount: '0.00' }],
    followups: 2,
    sales: 1,
    grossBilling: [{ currency: 'USD', amount: '100.00' }],
    confirmedPayments: [{ currency: 'USD', amount: '80.00' }],
    netIncome: [{ currency: 'USD', amount: '80.00' }],
    expenses: [{ currency: 'USD', amount: '10.00' }],
    profit: [{ currency: 'USD', amount: '70.00' }],
    renewals: 1,
  },
  month: {
    conversations: 20,
    demos: 5,
    sales: 2,
    conversionConversationToDemo: 25,
    conversionDemoToSale: 40,
    conversionConversationToSale: 10,
    grossBilling: [{ currency: 'USD', amount: '120.00' }],
    netIncome: [{ currency: 'USD', amount: '115.00' }],
    expenses: [{ currency: 'USD', amount: '35.00' }],
    profit: [{ currency: 'USD', amount: '80.00' }],
    averageTicket: [{ currency: 'USD', amount: '60.00' }],
    adSpend: '35.00',
    costPerConversation: '1.75',
    costPerDemo: '7.00',
    cpa: '17.50',
    roas: '3.43',
  },
  manualActivity: {},
  financialReal: {},
  byCountry: [
    {
      country: 'CL',
      conversations: 20,
      demos: 5,
      informativeSales: 1,
      adSpend: '35.00',
      grossRevenue: '120.00',
    },
  ],
  pendingCollections: [{ currency: 'USD', balance: '25.00' }],
  renewalsDueSoon: 1,
  criticalStock: 0,
  sourceOfTruth: {
    manualActivity: 'DailyMetric',
    financialSales: 'Sale and confirmed Payment',
    financialSalesCount: 'Sale',
  },
};

const financialDashboard: FinancialDashboard = {
  month: '2026-08',
  currency: 'USD',
  revenue: '100.00',
  expenses: '30.00',
  grossProfit: '70.00',
  netProfit: '70.00',
  marginPercent: 70,
  mrr: '0.00',
  arr: '0.00',
  estimatedCash: '70.00',
  fixedMonthlyCost: '20.00',
  variableCost: '10.00',
  breakEven: '30.00',
  previousMonth: { revenue: '80.00', expenses: '20.00', netProfit: '60.00' },
  upcomingRecurringExpenses: [],
  monthlyTrend: [],
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
      'Operación diaria',
      'Mi Día',
      'Ventas',
      'Cobros',
      'Gastos',
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

  it('renders real executive and financial dashboard signals', async () => {
    jest.spyOn(api, 'getExecutiveDashboard').mockResolvedValue(dashboard);
    jest.spyOn(api, 'getOperationalDashboard').mockResolvedValue(operationalDashboard);
    jest.spyOn(api, 'getFinancialDashboard').mockResolvedValue(financialDashboard);
    jest.spyOn(api, 'getContacts').mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 1, total: 12, totalPages: 12 },
    });
    jest.spyOn(api, 'getProducts').mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 1, total: 6, totalPages: 6 },
    });
    render(withQuery(<ExecutiveDashboardPage />));
    await waitFor(() => expect(screen.getByText('Ventas hoy')).toBeInTheDocument());
    expect(screen.getByText('Ventas del mes')).toBeInTheDocument();
    expect(screen.getByText('Cobros pendientes')).toBeInTheDocument();
    expect(screen.getByText('Utilidad neta')).toBeInTheDocument();
    expect(screen.getByText('Egresos del mes')).toBeInTheDocument();
    expect(screen.getByText('Renovaciones')).toBeInTheDocument();
    expect(screen.getByText('Stock crítico')).toBeInTheDocument();
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('Productos')).toBeInTheDocument();
    expect(screen.getByText('Conversaciones hoy')).toBeInTheDocument();
    expect(screen.getByText('Conversión')).toBeInTheDocument();
  });

  it('renders the daily operating dashboard and keeps manual activity separate', async () => {
    jest.spyOn(api, 'getOperationalDashboard').mockResolvedValue(operationalDashboard);
    jest
      .spyOn(api, 'getDailyMetrics')
      .mockResolvedValue({ data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } });
    jest.spyOn(api, 'getMarketingCampaigns').mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    render(withQuery(<OperationalDashboardPage />));
    await waitFor(() => expect(screen.getByText('Dashboard operativo')).toBeInTheDocument());
    expect(screen.getByText('Conversaciones hoy')).toBeInTheDocument();
    expect(screen.getByText('Registro manual')).toBeInTheDocument();
    expect(screen.getByText('Resumen del día')).toBeInTheDocument();
    expect(screen.getByText('Ingresos netos del mes')).toBeInTheDocument();
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
