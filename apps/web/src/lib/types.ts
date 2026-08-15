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
  followUpDays?: number | null;
}

export interface Opportunity {
  id: string;
  title: string;
  notes: string | null;
  expectedAmount: string | null;
  currency: string | null;
  estimatedPurchaseAt: string | null;
  status: string;
  archivedAt: string | null;
  lastStageChangedAt: string | null;
  contact: { id: string; displayName: string | null; phone: string | null; country: string | null };
  pipelineStage: PipelineStage;
  assignedTo: Person | null;
  campaign: NamedRelation | null;
  category: NamedRelation | null;
  product: NamedRelation | null;
  nextFollowUp: {
    id: string;
    title: string;
    dueAt: string;
    status: string;
    autoSuggested?: boolean;
  } | null;
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
  category: { id: string; name: string; slug: string } | null;
  type: string;
  fulfillmentMode: string;
  requiresSubscription: boolean;
  allowsDemo: boolean;
  price: { amount?: string; currency?: string } | null;
  stock: {
    trackingEnabled: boolean;
    quantity: number;
    reserved: number;
    available: number;
    minimum: number;
  };
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
  movementType: string;
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

export interface OperationalDashboard {
  period: { from: string; to: string };
  today: {
    conversations: number;
    demos: number;
    informativeSales: number;
    adSpend: Array<{ currency: string; amount: string }>;
    grossRevenue: Array<{ currency: string; amount: string }>;
    followups: number;
  };
  month: {
    conversations: number;
    demos: number;
    sales: number;
    conversionConversationToDemo: number;
    conversionDemoToSale: number;
    conversionConversationToSale: number;
    grossBilling: Array<{ currency: string; amount: string }>;
    netIncome: Array<{ currency: string; amount: string }>;
    profit: Array<{ currency: string; amount: string }>;
    averageTicket: Array<{ currency: string; amount: string }>;
    adSpend: string;
    costPerConversation: string;
    costPerDemo: string;
    cpa: string;
    roas: string;
  };
  manualActivity: JsonRecord;
  financialReal: JsonRecord;
  byCountry: Array<{
    country: string;
    conversations: number;
    demos: number;
    informativeSales: number;
    adSpend: string;
    grossRevenue: string;
  }>;
  pendingCollections: Array<{ currency: string; balance: string }>;
  renewalsDueSoon: number;
  criticalStock: number;
  sourceOfTruth: { manualActivity: string; financialSales: string; financialSalesCount: string };
}

export interface DailyMetric {
  id: string;
  metricDate: string;
  campaign: NamedRelation | null;
  country: string;
  conversations: number;
  demos: number;
  salesCount: number;
  adSpend: string;
  grossRevenue: string | null;
  currency: string;
  notes: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntelligenceMoneyMetric {
  currency: string;
  amount: string;
  count: number;
}

export interface IntelligenceDashboard {
  generatedAt: string;
  period: { from: string; to: string };
  kpis: {
    salesToday: IntelligenceMoneyMetric[];
    salesWeek: IntelligenceMoneyMetric[];
    salesMonth: IntelligenceMoneyMetric[];
    billingToday: IntelligenceMoneyMetric[];
    billingMonth: IntelligenceMoneyMetric[];
    mrr: IntelligenceMoneyMetric[];
    arr: IntelligenceMoneyMetric[];
    activeCustomers: number;
    newCustomers: number;
    lostCustomers: number;
    renewalsMonth: number;
    pendingRenewals: number;
    pendingBalance: Array<{ currency: string; amount: string }>;
    pendingFulfillments: number;
    pendingActivations: number;
    conversion: number;
  };
  charts: {
    revenueDaily: Array<{ date: string; currency: string; revenue: string; sales: number }>;
    revenueMonthly: Array<{ month: string; currency: string; revenue: string; sales: number }>;
    salesCountry: Array<{ country: string; currency: string; revenue: string; sales: number }>;
    salesProduct: Array<{
      product: string;
      currency: string;
      revenue: string;
      units: string;
      sales: number;
    }>;
    newCustomersWeekly: Array<{ week: string; customers: number }>;
    funnel: Array<{ stage: string; category: string; count: number }>;
    renewalsTrend: Array<{
      month: string;
      status: string;
      currency: string;
      count: number;
      amount: string;
    }>;
    mrrHistory: Array<{ month: string; currency: string; mrr: string }>;
  };
}

export interface BusinessIntelligenceResponse {
  generatedAt: string;
  period: { from: string; to: string };
  view: string;
  data: JsonRecord | Array<JsonRecord>;
}

export interface Customer360Response {
  contact: JsonRecord;
  opportunities: JsonRecord[];
  activities: JsonRecord[];
  followUps: JsonRecord[];
  conversations: JsonRecord[];
  sales: JsonRecord[];
  payments: JsonRecord[];
  subscriptions: JsonRecord[];
  renewals: JsonRecord[];
  products: JsonRecord[];
  fulfillments: JsonRecord[];
  activations: JsonRecord[];
  credentials: JsonRecord[];
  timeline: JsonRecord[];
  metrics: JsonRecord;
}

export interface GlobalSearchResult {
  type: string;
  id: string;
  label: string;
  detail: string | null;
  href: string;
  masked?: boolean;
}

export interface GlobalSearchResponse {
  query: string;
  results: GlobalSearchResult[];
}

export interface OperationalAgendaResponse {
  generatedAt: string;
  sections: Record<
    string,
    Array<{ id: string; title: string; dueAt: string | null; detail: string; href: string }>
  >;
}

export interface PipelineIntelligenceItem extends JsonRecord {
  id: string;
  title: string;
  expectedAmount: string | null;
  currency: string | null;
  probability: number;
  priority: string;
  ageDays: number;
  daysInStage: number | null;
  weightedValue: string | null;
  stalled: boolean;
  createdAt: string;
  lastStageChangedAt: string | null;
  contact: JsonRecord;
  pipelineStage: JsonRecord;
  owner: Person | null;
  product: NamedRelation | null;
  campaign: NamedRelation | null;
  nextFollowUp: JsonRecord | null;
}

export interface PipelineIntelligenceResponse {
  data: PipelineIntelligenceItem[];
  pagination: Pagination;
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
  communication: RevenueCommunicationMetrics;
}

export interface RevenueCommunicationMetrics {
  generatedAt: string;
  period: { from: string; to: string };
  conversationsToday: number;
  conversationsByCountry: Array<{ country: string; conversations: number }>;
  messagesToday: number;
  messagesThisWeek: number;
  messagesThisMonth: number;
  newContacts: number;
  activeCustomers: number;
  inactiveCustomers: number;
  minutesSinceLastMessage: number | null;
  topCountry: { country: string; conversations: number } | null;
  topContact: { contactId: string; name: string; messages: number } | null;
  topConversations: Array<{
    conversationId: string;
    contactId: string;
    name: string;
    messages: number;
    lastMessageAt: string | null;
  }>;
  activityByHour: Array<{ hour: number; messages: number }>;
  activityByDay: Array<{ day: number; messages: number }>;
  activityByMonth: Array<{ month: string; messages: number }>;
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

export interface CommunicationChannelHealth {
  channel: 'WHATSAPP';
  provider: string;
  status: string;
  configured: boolean;
  graphVersion: string;
  webhookPath: string;
  phoneNumber: string | null;
  lastSynchronizedAt: string | null;
  lastMessageReceivedAt: string | null;
  lastMessageSentAt: string | null;
  lastError: string | null;
  missingConfiguration: string[];
}

export interface CommunicationConfigurationCheck {
  channel: 'WHATSAPP';
  provider: string;
  enabled: boolean;
  graphVersion: string;
  missingConfiguration: string[];
  webhookPath: string;
  externalRequestMade: boolean;
}

export interface WhatsAppReadOnlyHealth {
  channel: 'WHATSAPP_READ_ONLY';
  provider: string;
  status: string;
  readOnly: true;
  externalWriteEnabled: false;
  externalRequestMade: false;
  source: string;
  lastWebhookReceivedAt: string | null;
  checkpoint: WhatsAppReadOnlySyncStatus | null;
  totals: { messages: number; conversations: number };
  metrics: Record<string, number>;
}

export interface WhatsAppReadOnlySyncStatus {
  id?: string;
  status: string;
  checkpoint: { at: string | null; id: string | null };
  lastSynchronizedAt: string | null;
  lastSuccessfulAt: string | null;
  messagesImported: number;
  conversationsImported: number;
  contactsImported: number;
  duplicatesAvoided: number;
  errors: number;
  nextRetryAt: string | null;
  lastError: string | null;
  readOnly: true;
  externalWriteEnabled: false;
}

export interface WhatsAppWebReadOnlyStatus {
  channel: 'WHATSAPP_WEB_READ_ONLY';
  provider: string;
  configured: boolean;
  missingConfiguration: string[];
  status: string;
  qr: string | null;
  qrExpiresAt: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastMessageAt: string | null;
  lastSynchronizationAt: string | null;
  number: string | null;
  historicalDiscarded: number;
  duplicatesAvoided: number;
  reconnects: number;
  ingestionStartedAt: string | null;
  firstAcceptedAt: string | null;
  lastError: string | null;
  readOnly: true;
  externalWriteEnabled: false;
}

export interface FinancialCategory {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialExpense {
  id: string;
  amount: string;
  currency: string;
  expenseDate: string;
  vendorName: string | null;
  description: string | null;
  paymentMethod: string;
  frequency: string;
  active: boolean;
  notes: string | null;
  receiptUrl: string | null;
  generated: boolean;
  category: { id: string; name: string; color: string | null } | null;
}

export interface FinancialDashboard {
  month: string;
  currency: string | null;
  revenue: string;
  expenses: string;
  grossProfit: string;
  netProfit: string;
  marginPercent: number;
  mrr: string;
  arr: string;
  estimatedCash: string;
  fixedMonthlyCost: string;
  variableCost: string;
  breakEven: string;
  previousMonth: { revenue: string; expenses: string; netProfit: string };
  upcomingRecurringExpenses: Array<{
    id: string;
    name: string;
    amount: string;
    currency: string;
    nextOccurrenceDate: string | null;
  }>;
  monthlyTrend: Array<{ month: string; revenue: string; expenses: string; netProfit: string }>;
}

export interface RenewalCenterItem {
  id: string;
  subscriptionId: string;
  sourceSaleId: string;
  generatedSaleId: string | null;
  status: string;
  workflowStatus: string;
  workflowLabel: string;
  amount: string;
  currency: string;
  dueAt: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  product: { id: string | null; name: string };
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
  };
  assignedTo: Person | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RenewalCenterDashboard {
  generatedAt: string;
  period: { from: string; to: string };
  cards: {
    today: number;
    next7Days: number;
    next15Days: number;
    next30Days: number;
    upcomingAmount: RevenueMoneyMetric[];
    renewedAmount: RevenueMoneyMetric[];
    lostAmount: RevenueMoneyMetric[];
    mrrRenewable: RevenueMoneyMetric[];
    renewalRate: number;
    atRiskCustomers: number;
    projectedRevenue: RevenueMoneyMetric[];
    recoveredRevenue: RevenueMoneyMetric[];
    previousMonthRenewedAmount: RevenueMoneyMetric[];
  };
  financial: { currentExpenses: RevenueMoneyMetric[]; projectedProfit: RevenueMoneyMetric[] };
  critical: RenewalCenterItem[];
  upcoming: RenewalCenterItem[];
  history: RenewalCenterItem[];
}

export interface RenewalCenterReport {
  groupBy: string;
  data: Array<{ label: string; currency: string; amount: string; count: number; paid: number }>;
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

export interface MarketingCampaign {
  id: string;
  name: string;
  code: string | null;
  platform: string;
  source: string;
  status: string;
  active: boolean;
  targetedCountry: string | null;
  counts: { adSets: number; ads: number; creatives: number };
  createdAt: string;
  updatedAt: string;
}

export interface MarketingPerformanceMetric {
  campaignId: string;
  campaignName: string;
  platform: string;
  source: string;
  currency: string;
  spend: string;
  conversations: number;
  contacts: number;
  demos: number;
  sales: number;
  grossRevenue: string;
  netRevenue: string;
  profit: string | null;
  costPerConversation: string | null;
  costPerContact: string | null;
  costPerDemo: string | null;
  cpa: string | null;
  grossRoas: string | null;
  netRoas: string | null;
  conversationToDemoConversion: string | null;
  demoToSaleConversion: string | null;
  conversationToSaleConversion: string | null;
  averageTicket: string | null;
  averageTimeToSaleSeconds: number | null;
  unansweredPercentage: string | null;
  averageFollowUpsBeforePurchase: string | null;
}

export interface MarketingPerformanceResponse {
  from: string;
  to: string;
  currencies: string[];
  data: MarketingPerformanceMetric[];
}

export interface MarketingSpend {
  id: string;
  amount: string;
  currency: string;
  expenseDate: string;
  source: string;
  campaign: NamedRelation | null;
  adSet: NamedRelation | null;
  ad: NamedRelation | null;
  creative: NamedRelation | null;
  conversations: number | null;
  contacts: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  cpmInput: string | null;
  cpcInput: string | null;
  ctrInput: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MarketingAttribution {
  id: string;
  kind: string;
  platform: string;
  source: string;
  targetedCountry: string | null;
  actualCountry: string | null;
  acquiredAt: string;
  campaign: NamedRelation | null;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    country: string | null;
  } | null;
}

export interface ProspectConversationState {
  id: string;
  contactId: string;
  state: string;
  lastFollowUpAt: string | null;
  nextFollowUpAt: string | null;
  unansweredAttempts: number;
  lastFollowUpResult: string | null;
  changeReason: string | null;
  updatedAt: string;
  contact?: { id: string; firstName: string | null; lastName: string | null };
}

export interface MarketingLossReason {
  id: string;
  type: string;
  systemKey: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface CommercialImport {
  id: string;
  type: string;
  status: string;
  idempotencyKey: string;
  fileName: string | null;
  rowCount: number;
  succeededCount: number;
  skippedCount: number;
  failedCount: number;
  report: JsonRecord | null;
  createdAt: string;
  updatedAt: string;
}
