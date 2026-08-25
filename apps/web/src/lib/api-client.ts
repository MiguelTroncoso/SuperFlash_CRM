import { useAuthStore } from './auth-store';
import type {
  Activation,
  AuthSessionResponse,
  AuthUser,
  AutomationExecution,
  AutomationRule,
  Contact,
  ContactCreateResult,
  DailyMetric,
  Category,
  CommunicationChannelHealth,
  CommunicationConfigurationCheck,
  WhatsAppReadOnlyHealth,
  WhatsAppReadOnlySyncStatus,
  WhatsAppWebReadOnlyStatus,
  FinancialCategory,
  FinancialDashboard,
  FinancialExpense,
  BusinessIntelligenceResponse,
  Customer360Response,
  CustomerSummary,
  GlobalSearchResponse,
  IntelligenceDashboard,
  OperationalAgendaResponse,
  PipelineIntelligenceResponse,
  RenewalCenterDashboard,
  RenewalCenterItem,
  RenewalCenterReport,
  CredentialRecord,
  Fulfillment,
  JsonRecord,
  MyDayResponse,
  MyDaySummary,
  MessageTemplate,
  CommercialImport,
  MarketingAttribution,
  MarketingCampaign,
  MarketingLossReason,
  MarketingPerformanceResponse,
  MarketingSpend,
  ProspectConversationState,
  Notification,
  OperationalDashboard,
  Opportunity,
  Pagination,
  Paginated,
  Person,
  PipelineResponse,
  PipelineStage,
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
  RevenueCommunicationMetrics,
  RevenueFunnel,
  RevenueKpis,
  RevenueForecast,
  RevenueTrendPoint,
  Sale,
  SmartInboxConversation,
  SmartInboxDetailResponse,
  SmartInboxListResponse,
  SmartInboxTimelineEvent,
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
  getExecutiveDashboard: (query = '') =>
    request<IntelligenceDashboard>(`/executive/dashboard${query}`),
  getOperationalDashboard: (query = '') =>
    request<OperationalDashboard>(`/dashboard/operational${query}`),
  getDailyMetrics: (query = '') =>
    request<Paginated<DailyMetric>>(`/dashboard/daily-metrics${query}`),
  upsertDailyMetric: (body: JsonRecord) =>
    request<DailyMetric>('/dashboard/daily-metrics', { method: 'POST', ...jsonBody(body) }),
  updateDailyMetric: (id: string, body: JsonRecord) =>
    request<DailyMetric>(`/dashboard/daily-metrics/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  deleteDailyMetric: (id: string) =>
    request<void>(`/dashboard/daily-metrics/${id}`, { method: 'DELETE' }),
  previewDailyMetricsImport: (csv: string) =>
    request<JsonRecord>('/dashboard/daily-metrics/import/preview', {
      method: 'POST',
      ...jsonBody({ csv }),
    }),
  importDailyMetrics: (csv: string) =>
    request<JsonRecord>('/dashboard/daily-metrics/import', {
      method: 'POST',
      ...jsonBody({ csv }),
    }),
  getBusinessIntelligence: (view: string, query = '') =>
    request<BusinessIntelligenceResponse>(`/business-intelligence/${view}${query}`),
  getCustomer360: (contactId: string) => request<Customer360Response>(`/customer-360/${contactId}`),
  getGlobalSearch: (query = '') => request<GlobalSearchResponse>(`/global-search${query}`),
  getOperationalAgenda: () => request<OperationalAgendaResponse>('/agenda/operational'),
  getPipelineIntelligence: (query = '') =>
    request<PipelineIntelligenceResponse>(`/pipeline/intelligence${query}`),
  getContacts: (query = '') => request<Paginated<Contact>>(`/contacts${query}`),
  getCustomers: (query = '') => request<Paginated<CustomerSummary>>(`/customers${query}`),
  createCustomer: (body: JsonRecord) =>
    request<CustomerSummary>('/customers', { method: 'POST', ...jsonBody(body) }),
  updateCustomer: (id: string, body: JsonRecord) =>
    request<CustomerSummary>(`/customers/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  deactivateCustomer: (id: string) =>
    request<CustomerSummary>(`/customers/${id}/deactivate`, { method: 'POST' }),
  activateCustomer: (id: string) =>
    request<CustomerSummary>(`/customers/${id}/activate`, { method: 'POST' }),
  deleteCustomer: (id: string) => request<void>(`/customers/${id}`, { method: 'DELETE' }),
  getContactAssignees: () => request<Person[]>('/contacts/assignees'),
  createContact: (body: JsonRecord) =>
    request<ContactCreateResult>('/contacts', { method: 'POST', ...jsonBody(body) }),
  createLead: (body: JsonRecord) =>
    request<JsonRecord>('/contacts/leads', { method: 'POST', ...jsonBody(body) }),
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
  createPipelineStage: (body: JsonRecord) =>
    request<PipelineStage>('/pipeline/stages', { method: 'POST', ...jsonBody(body) }),
  getPipelineSummary: (query = '') => request<JsonRecord>(`/pipeline/summary${query}`),
  moveOpportunity: (
    id: string,
    body: {
      pipelineStageId: string;
      reason?: string;
      nextFollowUpAt?: string;
      estimatedPurchaseAt?: string;
    },
  ) => request<Opportunity>(`/opportunities/${id}/move`, { method: 'POST', ...jsonBody(body) }),
  getSales: (query = '') => request<Paginated<Sale>>(`/sales${query}`),
  getSale: (id: string) => request<Sale>(`/sales/${id}`),
  createSale: (body: JsonRecord) => request<Sale>('/sales', { method: 'POST', ...jsonBody(body) }),
  convertOpportunity: (opportunityId: string) =>
    request<Sale>(`/sales/from-opportunity/${opportunityId}`, { method: 'POST' }),
  confirmSale: (id: string, body?: JsonRecord) =>
    request<Sale>(`/sales/${id}/confirm`, { method: 'POST', ...(body ? jsonBody(body) : {}) }),
  updateSale: (id: string, body: JsonRecord) =>
    request<Sale>(`/sales/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  deleteSale: (id: string) => request<void>(`/sales/${id}`, { method: 'DELETE' }),
  createRenewal: (subscriptionId: string) =>
    request<JsonRecord>(`/renewals/from-subscription/${subscriptionId}`, {
      method: 'POST',
      ...jsonBody({}),
    }),
  createPayment: (saleId: string, body: JsonRecord) =>
    request<JsonRecord>(`/sales/${saleId}/payments`, { method: 'POST', ...jsonBody(body) }),
  getPayments: (query = '') =>
    request<{ data: JsonRecord[]; pagination: Pagination }>(`/payments${query}`),
  confirmPayment: (id: string) =>
    request<JsonRecord>(`/payments/${id}/confirm`, { method: 'POST' }),
  getOffers: (query = '') => request<{ data: ProductOffer[] }>(`/catalog/offers${query}`),
  getProducts: (query = '') => request<Paginated<Product>>(`/catalog/products${query}`),
  createProduct: (body: JsonRecord) =>
    request<Product>('/catalog/products', { method: 'POST', ...jsonBody(body) }),
  createProductQuick: (body: JsonRecord) =>
    request<Product>('/catalog/products/quick', { method: 'POST', ...jsonBody(body) }),
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
  createCategoryQuick: (body: JsonRecord) =>
    request<Category>('/catalog/categories/quick', { method: 'POST', ...jsonBody(body) }),
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
  getRevenueCommunicationMetrics: (query = '') =>
    request<RevenueCommunicationMetrics>(`/revenue-intelligence/communication${query}`),
  getWhatsAppConnection: () =>
    request<WhatsAppConnection | null>('/integrations/whatsapp/connection'),
  getCommunicationChannels: () =>
    request<{ data: CommunicationChannelHealth[] }>('/communication/channels'),
  getWhatsAppChannelHealth: () =>
    request<CommunicationChannelHealth>('/communication/channels/whatsapp/health'),
  verifyWhatsAppChannelConfiguration: () =>
    request<CommunicationConfigurationCheck>('/communication/channels/whatsapp/verify', {
      method: 'POST',
    }),
  getWhatsAppReadOnlyHealth: () =>
    request<WhatsAppReadOnlyHealth>('/communication/channels/whatsapp-read-only/health'),
  getWhatsAppReadOnlySyncStatus: () =>
    request<WhatsAppReadOnlySyncStatus>('/communication/channels/whatsapp-read-only/sync-status'),
  syncWhatsAppReadOnly: () =>
    request<WhatsAppReadOnlySyncStatus>('/communication/channels/whatsapp-read-only/sync', {
      method: 'POST',
    }),
  reindexWhatsAppReadOnly: () =>
    request<WhatsAppReadOnlySyncStatus>('/communication/channels/whatsapp-read-only/reindex', {
      method: 'POST',
    }),
  getWhatsAppWebReadOnlyStatus: () =>
    request<WhatsAppWebReadOnlyStatus>('/communication/channels/whatsapp-web-read-only/status'),
  requestWhatsAppWebPairing: () =>
    request<WhatsAppWebReadOnlyStatus>('/communication/channels/whatsapp-web-read-only/pairing', {
      method: 'POST',
    }),
  reconnectWhatsAppWeb: () =>
    request<JsonRecord>('/communication/channels/whatsapp-web-read-only/reconnect', {
      method: 'POST',
    }),
  cancelWhatsAppWebPairing: () =>
    request<JsonRecord>('/communication/channels/whatsapp-web-read-only/cancel', {
      method: 'POST',
    }),
  unlinkWhatsAppWeb: () =>
    request<WhatsAppWebReadOnlyStatus>('/communication/channels/whatsapp-web-read-only/unlink', {
      method: 'POST',
    }),
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
  getSmartInboxConversations: (query = '') =>
    request<SmartInboxListResponse>(`/smart-inbox/conversations${query}`),
  getSmartInboxConversation: (id: string) =>
    request<SmartInboxDetailResponse>(`/smart-inbox/conversations/${id}`),
  getSmartInboxTimeline: (id: string) =>
    request<{ data: SmartInboxTimelineEvent[] }>(`/smart-inbox/conversations/${id}/timeline`),
  markSmartInboxRead: (id: string) =>
    request<{ id: string; unreadCount: number }>(`/smart-inbox/conversations/${id}/read`, {
      method: 'POST',
    }),
  assignSmartInboxConversation: (id: string, assignedUserId: string | null) =>
    request<SmartInboxConversation>(`/smart-inbox/conversations/${id}/assignee`, {
      method: 'PATCH',
      ...jsonBody({ assignedUserId }),
    }),
  sendSmartInboxMessage: (id: string, body: JsonRecord) =>
    request<WhatsAppMessage>(`/smart-inbox/conversations/${id}/messages`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  addSmartInboxNote: (id: string, note: string) =>
    request<JsonRecord>(`/smart-inbox/conversations/${id}/actions/note`, {
      method: 'POST',
      ...jsonBody({ note }),
    }),
  moveSmartInboxPipeline: (id: string, body: { pipelineStageId: string; reason?: string }) =>
    request<Opportunity>(`/smart-inbox/conversations/${id}/actions/move-pipeline`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  createSmartInboxSale: (id: string, body: JsonRecord) =>
    request<Sale>(`/smart-inbox/conversations/${id}/actions/create-sale`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  scheduleSmartInboxFollowUp: (id: string, body: JsonRecord) =>
    request<JsonRecord>(`/smart-inbox/conversations/${id}/actions/follow-up`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  createSmartInboxFulfillment: (id: string, body: JsonRecord) =>
    request<Fulfillment>(`/smart-inbox/conversations/${id}/actions/fulfillment`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  createSmartInboxTrial: (id: string, body: JsonRecord) =>
    request<Trial>(`/smart-inbox/conversations/${id}/actions/trial`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  closeSmartInboxConversation: (id: string) =>
    request<JsonRecord>(`/smart-inbox/conversations/${id}/close`, { method: 'POST' }),
  archiveSmartInboxConversation: (id: string) =>
    request<JsonRecord>(`/smart-inbox/conversations/${id}/archive`, { method: 'POST' }),
  restoreSmartInboxConversation: (id: string) =>
    request<JsonRecord>(`/smart-inbox/conversations/${id}/restore`, { method: 'POST' }),
  subscribeSmartInboxEvents: (onEvent: (event: JsonRecord) => void): (() => void) => {
    const controller = new AbortController();
    const token = useAuthStore.getState().accessToken;
    const consume = async (): Promise<void> => {
      const response = await fetch(`${API_BASE_URL}/smart-inbox/events`, {
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        frames.forEach((frame) => {
          const line = frame.split('\n').find((entry) => entry.startsWith('data:'));
          if (!line) return;
          try {
            const parsed = JSON.parse(line.slice(5).trim()) as JsonRecord;
            onEvent(parsed);
          } catch {
            // SSE frames are ignored when malformed; the next frame remains consumable.
          }
        });
      }
    };
    void consume().catch(() => undefined);
    return () => controller.abort();
  },
  getFinancialDashboard: (query = '') =>
    request<FinancialDashboard>(`/financial/dashboard${query}`),
  getCommissionConfigs: () => request<JsonRecord[]>('/commissions'),
  updateCommissionConfig: (body: JsonRecord) =>
    request<JsonRecord>('/commissions', { method: 'PATCH', ...jsonBody(body) }),
  getExchangeRates: () => request<JsonRecord[]>('/exchange-rates'),
  getMarketingCampaigns: (query = '') =>
    request<Paginated<MarketingCampaign>>(`/marketing/campaigns${query}`),
  createMarketingCampaign: (body: JsonRecord) =>
    request<MarketingCampaign>('/marketing/campaigns', { method: 'POST', ...jsonBody(body) }),
  updateMarketingCampaign: (id: string, body: JsonRecord) =>
    request<MarketingCampaign>(`/marketing/campaigns/${id}`, {
      method: 'PATCH',
      ...jsonBody(body),
    }),
  archiveMarketingCampaign: (id: string) =>
    request<JsonRecord>(`/marketing/campaigns/${id}/archive`, { method: 'POST' }),
  getMarketingSpend: (query = '') => request<Paginated<MarketingSpend>>(`/marketing/spend${query}`),
  createMarketingSpend: (body: JsonRecord) =>
    request<MarketingSpend>('/marketing/spend', { method: 'POST', ...jsonBody(body) }),
  updateMarketingSpend: (id: string, body: JsonRecord) =>
    request<MarketingSpend>(`/marketing/spend/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  archiveMarketingSpend: (id: string) =>
    request<JsonRecord>(`/marketing/spend/${id}/archive`, { method: 'POST' }),
  getMarketingPerformance: (query = '') =>
    request<MarketingPerformanceResponse>(`/marketing/performance${query}`),
  getMarketingAttribution: (query = '') =>
    request<MarketingAttribution[]>(`/marketing/attribution${query}`),
  createMarketingAttribution: (body: JsonRecord) =>
    request<MarketingAttribution>('/marketing/attribution', { method: 'POST', ...jsonBody(body) }),
  getMarketingLossReasons: (type?: string) =>
    request<MarketingLossReason[]>(`/marketing/loss-reasons${queryString({ type })}`),
  createMarketingLossReason: (body: JsonRecord) =>
    request<MarketingLossReason>('/marketing/loss-reasons', { method: 'POST', ...jsonBody(body) }),
  updateMarketingLossReason: (id: string, body: JsonRecord) =>
    request<MarketingLossReason>(`/marketing/loss-reasons/${id}`, {
      method: 'PATCH',
      ...jsonBody(body),
    }),
  getProspectState: (contactId: string) =>
    request<ProspectConversationState | null>(`/marketing/prospect-states/${contactId}`),
  changeProspectState: (contactId: string, body: JsonRecord) =>
    request<ProspectConversationState>(`/marketing/prospect-states/${contactId}`, {
      method: 'POST',
      ...jsonBody(body),
    }),
  getMarketingEngagementSettings: () => request<JsonRecord>('/marketing/settings/engagement'),
  updateMarketingEngagementSettings: (body: JsonRecord) =>
    request<JsonRecord>('/marketing/settings/engagement', { method: 'PATCH', ...jsonBody(body) }),
  previewCommercialImport: (body: JsonRecord) =>
    request<JsonRecord>('/marketing/imports/preview', { method: 'POST', ...jsonBody(body) }),
  executeCommercialImport: (body: JsonRecord) =>
    request<CommercialImport>('/marketing/imports', { method: 'POST', ...jsonBody(body) }),
  getCommercialImports: () => request<CommercialImport[]>('/marketing/imports'),
  getRenewalDashboard: (query = '') =>
    request<RenewalCenterDashboard>(`/renewal-center/dashboard${query}`),
  getRenewals: (query = '') =>
    request<Paginated<RenewalCenterItem>>(`/renewal-center/upcoming${query}`),
  getRenewalsToday: (query = '') =>
    request<Paginated<RenewalCenterItem>>(`/renewal-center/today${query}`),
  getRenewalsOverdue: (query = '') =>
    request<Paginated<RenewalCenterItem>>(`/renewal-center/overdue${query}`),
  getRenewalCalendar: (query = '') =>
    request<{ data: Array<{ date: string; items: RenewalCenterItem[] }> }>(
      `/renewal-center/calendar${query}`,
    ),
  getRenewalHistory: (query = '') =>
    request<Paginated<RenewalCenterItem>>(`/renewal-center/history${query}`),
  updateRenewalWorkflow: (id: string, body: JsonRecord) =>
    request<RenewalCenterItem>(`/renewal-center/${id}/workflow-status`, {
      method: 'PATCH',
      ...jsonBody(body),
    }),
  payRenewal: (id: string) => request<RenewalCenterItem>(`/renewals/${id}/pay`, { method: 'POST' }),
  generateRenewalReminders: () =>
    request<{ created: number; delivered: number }>('/renewal-center/reminders/generate', {
      method: 'POST',
    }),
  getRenewalReminders: () => request<JsonRecord[]>('/renewal-center/reminders'),
  getRenewalReport: (query = '') => request<RenewalCenterReport>(`/renewal-center/reports${query}`),
  previewRenewalImport: (csv: string) =>
    request<JsonRecord>('/renewal-center/import/preview', { method: 'POST', ...jsonBody({ csv }) }),
  importRenewals: (csv: string) =>
    request<JsonRecord>('/renewal-center/import', { method: 'POST', ...jsonBody({ csv }) }),
  getCustomerLifecycle: (contactId: string) =>
    request<JsonRecord>(`/renewal-center/customers/${contactId}`),
  getFinancialCategories: () => request<FinancialCategory[]>('/financial/categories'),
  createFinancialCategory: (body: JsonRecord) =>
    request<FinancialCategory>('/financial/categories', { method: 'POST', ...jsonBody(body) }),
  updateFinancialCategory: (id: string, body: JsonRecord) =>
    request<FinancialCategory>(`/financial/categories/${id}`, {
      method: 'PATCH',
      ...jsonBody(body),
    }),
  archiveFinancialCategory: (id: string) =>
    request<FinancialCategory>(`/financial/categories/${id}/archive`, { method: 'POST' }),
  getFinancialExpenses: (query = '') =>
    request<Paginated<FinancialExpense>>(`/financial/expenses${query}`),
  createFinancialExpense: (body: JsonRecord) =>
    request<FinancialExpense>('/financial/expenses', { method: 'POST', ...jsonBody(body) }),
  updateFinancialExpense: (id: string, body: JsonRecord) =>
    request<FinancialExpense>(`/financial/expenses/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  archiveFinancialExpense: (id: string) =>
    request<FinancialExpense>(`/financial/expenses/${id}/archive`, { method: 'POST' }),
  getRecurringExpenses: () => request<JsonRecord[]>('/financial/recurring'),
  createRecurringExpense: (body: JsonRecord) =>
    request<JsonRecord>('/financial/recurring', { method: 'POST', ...jsonBody(body) }),
  updateRecurringExpense: (id: string, body: JsonRecord) =>
    request<JsonRecord>(`/financial/recurring/${id}`, { method: 'PATCH', ...jsonBody(body) }),
  generateRecurringExpenses: () =>
    request<{ generated: number }>('/financial/recurring/generate', { method: 'POST' }),
};

export function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}
