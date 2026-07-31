import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { RenewalDashboardPage } from '@/features/renewal-center/renewal-center-page';
import { api } from '@/lib/api-client';

jest.mock('next/navigation', () => ({
  usePathname: () => '/renewals',
}));

describe('Renewal Center frontend', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders lifecycle KPIs and keeps navigation available', async () => {
    jest.spyOn(api, 'getRenewalDashboard').mockResolvedValue({
      generatedAt: '2026-07-31T00:00:00.000Z',
      period: { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
      cards: {
        today: 2,
        next7Days: 4,
        next15Days: 6,
        next30Days: 9,
        upcomingAmount: [{ currency: 'USD', amount: '900.00' }],
        renewedAmount: [{ currency: 'USD', amount: '300.00' }],
        lostAmount: [],
        mrrRenewable: [{ currency: 'USD', amount: '900.00' }],
        renewalRate: 75,
        atRiskCustomers: 3,
        projectedRevenue: [{ currency: 'USD', amount: '900.00' }],
        recoveredRevenue: [{ currency: 'USD', amount: '300.00' }],
        previousMonthRenewedAmount: [],
      },
      financial: { currentExpenses: [], projectedProfit: [] },
      critical: [],
      upcoming: [],
      history: [],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RenewalDashboardPage />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Renovaciones hoy')).toBeInTheDocument());
    expect(screen.getByText('Ingresos proyectados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calendario' })).toHaveAttribute(
      'href',
      '/renewals/calendar',
    );
  });
});
