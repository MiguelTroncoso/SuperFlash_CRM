CREATE TYPE "MarketingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "MarketingSpendSource" AS ENUM ('MANUAL', 'IMPORT');
CREATE TYPE "AttributionKind" AS ENUM ('ORIGINAL', 'CONVERSION');
CREATE TYPE "ProspectConversationStateType" AS ENUM ('NEW_UNANSWERED', 'RESPONDED', 'ACTIVE_CONVERSATION', 'WAITING_CUSTOMER', 'DEMO_REQUESTED', 'DEMO_SENT', 'DEMO_ACTIVE', 'DEMO_EXPIRED', 'FOLLOW_UP_SCHEDULED', 'NO_RESPONSE_FOLLOW_UP_1', 'NO_RESPONSE_FOLLOW_UP_2', 'NO_RESPONSE_FOLLOW_UP_3', 'FUTURE_REACTIVATION', 'NOT_INTERESTED', 'LOST', 'PURCHASED');
CREATE TYPE "ProspectReasonType" AS ENUM ('LOSS', 'OBJECTION', 'SILENCE');
CREATE TYPE "FollowUpResult" AS ENUM ('RESPONDED', 'NO_RESPONSE', 'INTERESTED', 'NOT_INTERESTED', 'PAYMENT_PROMISE', 'DEMO_REQUESTED', 'DEMO_SENT', 'RESCHEDULED', 'PURCHASED', 'FUTURE_REACTIVATION', 'OTHER');
CREATE TYPE "ResponseSlaBucket" AS ENUM ('UNDER_5_MIN', 'UNDER_15_MIN', 'UNDER_60_MIN', 'OVER_60_MIN', 'UNANSWERED');
CREATE TYPE "CommercialCycleBucket" AS ENUM ('SAME_DAY', 'ONE_DAY', 'TWO_TO_THREE_DAYS', 'FOUR_TO_SEVEN_DAYS', 'EIGHT_TO_FOURTEEN_DAYS', 'OVER_FOURTEEN_DAYS');
CREATE TYPE "CommercialImportType" AS ENUM ('CONTACTS', 'HISTORICAL_SALES', 'PAYMENTS', 'SUBSCRIPTIONS', 'DEMOS', 'ATTRIBUTION', 'OUTSTANDING_BALANCES');
CREATE TYPE "CommercialImportStatus" AS ENUM ('PREVIEW', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "CommercialImportRowStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED');

ALTER TABLE "Campaign"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "status" "MarketingStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "objective" TEXT,
  ADD COLUMN "targetedCountry" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "Expense"
  ADD COLUMN "adSetId" UUID,
  ADD COLUMN "adId" UUID,
  ADD COLUMN "creativeId" UUID,
  ADD COLUMN "conversations" INTEGER,
  ADD COLUMN "contacts" INTEGER,
  ADD COLUMN "impressions" INTEGER,
  ADD COLUMN "reach" INTEGER,
  ADD COLUMN "clicks" INTEGER,
  ADD COLUMN "cpmInput" DECIMAL(18,6),
  ADD COLUMN "cpcInput" DECIMAL(18,6),
  ADD COLUMN "ctrInput" DECIMAL(18,6),
  ADD COLUMN "source" "MarketingSpendSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "createdByUserId" UUID,
  ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "Sale"
  ADD COLUMN "baseCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateSnapshot" JSONB;

ALTER TABLE "Payment"
  ADD COLUMN "baseCurrency" TEXT,
  ADD COLUMN "exchangeRate" DECIMAL(18,8),
  ADD COLUMN "exchangeRateSnapshot" JSONB;

ALTER TABLE "Fulfillment"
  ADD COLUMN "costAmount" DECIMAL(18,2),
  ADD COLUMN "costCurrency" TEXT;

ALTER TABLE "FollowUp"
  ADD COLUMN "result" "FollowUpResult";

ALTER TABLE "FollowUpHistory"
  ADD COLUMN "result" "FollowUpResult";

ALTER TABLE "WhatsAppConversation"
  ADD COLUMN "firstInboundMessageAt" TIMESTAMP(3),
  ADD COLUMN "firstAgentResponseAt" TIMESTAMP(3),
  ADD COLUMN "firstResponseDurationSeconds" INTEGER,
  ADD COLUMN "firstResponseBucket" "ResponseSlaBucket";

CREATE TABLE "MarketingAdSet" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "externalId" TEXT,
  "name" TEXT NOT NULL,
  "targetedCountry" TEXT,
  "audience" TEXT,
  "status" "MarketingStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "MarketingAdSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingAd" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "adSetId" UUID,
  "externalId" TEXT,
  "name" TEXT NOT NULL,
  "status" "MarketingStatus" NOT NULL DEFAULT 'ACTIVE',
  "destination" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "MarketingAd_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCreative" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "adId" UUID,
  "name" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "headline" TEXT,
  "body" TEXT,
  "assetReference" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "MarketingCreative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attribution" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "kind" "AttributionKind" NOT NULL,
  "contactId" UUID,
  "conversationId" UUID,
  "opportunityId" UUID,
  "trialId" UUID,
  "saleId" UUID,
  "campaignId" UUID,
  "adSetId" UUID,
  "adId" UUID,
  "creativeId" UUID,
  "platform" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "targetedCountry" TEXT,
  "actualCountry" TEXT,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "correctionReason" TEXT,
  "correctedAt" TIMESTAMP(3),
  "correctedByUserId" UUID,
  "createdByUserId" UUID,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Attribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProspectConversationState" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "conversationId" UUID,
  "state" "ProspectConversationStateType" NOT NULL,
  "lastFollowUpAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3),
  "unansweredAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastFollowUpResult" "FollowUpResult",
  "changedByUserId" UUID,
  "changeReason" TEXT,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProspectConversationState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProspectConversationStateHistory" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "conversationId" UUID,
  "state" "ProspectConversationStateType" NOT NULL,
  "previousState" "ProspectConversationStateType",
  "reason" TEXT,
  "source" TEXT NOT NULL,
  "changedByUserId" UUID,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProspectConversationStateHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LossReason" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "type" "ProspectReasonType" NOT NULL,
  "systemKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "LossReason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProspectReason" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "reasonId" UUID NOT NULL,
  "contactId" UUID,
  "conversationId" UUID,
  "opportunityId" UUID,
  "note" TEXT,
  "createdByUserId" UUID,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProspectReason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProspectEngagementConfig" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "slaFirstResponseThresholdMinutes" INTEGER NOT NULL DEFAULT 15,
  "cadenceDays" JSONB NOT NULL,
  "maxUnansweredAttempts" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProspectEngagementConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialImport" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "type" "CommercialImportType" NOT NULL,
  "status" "CommercialImportStatus" NOT NULL DEFAULT 'PREVIEW',
  "idempotencyKey" TEXT NOT NULL,
  "fileName" TEXT,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "succeededCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "report" JSONB,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialImportRow" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "importId" UUID NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "status" "CommercialImportRowStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "entityId" UUID,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialImportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Campaign_organizationId_code_key" ON "Campaign"("organizationId", "code");
CREATE UNIQUE INDEX "Expense_organizationId_idempotencyKey_key" ON "Expense"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "Expense_marketing_identity_active_key" ON "Expense"("organizationId", "expenseDate", COALESCE("campaignId", '00000000-0000-0000-0000-000000000000'::uuid), COALESCE("adSetId", '00000000-0000-0000-0000-000000000000'::uuid), COALESCE("adId", '00000000-0000-0000-0000-000000000000'::uuid), "currency") WHERE "deletedAt" IS NULL AND "campaignId" IS NOT NULL;
CREATE UNIQUE INDEX "Attribution_original_contact_key" ON "Attribution"("organizationId", "contactId") WHERE "kind" = 'ORIGINAL' AND "contactId" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Attribution_conversion_sale_key" ON "Attribution"("organizationId", "saleId") WHERE "kind" = 'CONVERSION' AND "saleId" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Attribution_conversion_opportunity_key" ON "Attribution"("organizationId", "opportunityId") WHERE "kind" = 'CONVERSION' AND "opportunityId" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Attribution_conversion_trial_key" ON "Attribution"("organizationId", "trialId") WHERE "kind" = 'CONVERSION' AND "trialId" IS NOT NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "MarketingAdSet_organizationId_id_key" ON "MarketingAdSet"("organizationId", "id");
CREATE UNIQUE INDEX "MarketingAdSet_organizationId_campaignId_externalId_key" ON "MarketingAdSet"("organizationId", "campaignId", "externalId");
CREATE UNIQUE INDEX "MarketingAd_organizationId_id_key" ON "MarketingAd"("organizationId", "id");
CREATE UNIQUE INDEX "MarketingAd_organizationId_campaignId_externalId_key" ON "MarketingAd"("organizationId", "campaignId", "externalId");
CREATE UNIQUE INDEX "MarketingCreative_organizationId_id_key" ON "MarketingCreative"("organizationId", "id");
CREATE UNIQUE INDEX "Attribution_organizationId_id_key" ON "Attribution"("organizationId", "id");
CREATE UNIQUE INDEX "ProspectConversationState_organizationId_id_key" ON "ProspectConversationState"("organizationId", "id");
CREATE UNIQUE INDEX "ProspectConversationState_organizationId_contactId_key" ON "ProspectConversationState"("organizationId", "contactId");
CREATE UNIQUE INDEX "ProspectConversationState_organizationId_conversationId_key" ON "ProspectConversationState"("organizationId", "conversationId");
CREATE UNIQUE INDEX "ProspectConversationStateHistory_organizationId_id_key" ON "ProspectConversationStateHistory"("organizationId", "id");
CREATE UNIQUE INDEX "LossReason_organizationId_id_key" ON "LossReason"("organizationId", "id");
CREATE UNIQUE INDEX "LossReason_organizationId_type_systemKey_key" ON "LossReason"("organizationId", "type", "systemKey");
CREATE UNIQUE INDEX "ProspectReason_organizationId_id_key" ON "ProspectReason"("organizationId", "id");
CREATE UNIQUE INDEX "ProspectEngagementConfig_organizationId_id_key" ON "ProspectEngagementConfig"("organizationId", "id");
CREATE UNIQUE INDEX "ProspectEngagementConfig_organizationId_key" ON "ProspectEngagementConfig"("organizationId");
CREATE UNIQUE INDEX "CommercialImport_organizationId_id_key" ON "CommercialImport"("organizationId", "id");
CREATE UNIQUE INDEX "CommercialImport_organizationId_idempotencyKey_key" ON "CommercialImport"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "CommercialImportRow_organizationId_id_key" ON "CommercialImportRow"("organizationId", "id");
CREATE UNIQUE INDEX "CommercialImportRow_organizationId_importId_rowNumber_key" ON "CommercialImportRow"("organizationId", "importId", "rowNumber");

CREATE INDEX "Campaign_organizationId_status_active_idx" ON "Campaign"("organizationId", "status", "active");
CREATE INDEX "MarketingAdSet_organizationId_campaignId_status_idx" ON "MarketingAdSet"("organizationId", "campaignId", "status");
CREATE INDEX "MarketingAdSet_organizationId_targetedCountry_idx" ON "MarketingAdSet"("organizationId", "targetedCountry");
CREATE INDEX "MarketingAd_organizationId_campaignId_status_idx" ON "MarketingAd"("organizationId", "campaignId", "status");
CREATE INDEX "MarketingAd_organizationId_adSetId_idx" ON "MarketingAd"("organizationId", "adSetId");
CREATE INDEX "MarketingCreative_organizationId_campaignId_idx" ON "MarketingCreative"("organizationId", "campaignId");
CREATE INDEX "MarketingCreative_organizationId_adId_idx" ON "MarketingCreative"("organizationId", "adId");
CREATE INDEX "Attribution_organizationId_kind_acquiredAt_idx" ON "Attribution"("organizationId", "kind", "acquiredAt");
CREATE INDEX "Attribution_organizationId_contactId_kind_idx" ON "Attribution"("organizationId", "contactId", "kind");
CREATE INDEX "Attribution_organizationId_campaignId_kind_idx" ON "Attribution"("organizationId", "campaignId", "kind");
CREATE INDEX "Attribution_organizationId_conversationId_idx" ON "Attribution"("organizationId", "conversationId");
CREATE INDEX "Attribution_organizationId_opportunityId_idx" ON "Attribution"("organizationId", "opportunityId");
CREATE INDEX "Attribution_organizationId_trialId_idx" ON "Attribution"("organizationId", "trialId");
CREATE INDEX "Attribution_organizationId_saleId_idx" ON "Attribution"("organizationId", "saleId");
CREATE INDEX "Expense_organizationId_campaignId_expenseDate_currency_idx" ON "Expense"("organizationId", "campaignId", "expenseDate", "currency");
CREATE INDEX "Expense_organizationId_adSetId_expenseDate_idx" ON "Expense"("organizationId", "adSetId", "expenseDate");
CREATE INDEX "Expense_organizationId_adId_expenseDate_idx" ON "Expense"("organizationId", "adId", "expenseDate");
CREATE INDEX "Expense_organizationId_creativeId_expenseDate_idx" ON "Expense"("organizationId", "creativeId", "expenseDate");
CREATE INDEX "ProspectConversationState_organizationId_state_idx" ON "ProspectConversationState"("organizationId", "state");
CREATE INDEX "ProspectConversationState_organizationId_nextFollowUpAt_idx" ON "ProspectConversationState"("organizationId", "nextFollowUpAt");
CREATE INDEX "ProspectConversationStateHistory_organizationId_contactId_createdAt_idx" ON "ProspectConversationStateHistory"("organizationId", "contactId", "createdAt");
CREATE INDEX "ProspectConversationStateHistory_organizationId_state_createdAt_idx" ON "ProspectConversationStateHistory"("organizationId", "state", "createdAt");
CREATE INDEX "LossReason_organizationId_type_active_sortOrder_idx" ON "LossReason"("organizationId", "type", "active", "sortOrder");
CREATE INDEX "ProspectReason_organizationId_reasonId_createdAt_idx" ON "ProspectReason"("organizationId", "reasonId", "createdAt");
CREATE INDEX "ProspectReason_organizationId_contactId_createdAt_idx" ON "ProspectReason"("organizationId", "contactId", "createdAt");
CREATE INDEX "ProspectReason_organizationId_opportunityId_createdAt_idx" ON "ProspectReason"("organizationId", "opportunityId", "createdAt");
CREATE INDEX "CommercialImport_organizationId_status_createdAt_idx" ON "CommercialImport"("organizationId", "status", "createdAt");
CREATE INDEX "CommercialImportRow_organizationId_importId_status_idx" ON "CommercialImportRow"("organizationId", "importId", "status");

ALTER TABLE "MarketingAdSet" ADD CONSTRAINT "MarketingAdSet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingAdSet" ADD CONSTRAINT "MarketingAdSet_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingAd" ADD CONSTRAINT "MarketingAd_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingAd" ADD CONSTRAINT "MarketingAd_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingAd" ADD CONSTRAINT "MarketingAd_organizationId_adSetId_fkey" FOREIGN KEY ("organizationId", "adSetId") REFERENCES "MarketingAdSet"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingCreative" ADD CONSTRAINT "MarketingCreative_organizationId_adId_fkey" FOREIGN KEY ("organizationId", "adId") REFERENCES "MarketingAd"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_adSetId_fkey" FOREIGN KEY ("organizationId", "adSetId") REFERENCES "MarketingAdSet"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_adId_fkey" FOREIGN KEY ("organizationId", "adId") REFERENCES "MarketingAd"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_creativeId_fkey" FOREIGN KEY ("organizationId", "creativeId") REFERENCES "MarketingCreative"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_createdByUserId_fkey" FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "WhatsAppConversation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_opportunityId_fkey" FOREIGN KEY ("organizationId", "opportunityId") REFERENCES "Opportunity"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_trialId_fkey" FOREIGN KEY ("organizationId", "trialId") REFERENCES "Trial"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_saleId_fkey" FOREIGN KEY ("organizationId", "saleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_campaignId_fkey" FOREIGN KEY ("organizationId", "campaignId") REFERENCES "Campaign"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_adSetId_fkey" FOREIGN KEY ("organizationId", "adSetId") REFERENCES "MarketingAdSet"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_adId_fkey" FOREIGN KEY ("organizationId", "adId") REFERENCES "MarketingAd"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_creativeId_fkey" FOREIGN KEY ("organizationId", "creativeId") REFERENCES "MarketingCreative"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_createdByUserId_fkey" FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_organizationId_correctedByUserId_fkey" FOREIGN KEY ("organizationId", "correctedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectConversationState" ADD CONSTRAINT "ProspectConversationState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectConversationState" ADD CONSTRAINT "ProspectConversationState_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectConversationState" ADD CONSTRAINT "ProspectConversationState_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "WhatsAppConversation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectConversationState" ADD CONSTRAINT "ProspectConversationState_organizationId_changedByUserId_fkey" FOREIGN KEY ("organizationId", "changedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectConversationStateHistory" ADD CONSTRAINT "ProspectConversationStateHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectConversationStateHistory" ADD CONSTRAINT "ProspectConversationStateHistory_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectConversationStateHistory" ADD CONSTRAINT "ProspectConversationStateHistory_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "WhatsAppConversation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectConversationStateHistory" ADD CONSTRAINT "ProspectConversationStateHistory_organizationId_changedByUserId_fkey" FOREIGN KEY ("organizationId", "changedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LossReason" ADD CONSTRAINT "LossReason_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectReason" ADD CONSTRAINT "ProspectReason_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectReason" ADD CONSTRAINT "ProspectReason_organizationId_reasonId_fkey" FOREIGN KEY ("organizationId", "reasonId") REFERENCES "LossReason"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectReason" ADD CONSTRAINT "ProspectReason_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectReason" ADD CONSTRAINT "ProspectReason_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "WhatsAppConversation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectReason" ADD CONSTRAINT "ProspectReason_organizationId_opportunityId_fkey" FOREIGN KEY ("organizationId", "opportunityId") REFERENCES "Opportunity"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectReason" ADD CONSTRAINT "ProspectReason_organizationId_createdByUserId_fkey" FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProspectEngagementConfig" ADD CONSTRAINT "ProspectEngagementConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialImport" ADD CONSTRAINT "CommercialImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialImport" ADD CONSTRAINT "CommercialImport_organizationId_createdByUserId_fkey" FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialImportRow" ADD CONSTRAINT "CommercialImportRow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialImportRow" ADD CONSTRAINT "CommercialImportRow_organizationId_importId_fkey" FOREIGN KEY ("organizationId", "importId") REFERENCES "CommercialImport"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
