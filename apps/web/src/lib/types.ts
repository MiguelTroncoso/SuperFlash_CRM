export type JsonRecord = Record<string, unknown>;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  timezone: string;
  organization: { id: string; name: string; slug: string };
  role: { id: string; name: string };
  permissions: string[];
}

export interface AuthSessionResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  source: string | null;
  isCustomer: boolean;
  archivedAt: string | null;
  lastActivityAt: string | null;
  assignedTo: Person | null;
  tags: Tag[];
  activeOpportunity: Opportunity | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactCreateResult extends Contact {
  warnings?: Array<{ code: string; existingContactId: string }>;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  category: string;
  order: number;
  active: boolean;
  systemKey: string | null;
}

export interface Opportunity {
  id: string;
  title: string;
  notes: string | null;
  expectedAmount: string | null;
  currency: string | null;
  status: string;
  archivedAt: string | null;
  contact: { id: string; displayName: string | null; phone: string | null; country: string | null };
  pipelineStage: PipelineStage;
  assignedTo: Person | null;
  campaign: NamedRelation | null;
  product: NamedRelation | null;
  createdAt: string;
  updatedAt: string;
}

export interface NamedRelation {
  id: string;
  name: string;
}

export interface PipelineColumn extends PipelineStage {
  opportunities: Opportunity[];
  nextCursor: string | null;
}

export interface PipelineResponse {
  stages: PipelineColumn[];
  pagination?: Pagination;
}

export interface Sale {
  id: string;
  status: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  contact: NamedRelation | null;
  opportunity: NamedRelation | null;
  seller: Person | null;
  items: JsonRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductOffer {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  type: string;
  fulfillmentMode: string;
  requiresSubscription: boolean;
  allowsDemo: boolean;
  price: { amount?: string; currency?: string } | null;
  plans: JsonRecord[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  currency: string;
  imageUrl: string | null;
  category: Category | null;
  type: string;
  fulfillmentMode: string;
  status: string;
  active: boolean;
  publicVisible: boolean;
  displayOrder: number;
  requiresSubscription: boolean;
  allowsDemo: boolean;
  plans: ProductPlan[];
  variants: JsonRecord[];
  stock: ProductStock;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  order: number;
  archivedAt: string | null;
}

export interface ProductPlan {
  id: string;
  productId?: string;
  name: string;
  code: string | null;
  customerSegment: string;
  billingPeriodUnit: string;
  billingPeriodCount: number;
  active: boolean;
  order: number;
  quantity?: string | null;
  creditAmount?: string | null;
}

export interface PriceBook {
  id: string;
  name: string;
  description: string | null;
  status: string;
  customerSegment: string;
  countryCode: string | null;
  currency: string;
  validFrom: string | null;
  validUntil: string | null;
  isDefault: boolean;
  priority: number;
  archivedAt: string | null;
}

export interface PriceEntry {
  id: string;
  priceBookId: string;
  productId: string;
  planId: string | null;
  variantId: string | null;
  salePrice: string;
  costPrice?: string | null;
  minimumPrice?: string | null;
  taxIncluded: boolean;
  active: boolean;
  validFrom: string | null;
  validUntil: string | null;
}

export interface ProductStock {
  productId: string;
  trackingEnabled: boolean;
  quantity: number;
  reserved: number;
  available: number;
  minimum: number;
}

export interface StockMovement {
  id: string;
  quantityBefore: number;
  quantityDelta: number;
  quantityAfter: number;
  reason: string;
  createdAt: string;
  changedBy: Person | null;
}

export interface Provider {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  fulfillmentMode: string;
  apiBaseUrl: string | null;
  metadata: JsonRecord | null;
  notes: string | null;
  mappings?: ProviderMapping[];
  createdAt: string;
  updatedAt: string;
}

export interface ProviderMapping {
  id: string;
  providerId: string;
  productId: string;
  planId: string | null;
  variantId: string | null;
  externalProductId: string | null;
  externalPlanId: string | null;
  externalVariantId: string | null;
  priority: number;
  active: boolean;
}

export interface Fulfillment {
  id: string;
  saleId: string;
  saleItemId: string;
  subscriptionId: string | null;
  providerId: string | null;
  assignedUserId: string | null;
  status: string;
  mode: string;
  quantity: string;
  attemptCount: number;
  failureReason: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface CredentialRecord {
  id: string;
  credentialKey: string;
  username: string | null;
  password: string | null;
  url: string | null;
  token: string | null;
  expiresAt: string | null;
  instructions: string | null;
  status: string;
  masked: boolean;
}

export interface Trial {
  id: string;
  status: string;
  contactId: string;
  productId: string;
  ownerId: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  notes: string | null;
}

export interface Activation {
  id: string;
  fulfillmentId: string;
  subscriptionId: string | null;
  providerId: string;
  status: string;
  activatedAt: string | null;
  expiresAt: string | null;
  externalReference: string | null;
  createdAt: string;
}

export interface MyDaySection<T = JsonRecord> {
  data: T[];
  total: number;
  hasMore: boolean;
}

export interface MyDayResponse {
  generatedAt: string;
  timezone: string;
  sections: Record<string, MyDaySection>;
}

export interface MyDaySummary {
  [key: string]: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  slug: string;
  channel: string;
  status: string;
  subject: string | null;
  body: string;
  variables: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationAction {
  id: string;
  actionOrder: number;
  type: string;
  config: JsonRecord;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: unknown;
  active: boolean;
  template: { id: string; name: string; slug: string } | null;
  actions: AutomationAction[];
  createdAt: string;
  updatedAt: string;
}

export interface AutomationExecution {
  id: string;
  automationRuleId: string;
  ruleName: string;
  trigger: string;
  sourceEventId: string;
  aggregateType: string;
  aggregateId: string;
  requestId: string;
  status: string;
  attempts: number;
  availableAt: string;
  processingAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  resultPayload: unknown;
  createdAt: string;
  actions: Array<{
    id: string;
    actionOrder: number;
    type: string;
    status: string;
    errorMessage: string | null;
    resultPayload: unknown;
    completedAt: string | null;
  }>;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  actionUrl: string | null;
  metadata: unknown;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface RevenueFilters {
  from?: string;
  to?: string;
  country?: string;
  sellerId?: string;
  productId?: string;
  providerId?: string;
  currency?: string;
}

export interface RevenueMoneyMetric {
  currency: string;
  amount: string;
  count: number;
}

export interface RevenueConversionRow {
  key: string;
  label: string;
  opportunities: number;
  conversions: number;
  conversionRate: number;
}

export interface RevenueKpis {
  salesToday: RevenueMoneyMetric[];
  salesMonth: RevenueMoneyMetric[];
  mrr: RevenueMoneyMetric[];
  arr: RevenueMoneyMetric[];
  newCustomers: number;
  activeCustomers: number;
  lostCustomers: number;
  averageTimeToSaleDays: number;
  averageActivationDays: number;
  averageCloseDays: number;
  successfulRenewals: number;
  churnRate: number;
  trialToSaleRate: number;
  averageTicket: RevenueMoneyMetric[];
  ltvBasic: RevenueMoneyMetric[];
  conversionByStage: RevenueConversionRow[];
  conversionBySeller: RevenueConversionRow[];
  conversionByCountry: RevenueConversionRow[];
}

export interface RevenueTrendPoint {
  date: string;
  currency: string;
  revenue: string;
  sales: number;
  customers: number;
}

export interface RevenueFunnelStage {
  key: string;
  label: string;
  count: number;
  conversionRate: number;
}

export interface RevenueFunnel {
  name: string;
  stages: RevenueFunnelStage[];
  comparison?: RevenueFunnelStage[];
}

export interface RevenueCohortRow {
  cohortMonth: string;
  period: number;
  acquired: number;
  retained: number;
  retentionRate: number;
  revenue: string;
  currency: string;
}

export interface RevenueForecastPoint {
  month: string;
  amount: string;
}

export interface RevenueForecast {
  currency: string;
  method: string;
  history: RevenueForecastPoint[];
  forecast: RevenueForecastPoint[];
  horizonMonths: number;
}

export interface RevenueDashboard {
  generatedAt: string;
  filters: RevenueFilters & { from: string; to: string };
  kpis: RevenueKpis;
  trends: RevenueTrendPoint[];
  funnel: RevenueFunnel;
  forecast: RevenueForecast[];
}

export interface WhatsAppConnection {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  businessPhoneNumber: string;
  graphApiVersion: string;
  status: string;
  accessToken: string;
  appSecret: string;
  webhookVerifyToken: string;
  lastHealthcheckAt: string | null;
  lastHealthcheckError: string | null;
  lastWebhookReceivedAt: string | null;
}

export interface WhatsAppConversation {
  id: string;
  externalContactPhone: string;
  externalContactPhoneNormalized: string;
  externalContactName: string | null;
  status: string;
  windowStartedAt: string | null;
  windowExpiresAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  contact: { id: string; name: string; phone: string | null } | null;
  assignedTo: Person | null;
}

export interface WhatsAppMessage {
  id: string;
  externalMessageId: string | null;
  direction: string;
  type: string;
  status: string;
  text: string | null;
  templateName: string | null;
  templateLanguage: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  caption: string | null;
  location: JsonRecord | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string | null;
  category: string | null;
  status: string;
  components: unknown;
  updatedAt: string;
}

export interface SmartInboxConversation {
  id: string;
  avatar: string;
  name: string;
  externalContactName: string | null;
  phone: string;
  phoneNormalized: string;
  flag: string;
  country: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  responsible: string | null;
  assignedTo: Person | null;
  pipeline: Pick<PipelineStage, 'id' | 'name' | 'color' | 'category'> | null;
  opportunity: { id: string; title: string } | null;
  tags: Tag[];
  source: string | null;
  channel: string;
  status: string;
  window: { open: boolean; expiresAt: string | null };
  unreadCount: number;
  isVip: boolean;
  renewalDue: boolean;
  chips: string[];
}

export interface SmartInboxMessage {
  id: string;
  direction: string;
  type: string;
  status: string;
  text: string | null;
  templateName?: string | null;
  caption?: string | null;
  createdAt: string;
}

export interface SmartInboxTimelineEvent {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  occurredAt: string;
  metadata: JsonRecord | null;
}

export interface SmartInboxPanelSale {
  id: string;
  status: string;
  total: string;
  currency: string;
  createdAt: string;
  items: Array<{
    id: string;
    saleId: string;
    productId: string;
    productNameSnapshot: string;
    quantity: string;
    unitPrice: string;
    total: string;
    currency: string;
    requiresSubscriptionSnapshot: boolean;
  }>;
}

export interface SmartInboxPanel {
  contact: Contact & { source: string | null };
  opportunities: Array<{
    id: string;
    title: string;
    pipelineStage: PipelineStage;
    campaign: NamedRelation | null;
    product: NamedRelation | null;
    assignedTo: Person | null;
  }>;
  sales: SmartInboxPanelSale[];
  subscriptions: JsonRecord[];
  trials: JsonRecord[];
  followUps: JsonRecord[];
  metrics: {
    firstResponseSeconds: number | null;
    averageResponseSeconds: number | null;
    messageCount: number;
    saleCount: number;
    revenue: string;
    mrr: string;
    ltv: string;
    lastPurchaseAt: string | null;
    nextRenewalAt: string | null;
    activeProducts: string[];
  };
}

export interface SmartInboxListResponse extends Paginated<SmartInboxConversation> {
  views: Record<string, number>;
}

export interface SmartInboxDetailResponse {
  conversation: SmartInboxConversation;
  messages: SmartInboxMessage[];
  timeline: SmartInboxTimelineEvent[];
  panel: SmartInboxPanel;
}
