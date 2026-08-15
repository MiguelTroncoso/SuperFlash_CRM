import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { NewSaleDrawer } from '@/features/sales/new-sale-drawer';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type { AuthUser, ProductOffer } from '@/lib/types';

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
});
