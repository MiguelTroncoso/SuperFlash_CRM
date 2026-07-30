import { useAuthStore } from './auth-store';
import type {
  Activation,
  AuthSessionResponse,
  AuthUser,
  AutomationExecution,
  AutomationRule,
  Contact,
  ContactCreateResult,
  Category,
  CredentialRecord,
  Fulfillment,
  JsonRecord,
  MyDayResponse,
  MyDaySummary,
  MessageTemplate,
  Notification,
  Opportunity,
  Pagination,
  Paginated,
  Person,
  PipelineResponse,
  PriceBook,
  PriceEntry,
  Product,
  ProductOffer,
  ProductPlan,
  ProductStock,
  Provider,
  ProviderMapping,
  RevenueCohortRow,
  RevenueDashboard,
  RevenueFunnel,
  RevenueKpis,
  RevenueForecast,
  RevenueTrendPoint,
  Sale,
  StockMovement,
  Tag,
  Trial,
  WhatsAppConnection,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppTemplate,
} from './types';

const configuredUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_BASE_URL = configuredUrl.endsWith('/api/v1')
  ? configuredUrl
  : `${configuredUrl.replace(/\/$/, '')}/api/v1`;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

function requestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as JsonRecord | null;
  if (!response.ok) {
    const message =
      typeof body?.message === 'string' ? body.message : 'No fue posible completar la solicitud.';
    const code = typeof body?.code === 'string' ? body.code : null;
    throw new ApiClientError(response.status, message, code);
  }
  return body as T;
}

async function rawRequest<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Request-ID', requestId());
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  return parseResponse<T>(response);
}

async function refreshSession(): Promise<AuthSessionResponse | null> {
  try {
    const session = await rawRequest<AuthSessionResponse>('/auth/refresh', { method: 'POST' });
    useAuthStore.getState().setSession(session.accessToken, session.user);
    return session;
  } catch {
    useAuthStore.getState().clearSession();
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  try {
    return await rawRequest<T>(path, init, token);
  } catch (error: unknown) {
    if (error instanceof ApiClientError && error.status === 401 && !path.startsWith('/auth/')) {
      const refreshed = await refreshSession();
      if (refreshed) return rawRequest<T>(path, init, refreshed.accessToken);
    }
    throw error;
  }
}

function jsonBody(body: unknown): RequestInit {
  return { body: JSON.stringify(body) };
}

export const api = {
  login: (body: { email: string; password: string }) =>
    rawRequest<AuthSessionResponse>('/auth/login', { method: 'POST', ...jsonBody(body) }),
  refresh: refreshSession,
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  getMe: () => request<AuthUser>('/auth/me'),
  getProfile: () => request<AuthUser>('/auth/profile'),
  updateProfile: (body: JsonRecord) =>
    request<AuthUser>('/auth/profile', { method: 'PATCH', ...jsonBody(body) }),
  getMyDay: (query = '') => request<MyDayResponse>(`/my-day${query}`),
  getMyDaySummary: (query = '') => request<MyDaySummary>(`/my-day/summary${query}`),
  getContacts: (query = '') => request<Paginated<Contact>>(`/contacts${query}`),
  getContactAssignees: () => request<Person[]>('/contacts/assignees'),
  createContact: (body: JsonRecord) =>
    request<ContactCreateResult>('/contacts', { method: 'POST', ...jsonBody(body) }),
  getContact: (id: string) => request<Contact>(`/contacts/${id}`),
  updateContact: (id: string, body: JsonRecord) =>
    request<Contact>(`/contacts/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  archiveContact: (id: string, reason?: string) =>
    request<void>(`/contacts/${id}/archive`, {
      method: 'POST',
      ...jsonBody(reason ? { reason } : {}),
    }),
  getTags: () => request<Tag[]>('/tags'),
  getPipeline: (query = '') => request<PipelineResponse>(`/pipeline${query}`),
  getPipelineSummary: (query = '') => request<JsonRecord>(`/pipeline/summary${query}`),
  moveOpportunity: (id: string, body: { pipelineStageId: string; reason?: string }) =>
    request<Opportunity>(`/opportunities/${id}/move`, { method: 'POST', ...jsonBody(body) }),
  getSales: (query = '') => request<Paginated<Sale>>(`/sales${query}`),
  getSale: (id: string) => request<Sale>(`/sales/${id}`),
  getOffers: (query = '') => request<{ data: ProductOffer[] }>(`/catalog/offers${query}`),
  getProducts: (query = '') => request<Paginated<Product>>(`/catalog/products${query}`),
  createProduct: (body: JsonRecord) =>
    request<Product>('/catalog/products', { method: 'POST', ...jsonBody(body) }),
  updateProduct: (id: string, body: JsonRecord) =>
    request<Product>(`/catalog/products/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  activateProduct: (id: string) =>
    request<Product>(`/catalog/products/${id}/activate`, { method: 'POST' }),
  deactivateProduct: (id: string) =>
    request<Product>(`/catalog/products/${id}/deactivate`, { method: 'POST' }),
  archiveProduct: (id: string) =>
    request<Product>(`/catalog/products/${id}/archive`, { method: 'POST' }),
  getCategories: () => request<Category[]>('/catalog/categories'),
  createCategory: (body: JsonRecord) =>
    request<Category>('/catalog/categories', { method: 'POST', ...jsonBody(body) }),
  updateCategory: (id: string, body: JsonRecord) =>
    request<Category>(`/catalog/categories/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  archiveCategory: (id: string) =>
    request<Category>(`/catalog/categories/${id}/archive`, { method: 'POST' }),
  restoreCategory: (id: string) =>
    request<Category>(`/catalog/categories/${id}/restore`, { method: 'POST' }),
  getPlans: (productId: string) => request<ProductPlan[]>(`/catalog/products/${productId}/plans`),
  createPlan: (productId: string, body: JsonRecord) =>
    request<ProductPlan>(`/catalog/products/${productId}/plans`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  updatePlan: (productId: string, id: string, body: JsonRecord) =>
    request<ProductPlan>(`/catalog/products/${productId}/plans/${id}`, {
      method: 'PATCH',
      ...jsonBody(body),
    }),
  archivePlan: (productId: string, id: string) =>
    request<ProductPlan>(`/catalog/products/${productId}/plans/${id}/archive`, { method: 'POST' }),
  getPriceBooks: () => request<PriceBook[]>('/catalog/price-books'),
  createPriceBook: (body: JsonRecord) =>
    request<PriceBook>('/catalog/price-books', { method: 'POST', ...jsonBody(body) }),
  updatePriceBook: (id: string, body: JsonRecord) =>
    request<PriceBook>(`/catalog/price-books/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  activatePriceBook: (id: string) =>
    request<PriceBook>(`/catalog/price-books/${id}/activate`, { method: 'POST' }),
  deactivatePriceBook: (id: string) =>
    request<PriceBook>(`/catalog/price-books/${id}/deactivate`, { method: 'POST' }),
  archivePriceBook: (id: string) =>
    request<PriceBook>(`/catalog/price-books/${id}/archive`, { method: 'POST' }),
  getPriceEntries: (priceBookId: string, query = '') =>
    request<PriceEntry[]>(`/catalog/price-books/${priceBookId}/entries${query}`),
  createPriceEntry: (priceBookId: string, body: JsonRecord) =>
    request<PriceEntry>(`/catalog/price-books/${priceBookId}/entries`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  updatePriceEntry: (priceBookId: string, id: string, body: JsonRecord) =>
    request<PriceEntry>(`/catalog/price-books/${priceBookId}/entries/${id}`, {
      method: 'PATCH',
      ...jsonBody(body),
    }),
  archivePriceEntry: (priceBookId: string, id: string) =>
    request<PriceEntry>(`/catalog/price-books/${priceBookId}/entries/${id}/archive`, {
      method: 'POST',
    }),
  getProductStock: (id: string) => request<ProductStock>(`/catalog/products/${id}/stock`),
  adjustProductStock: (id: string, body: JsonRecord) =>
    request<ProductStock>(`/catalog/products/${id}/stock/adjust`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  getStockMovements: (id: string, query = '') =>
    request<Paginated<StockMovement>>(`/catalog/products/${id}/stock/movements${query}`),
  getProviders: (query = '') => request<Paginated<Provider>>(`/providers${query}`),
  createProvider: (body: JsonRecord) =>
    request<Provider>('/providers', { method: 'POST', ...jsonBody(body) }),
  updateProvider: (id: string, body: JsonRecord) =>
    request<Provider>(`/providers/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  changeProviderStatus: (id: string, status: string, reason?: string) =>
    request<Provider>(`/providers/${id}/status`, {
      method: 'POST',
      ...jsonBody({ status, reason }),
    }),
  archiveProvider: (id: string) => request<void>(`/providers/${id}/archive`, { method: 'POST' }),
  getProviderMappings: (query = '') =>
    request<{ data: ProviderMapping[] }>(`/provider-mappings${query}`),
  createProviderMapping: (body: JsonRecord) =>
    request<ProviderMapping>('/provider-mappings', { method: 'POST', ...jsonBody(body) }),
  updateProviderMapping: (id: string, body: JsonRecord) =>
    request<ProviderMapping>(`/provider-mappings/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  archiveProviderMapping: (id: string) =>
    request<void>(`/provider-mappings/${id}/archive`, { method: 'POST' }),
  getFulfillments: (query = '') => request<Paginated<Fulfillment>>(`/fulfillments${query}`),
  getFulfillment: (id: string) => request<Fulfillment>(`/fulfillments/${id}`),
  assignFulfillment: (id: string, body: JsonRecord) =>
    request<Fulfillment>(`/fulfillments/${id}/assign`, { method: 'PATCH', ...jsonBody(body) }),
  startFulfillment: (id: string) =>
    request<Fulfillment>(`/fulfillments/${id}/start`, { method: 'POST' }),
  completeFulfillment: (id: string, body: JsonRecord = {}) =>
    request<Fulfillment>(`/fulfillments/${id}/complete`, { method: 'POST', ...jsonBody(body) }),
  failFulfillment: (id: string, body: JsonRecord) =>
    request<Fulfillment>(`/fulfillments/${id}/fail`, { method: 'POST', ...jsonBody(body) }),
  cancelFulfillment: (id: string) =>
    request<Fulfillment>(`/fulfillments/${id}/cancel`, { method: 'POST' }),
  getProvisioningAttempts: (query = '') =>
    request<{ data: JsonRecord[] }>(`/provisioning-attempts${query}`),
  getCredentials: (query = '') => request<{ data: CredentialRecord[] }>(`/credentials${query}`),
  revealCredential: (id: string) =>
    request<CredentialRecord>(`/credentials/${id}/reveal`, { method: 'POST' }),
  getTrials: (query = '') => request<Paginated<Trial>>(`/trials${query}`),
  getActivations: (query = '') => request<{ data: Activation[] }>(`/activations${query}`),
  getAutomations: (query = '') => request<Paginated<AutomationRule>>(`/automations${query}`),
  getAutomation: (id: string) => request<AutomationRule>(`/automations/${id}`),
  createAutomation: (body: JsonRecord) =>
    request<AutomationRule>('/automations', { method: 'POST', ...jsonBody(body) }),
  updateAutomation: (id: string, body: JsonRecord) =>
    request<AutomationRule>(`/automations/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  toggleAutomation: (id: string, active: boolean) =>
    request<AutomationRule>(`/automations/${id}/toggle`, {
      method: 'POST',
      ...jsonBody({ active }),
    }),
  getAutomationExecutions: (query = '') =>
    request<Paginated<AutomationExecution>>(`/automation-executions${query}`),
  getTemplates: (query = '') => request<Paginated<MessageTemplate>>(`/templates${query}`),
  getTemplate: (id: string) => request<MessageTemplate>(`/templates/${id}`),
  createTemplate: (body: JsonRecord) =>
    request<MessageTemplate>('/templates', { method: 'POST', ...jsonBody(body) }),
  updateTemplate: (id: string, body: JsonRecord) =>
    request<MessageTemplate>(`/templates/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  previewTemplate: (body: JsonRecord) =>
    request<JsonRecord>('/templates/preview', { method: 'POST', ...jsonBody(body) }),
  getNotifications: (query = '') =>
    request<{ data: Notification[]; pagination: Pagination; unread: number }>(
      `/notifications${query}`,
    ),
  readNotification: (id: string) =>
    request<Notification>(`/notifications/${id}/read`, { method: 'POST' }),
  archiveNotification: (id: string) =>
    request<void>(`/notifications/${id}/archive`, { method: 'POST' }),
  readAllNotifications: () =>
    request<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
  getRevenueDashboard: (query = '') =>
    request<RevenueDashboard>(`/revenue-intelligence/dashboard${query}`),
  getRevenueKpis: (query = '') =>
    request<{ data: RevenueKpis }>(`/revenue-intelligence/kpis${query}`),
  getRevenueFunnels: (query = '') =>
    request<{ data: RevenueFunnel }>(`/revenue-intelligence/funnels${query}`),
  getRevenueCohorts: (query = '') =>
    request<{ data: RevenueCohortRow[] }>(`/revenue-intelligence/cohorts${query}`),
  getRevenueTrends: (query = '') =>
    request<{ data: RevenueTrendPoint[] }>(`/revenue-intelligence/trends${query}`),
  getRevenueForecast: (query = '') =>
    request<{ data: RevenueForecast[] }>(`/revenue-intelligence/forecast${query}`),
  getWhatsAppConnection: () =>
    request<WhatsAppConnection | null>('/integrations/whatsapp/connection'),
  saveWhatsAppConnection: (body: JsonRecord) =>
    request<WhatsAppConnection>('/integrations/whatsapp/connection', {
      method: 'PUT',
      ...jsonBody(body),
    }),
  testWhatsAppConnection: () =>
    request<WhatsAppConnection>('/integrations/whatsapp/connection/test', { method: 'POST' }),
  disconnectWhatsApp: () =>
    request<void>('/integrations/whatsapp/connection/disconnect', { method: 'POST' }),
  getWhatsAppConversations: (query = '') =>
    request<Paginated<WhatsAppConversation>>(`/integrations/whatsapp/conversations${query}`),
  getWhatsAppMessages: (id: string, query = '') =>
    request<Paginated<WhatsAppMessage>>(
      `/integrations/whatsapp/conversations/${id}/messages${query}`,
    ),
  sendWhatsAppMessage: (id: string, body: JsonRecord) =>
    request<WhatsAppMessage>(`/integrations/whatsapp/conversations/${id}/messages`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  assignWhatsAppConversation: (id: string, assignedUserId: string | null) =>
    request<WhatsAppConversation>(`/integrations/whatsapp/conversations/${id}/assignee`, {
      method: 'PATCH',
      ...jsonBody({ assignedUserId }),
    }),
  getWhatsAppTemplates: () =>
    request<{ data: WhatsAppTemplate[] }>('/integrations/whatsapp/templates'),
  syncWhatsAppTemplates: () =>
    request<{ synced: number }>('/integrations/whatsapp/templates/sync', { method: 'POST' }),
};

export function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}
