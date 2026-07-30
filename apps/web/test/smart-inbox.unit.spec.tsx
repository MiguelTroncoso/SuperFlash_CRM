import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SmartInboxPage } from '@/features/smart-inbox/smart-inbox-page';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import type { AuthUser, SmartInboxDetailResponse, SmartInboxListResponse } from '@/lib/types';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/whatsapp',
}));

const user: AuthUser = {
  id: 'user-1',
  email: 'owner@example.com',
  firstName: 'Miguel',
  lastName: 'Owner',
  phone: null,
  timezone: 'America/Santiago',
  organization: { id: 'org-1', name: 'Demo', slug: 'demo' },
  role: { id: 'role-1', name: 'Owner' },
  permissions: [
    'whatsapp.read',
    'whatsapp.send',
    'whatsapp.conversations.assign',
    'contacts.update',
    'opportunities.update',
    'sales.create',
    'followups.create',
    'fulfillments.create',
  ],
};

const conversation = {
  id: 'conversation-1',
  avatar: 'J',
  name: 'Juan Pérez',
  externalContactName: 'Juan Pérez',
  phone: '+56912345678',
  phoneNormalized: '+56912345678',
  flag: '🇨🇱',
  country: 'CL',
  lastMessage: 'Quiero conocer el plan reseller',
  lastMessageAt: '2026-07-29T12:00:00.000Z',
  responsible: 'Miguel Owner',
  assignedTo: { id: 'user-1', firstName: 'Miguel', lastName: 'Owner' },
  pipeline: { id: 'stage-1', name: 'Nuevo Lead', color: '#6366f1', category: 'OPEN' },
  opportunity: { id: 'opportunity-1', title: 'Interés de Juan Pérez' },
  tags: [{ id: 'tag-1', name: 'VIP', color: '#8b5cf6' }],
  source: 'MANUAL',
  channel: 'WhatsApp',
  status: 'OPEN',
  window: { open: true, expiresAt: '2026-07-30T12:00:00.000Z' },
  unreadCount: 2,
  isVip: true,
  renewalDue: false,
  chips: ['Lead nuevo', 'VIP'],
};

const list: SmartInboxListResponse = {
  data: [conversation],
  pagination: { page: 1, limit: 40, total: 1, totalPages: 1 },
  views: { inbox: 1, unassigned: 0, mine: 1, pending: 1, renewals: 0, closed: 0, archived: 0 },
};

const detail = {
  conversation,
  messages: [
    {
      id: 'message-1',
      direction: 'INBOUND',
      type: 'TEXT',
      status: 'RECEIVED',
      text: 'Quiero conocer el plan reseller',
      createdAt: '2026-07-29T12:00:00.000Z',
    },
  ],
  timeline: [
    {
      id: 'activity-1',
      kind: 'ACTIVITY',
      title: 'Contacto creado',
      description: null,
      occurredAt: '2026-07-29T11:00:00.000Z',
      metadata: null,
    },
  ],
  panel: {
    contact: {
      id: 'contact-1',
      firstName: 'Juan',
      lastName: 'Pérez',
      displayName: 'Juan Pérez',
      email: 'juan@example.com',
      phone: '+56912345678',
      country: 'CL',
      source: 'MANUAL',
      isCustomer: false,
      archivedAt: null,
      lastActivityAt: '2026-07-29T11:00:00.000Z',
      assignedTo: conversation.assignedTo,
      tags: conversation.tags,
      activeOpportunity: null,
      createdAt: '2026-07-29T11:00:00.000Z',
      updatedAt: '2026-07-29T11:00:00.000Z',
    },
    opportunities: [
      {
        id: 'opportunity-1',
        title: 'Interés de Juan Pérez',
        pipelineStage: {
          id: 'stage-1',
          name: 'Nuevo Lead',
          color: '#6366f1',
          category: 'OPEN',
          order: 1,
          active: true,
          systemKey: null,
        },
        campaign: null,
        product: { id: 'product-1', name: 'Plan Reseller' },
        assignedTo: conversation.assignedTo,
      },
    ],
    sales: [],
    subscriptions: [],
    trials: [],
    followUps: [],
    metrics: {
      firstResponseSeconds: 120,
      averageResponseSeconds: 180,
      messageCount: 1,
      saleCount: 0,
      revenue: '0.00',
      mrr: '0.00',
      ltv: '0.00',
      lastPurchaseAt: null,
      nextRenewalAt: null,
      activeProducts: [],
    },
  },
} as SmartInboxDetailResponse;

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SmartInboxPage />
    </QueryClientProvider>,
  );
}

describe('Smart Inbox frontend', () => {
  beforeEach(() => {
    actSetSession();
    jest.spyOn(api, 'getSmartInboxConversations').mockResolvedValue(list);
    jest.spyOn(api, 'getSmartInboxConversation').mockResolvedValue(detail);
    jest.spyOn(api, 'getPipeline').mockResolvedValue({ stages: [], pagination: undefined });
    jest.spyOn(api, 'getContactAssignees').mockResolvedValue([conversation.assignedTo]);
    jest.spyOn(api, 'getOffers').mockResolvedValue({
      data: [
        {
          id: 'product-1',
          name: 'Plan Reseller',
          slug: 'plan-reseller',
          sku: null,
          description: null,
          type: 'SERVICE',
          fulfillmentMode: 'MANUAL',
          requiresSubscription: false,
          allowsDemo: true,
          price: null,
          plans: [],
        },
      ],
    });
    jest.spyOn(api, 'getTags').mockResolvedValue(conversation.tags);
    jest.spyOn(api, 'subscribeSmartInboxEvents').mockReturnValue(jest.fn());
  });

  afterEach(() => jest.restoreAllMocks());

  it('renderiza lista, conversación, panel y timeline', async () => {
    renderPage();
    expect(await screen.findByTestId('smart-inbox-workspace')).toBeInTheDocument();
    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    expect(await screen.findByTestId('smart-inbox-thread')).toBeInTheDocument();
    expect(screen.getByTestId('smart-inbox-operational-panel')).toBeInTheDocument();
    expect(screen.getByTestId('smart-inbox-timeline')).toBeInTheDocument();
  });

  it('aplica filtros rápidos y dispara una venta desde el panel', async () => {
    const createSale = jest.spyOn(api, 'createSmartInboxSale').mockResolvedValue({
      id: 'sale-1',
      status: 'DRAFT',
      currency: 'USD',
      subtotal: '10',
      discountAmount: '0',
      taxAmount: '0',
      total: '10',
      contact: null,
      opportunity: null,
      seller: null,
      items: [],
      createdAt: '',
      updatedAt: '',
    });
    renderPage();
    await screen.findByTestId('smart-inbox-workspace');
    fireEvent.click(screen.getByRole('button', { name: 'No leídos' }));
    expect(api.getSmartInboxConversations).toHaveBeenCalledWith(
      expect.stringContaining('unread=true'),
    );
    fireEvent.change(await screen.findByLabelText('Producto para venta'), {
      target: { value: 'product-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear venta' }));
    await waitFor(() =>
      expect(createSale).toHaveBeenCalledWith(
        'conversation-1',
        expect.objectContaining({ items: [{ productId: 'product-1', quantity: '1' }] }),
      ),
    );
  });

  it('mantiene el workspace en modo solo lectura para mensajes salientes', async () => {
    renderPage();
    expect(
      await screen.findByText(/WhatsApp Read Only: el operador continúa/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Mensaje')).not.toBeInTheDocument();
  });
});

function actSetSession(): void {
  useAuthStore.getState().setSession('memory-token', user);
}
