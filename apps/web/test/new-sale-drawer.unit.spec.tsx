import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { NewSaleDrawer } from '@/features/sales/new-sale-drawer';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type { AuthUser, Contact, ProductOffer } from '@/lib/types';
import { addSubscriptionDuration } from '@superflash/utils';

const baseUser: AuthUser = {
  id: 'user-1',
  email: 'owner@example.com',
  firstName: 'Owner',
  lastName: 'Demo',
  phone: null,
  timezone: 'America/Santiago',
  organization: { id: 'org-1', name: 'Demo', slug: 'demo' },
  role: { id: 'role-1', name: 'Owner' },
  permissions: ['catalog.read', 'contacts.read', 'sales.create', 'catalog.prices.override'],
};

const clpOffer: ProductOffer = {
  id: 'product-chatgpt',
  name: 'CHATGPT',
  slug: 'chatgpt',
  sku: 'CHATGPT-CLP',
  description: null,
  category: null,
  type: 'SERVICE',
  fulfillmentMode: 'MANUAL',
  requiresSubscription: false,
  allowsDemo: false,
  currency: 'CLP',
  price: {
    priceBook: { currency: 'CLP' },
    price: { salePrice: '15000.00', taxIncluded: false },
  },
  pricingOptions: [
    {
      priceBookEntryId: 'entry-clp',
      priceBookId: 'book-clp',
      currency: 'CLP',
      amount: '15000.00',
      salePrice: '15000.00',
      taxIncluded: false,
      pricingSource: 'PRICE_BOOK',
    },
  ],
  availabilityStatus: 'AVAILABLE',
  selectable: true,
  manualPriceAllowed: true,
  stock: { trackingEnabled: false, quantity: 0, reserved: 0, available: 0, minimum: 0 },
  plans: [],
};

const noPriceOffer: ProductOffer = {
  ...clpOffer,
  id: 'product-no-price',
  name: 'SIN PRECIO',
  pricingOptions: [],
  price: null,
  availabilityStatus: 'NO_PRICE',
  selectable: false,
  manualPriceAllowed: false,
};

const subscriptionOffer: ProductOffer = {
  ...clpOffer,
  id: 'product-chatgpt-2',
  name: 'CHATGPT 2',
  slug: 'chatgpt-2',
  type: 'SUBSCRIPTION',
  requiresSubscription: true,
};

const agustin: Contact = {
  id: 'contact-agustin',
  firstName: 'Agustin',
  lastName: null,
  displayName: 'Agustin',
  email: null,
  phone: '+56 9 7511 6332',
  country: 'CL',
  source: 'MANUAL',
  isCustomer: false,
  archivedAt: null,
  lastActivityAt: null,
  assignedTo: null,
  tags: [],
  activeOpportunity: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

function formatDate(value: Date): string {
  return value.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Santiago',
  });
}

function renderDrawer(): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NewSaleDrawer open onClose={jest.fn()} />
    </QueryClientProvider>,
  );
}

describe('NewSaleDrawer catalog discovery', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession('token', baseUser);
    jest.spyOn(api, 'getContacts').mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    act(() => useAuthStore.getState().clearSession());
  });

  it('finds a CLP product without sending a preselected USD currency and fills its price', async () => {
    const getOffers = jest.spyOn(api, 'getOffers').mockResolvedValue({ data: [clpOffer] });
    renderDrawer();

    const productSearch = screen.getByRole('combobox', { name: 'Producto' });
    fireEvent.change(productSearch, { target: { value: 'CHATGPT' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /CHATGPT/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /CHATGPT/ }));

    await waitFor(() => expect(screen.getByLabelText('Precio')).toHaveValue('15000.00'));
    expect(screen.getByDisplayValue('CLP')).toBeInTheDocument();
    expect(screen.getByText(/Subtotal:/)).toHaveTextContent('CLP');
    expect(getOffers.mock.calls[0]?.[0] ?? '').not.toContain('currency=');
  });

  it('keeps a product without price visible but disabled for users without override permission', async () => {
    useAuthStore.getState().setSession('token', {
      ...baseUser,
      permissions: ['catalog.read', 'contacts.read', 'sales.create'],
    });
    jest.spyOn(api, 'getOffers').mockResolvedValue({ data: [noPriceOffer] });
    renderDrawer();

    fireEvent.change(screen.getByRole('combobox', { name: 'Producto' }), {
      target: { value: 'SIN PRECIO' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /SIN PRECIO/ })).toBeDisabled());
    expect(screen.getByRole('button', { name: /SIN PRECIO/ })).toHaveTextContent(
      'Sin precio configurado',
    );
  });

  it('previews subscription expiry immediately and keeps payment commitment separate', async () => {
    jest.spyOn(api, 'getContacts').mockResolvedValue({
      data: [agustin],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    jest.spyOn(api, 'getOffers').mockResolvedValue({ data: [subscriptionOffer] });
    const previewStart = new Date();
    renderDrawer();

    fireEvent.change(screen.getByRole('combobox', { name: 'Producto' }), {
      target: { value: 'CHATGPT 2' },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /CHATGPT 2/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /CHATGPT 2/ }));

    await waitFor(() =>
      expect(
        screen.getByText(
          `Vencimiento estimado: ${formatDate(addSubscriptionDuration(previewStart, 30))}`,
        ),
      ).toBeInTheDocument(),
    );
    const duration = screen.getByRole('combobox', { name: /Duración de suscripción/ });
    fireEvent.change(duration, { target: { value: '180' } });
    expect(
      screen.getByText(
        `Vencimiento estimado: ${formatDate(addSubscriptionDuration(previewStart, 180))}`,
      ),
    ).toBeInTheDocument();

    const paymentDueAt = screen.getByLabelText('Fecha compromiso de pago');
    fireEvent.change(paymentDueAt, { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pagó ahora' }));
    expect(screen.queryByLabelText('Fecha compromiso de pago')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Monto pagado'), { target: { value: '1.00' } });
    expect(screen.getByLabelText('Fecha compromiso de pago')).toBeInTheDocument();
  });
});
