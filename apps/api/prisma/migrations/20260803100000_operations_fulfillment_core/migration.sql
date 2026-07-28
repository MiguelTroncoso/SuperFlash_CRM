-- Architecture v1.1 Operations and Fulfillment. Previous migrations remain immutable.

CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DEGRADED', 'SUSPENDED');
CREATE TYPE "ProviderType" AS ENUM ('MANUAL', 'API', 'PANEL', 'INVENTORY', 'DIGITAL_DELIVERY', 'OTHER');
CREATE TYPE "ProviderFulfillmentMode" AS ENUM ('MANUAL', 'AUTOMATIC', 'HYBRID', 'DIGITAL_DELIVERY');
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'ASSIGNED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "FulfillmentExecutionMode" AS ENUM ('MANUAL', 'AUTOMATIC', 'HYBRID', 'DIGITAL_DELIVERY');
CREATE TYPE "ProvisioningAttemptStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYABLE');
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "TrialStatus" AS ENUM ('REQUESTED', 'APPROVED', 'ACTIVE', 'EXPIRED', 'CONVERTED', 'CANCELLED', 'FAILED');
CREATE TYPE "ActivationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'FAILED');

CREATE TABLE "Provider" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "type" "ProviderType" NOT NULL,
  "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
  "fulfillmentMode" "ProviderFulfillmentMode" NOT NULL DEFAULT 'MANUAL',
  "apiBaseUrl" TEXT,
  "metadata" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Provider_organizationId_id_key" ON "Provider" ("organizationId", "id");
CREATE UNIQUE INDEX "Provider_organizationId_slug_key" ON "Provider" ("organizationId", "slug");
CREATE INDEX "Provider_organizationId_idx" ON "Provider" ("organizationId");
CREATE INDEX "Provider_organizationId_status_idx" ON "Provider" ("organizationId", "status");
CREATE INDEX "Provider_organizationId_type_idx" ON "Provider" ("organizationId", "type");
CREATE INDEX "Provider_createdAt_idx" ON "Provider" ("createdAt");

CREATE TABLE "ProviderProductMapping" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "planId" UUID,
  "variantId" UUID,
  "externalProductId" TEXT,
  "externalPlanId" TEXT,
  "externalVariantId" TEXT,
  "mappingKey" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ProviderProductMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderProductMapping_organizationId_id_key" ON "ProviderProductMapping" ("organizationId", "id");
CREATE UNIQUE INDEX "ProviderProductMapping_organizationId_mappingKey_key" ON "ProviderProductMapping" ("organizationId", "mappingKey");
CREATE INDEX "ProviderProductMapping_provider_active_priority_idx" ON "ProviderProductMapping" ("organizationId", "providerId", "active", "priority");
CREATE INDEX "ProviderProductMapping_product_active_idx" ON "ProviderProductMapping" ("organizationId", "productId", "active");
CREATE INDEX "ProviderProductMapping_plan_idx" ON "ProviderProductMapping" ("organizationId", "planId");
CREATE INDEX "ProviderProductMapping_variant_idx" ON "ProviderProductMapping" ("organizationId", "variantId");
CREATE INDEX "ProviderProductMapping_createdAt_idx" ON "ProviderProductMapping" ("createdAt");

CREATE TABLE "Fulfillment" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "saleId" UUID NOT NULL,
  "saleItemId" UUID NOT NULL,
  "subscriptionId" UUID,
  "providerId" UUID,
  "assignedUserId" UUID,
  "status" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
  "mode" "FulfillmentExecutionMode" NOT NULL DEFAULT 'MANUAL',
  "quantity" DECIMAL(18,3) NOT NULL,
  "identityKey" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "requestSnapshot" JSONB NOT NULL,
  "resultSnapshot" JSONB,
  "failureReason" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "assignedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Fulfillment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Fulfillment_quantity_positive_chk" CHECK ("quantity" > 0),
  CONSTRAINT "Fulfillment_attempt_count_non_negative_chk" CHECK ("attemptCount" >= 0)
);

CREATE UNIQUE INDEX "Fulfillment_organizationId_id_key" ON "Fulfillment" ("organizationId", "id");
CREATE UNIQUE INDEX "Fulfillment_organizationId_identityKey_key" ON "Fulfillment" ("organizationId", "identityKey");
CREATE UNIQUE INDEX "Fulfillment_organizationId_idempotencyKey_key" ON "Fulfillment" ("organizationId", "idempotencyKey");
CREATE INDEX "Fulfillment_status_createdAt_idx" ON "Fulfillment" ("organizationId", "status", "createdAt");
CREATE INDEX "Fulfillment_saleItem_idx" ON "Fulfillment" ("organizationId", "saleItemId");
CREATE INDEX "Fulfillment_provider_status_idx" ON "Fulfillment" ("organizationId", "providerId", "status");
CREATE INDEX "Fulfillment_assignee_status_idx" ON "Fulfillment" ("organizationId", "assignedUserId", "status");
CREATE INDEX "Fulfillment_requestId_idx" ON "Fulfillment" ("organizationId", "requestId");
CREATE INDEX "Fulfillment_createdAt_idx" ON "Fulfillment" ("createdAt");

CREATE TABLE "ProvisioningAttempt" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "fulfillmentId" UUID NOT NULL,
  "providerId" UUID,
  "attemptNumber" INTEGER NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestPayload" JSONB NOT NULL,
  "responsePayload" JSONB,
  "status" "ProvisioningAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProvisioningAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProvisioningAttempt_number_positive_chk" CHECK ("attemptNumber" > 0),
  CONSTRAINT "ProvisioningAttempt_dates_order_chk" CHECK ("finishedAt" IS NULL OR "startedAt" IS NULL OR "finishedAt" >= "startedAt")
);

CREATE UNIQUE INDEX "ProvisioningAttempt_organizationId_id_key" ON "ProvisioningAttempt" ("organizationId", "id");
CREATE UNIQUE INDEX "ProvisioningAttempt_fulfillment_attempt_key" ON "ProvisioningAttempt" ("organizationId", "fulfillmentId", "attemptNumber");
CREATE INDEX "ProvisioningAttempt_fulfillment_createdAt_idx" ON "ProvisioningAttempt" ("organizationId", "fulfillmentId", "createdAt");
CREATE INDEX "ProvisioningAttempt_status_createdAt_idx" ON "ProvisioningAttempt" ("organizationId", "status", "createdAt");
CREATE INDEX "ProvisioningAttempt_provider_idx" ON "ProvisioningAttempt" ("organizationId", "providerId");

CREATE TABLE "CredentialRecord" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "fulfillmentId" UUID,
  "activationId" UUID,
  "subscriptionId" UUID,
  "credentialKey" TEXT NOT NULL,
  "encryptedUsername" TEXT,
  "encryptedPassword" TEXT,
  "encryptedUrl" TEXT,
  "encryptedToken" TEXT,
  "expiration" TIMESTAMP(3),
  "instructions" TEXT,
  "metadata" JSONB,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastRevealedAt" TIMESTAMP(3),
  "revealCount" INTEGER NOT NULL DEFAULT 0,
  "revokedAt" TIMESTAMP(3),
  "revealedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CredentialRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CredentialRecord_reveal_count_non_negative_chk" CHECK ("revealCount" >= 0)
);

CREATE UNIQUE INDEX "CredentialRecord_organizationId_id_key" ON "CredentialRecord" ("organizationId", "id");
CREATE UNIQUE INDEX "CredentialRecord_organizationId_credentialKey_key" ON "CredentialRecord" ("organizationId", "credentialKey");
CREATE INDEX "CredentialRecord_status_idx" ON "CredentialRecord" ("organizationId", "status");
CREATE INDEX "CredentialRecord_fulfillment_idx" ON "CredentialRecord" ("organizationId", "fulfillmentId");
CREATE INDEX "CredentialRecord_activation_idx" ON "CredentialRecord" ("organizationId", "activationId");
CREATE INDEX "CredentialRecord_subscription_idx" ON "CredentialRecord" ("organizationId", "subscriptionId");
CREATE INDEX "CredentialRecord_expiration_idx" ON "CredentialRecord" ("expiration");
CREATE INDEX "CredentialRecord_createdAt_idx" ON "CredentialRecord" ("createdAt");

CREATE TABLE "Trial" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "opportunityId" UUID,
  "productId" UUID NOT NULL,
  "planId" UUID,
  "variantId" UUID,
  "providerId" UUID,
  "fulfillmentId" UUID,
  "ownerId" UUID,
  "status" "TrialStatus" NOT NULL DEFAULT 'REQUESTED',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "identityKey" TEXT NOT NULL,
  "snapshotVersion" INTEGER NOT NULL DEFAULT 2,
  "commercialSnapshot" JSONB NOT NULL,
  "conversionSaleId" UUID,
  "notes" TEXT,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Trial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Trial_duration_positive_chk" CHECK ("durationMinutes" > 0),
  CONSTRAINT "Trial_dates_order_chk" CHECK ("endsAt" > "startsAt")
);

CREATE UNIQUE INDEX "Trial_organizationId_id_key" ON "Trial" ("organizationId", "id");
CREATE UNIQUE INDEX "Trial_organizationId_identityKey_key" ON "Trial" ("organizationId", "identityKey");
CREATE UNIQUE INDEX "Trial_organizationId_conversionSaleId_key" ON "Trial" ("organizationId", "conversionSaleId");
CREATE UNIQUE INDEX "Trial_organizationId_fulfillmentId_key" ON "Trial" ("organizationId", "fulfillmentId");
CREATE INDEX "Trial_status_endsAt_idx" ON "Trial" ("organizationId", "status", "endsAt");
CREATE INDEX "Trial_contact_product_status_idx" ON "Trial" ("organizationId", "contactId", "productId", "status");
CREATE INDEX "Trial_opportunity_idx" ON "Trial" ("organizationId", "opportunityId");
CREATE INDEX "Trial_provider_idx" ON "Trial" ("organizationId", "providerId");
CREATE INDEX "Trial_owner_idx" ON "Trial" ("organizationId", "ownerId");
CREATE INDEX "Trial_endsAt_idx" ON "Trial" ("endsAt");

CREATE TABLE "Activation" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "fulfillmentId" UUID NOT NULL,
  "subscriptionId" UUID,
  "providerId" UUID NOT NULL,
  "status" "ActivationStatus" NOT NULL DEFAULT 'PENDING',
  "activatedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "externalReference" TEXT,
  "metadata" JSONB,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Activation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Activation_dates_order_chk" CHECK ("expiresAt" IS NULL OR "activatedAt" IS NULL OR "expiresAt" > "activatedAt")
);

CREATE UNIQUE INDEX "Activation_organizationId_id_key" ON "Activation" ("organizationId", "id");
CREATE INDEX "Activation_status_expiresAt_idx" ON "Activation" ("organizationId", "status", "expiresAt");
CREATE INDEX "Activation_provider_idx" ON "Activation" ("organizationId", "providerId");
CREATE INDEX "Activation_subscription_idx" ON "Activation" ("organizationId", "subscriptionId");
CREATE INDEX "Activation_externalReference_idx" ON "Activation" ("externalReference");
CREATE INDEX "Activation_createdAt_idx" ON "Activation" ("createdAt");
CREATE UNIQUE INDEX "Activation_active_fulfillment_key"
  ON "Activation" ("organizationId", "fulfillmentId")
  WHERE "deletedAt" IS NULL AND "status" IN ('PENDING', 'ACTIVE', 'SUSPENDED');

ALTER TABLE "Provider"
  ADD CONSTRAINT "Provider_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderProductMapping"
  ADD CONSTRAINT "ProviderProductMapping_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProviderProductMapping_organizationId_providerId_fkey"
    FOREIGN KEY ("organizationId", "providerId") REFERENCES "Provider"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProviderProductMapping_organizationId_productId_fkey"
    FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProviderProductMapping_organizationId_productId_planId_fkey"
    FOREIGN KEY ("organizationId", "productId", "planId") REFERENCES "ProductPlan"("organizationId", "productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProviderProductMapping_organizationId_productId_variantId_fkey"
    FOREIGN KEY ("organizationId", "productId", "variantId") REFERENCES "ProductVariant"("organizationId", "productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Fulfillment"
  ADD CONSTRAINT "Fulfillment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Fulfillment_organizationId_saleId_fkey"
    FOREIGN KEY ("organizationId", "saleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Fulfillment_organizationId_saleItemId_fkey"
    FOREIGN KEY ("organizationId", "saleItemId") REFERENCES "SaleItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Fulfillment_organizationId_subscriptionId_fkey"
    FOREIGN KEY ("organizationId", "subscriptionId") REFERENCES "Subscription"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Fulfillment_organizationId_providerId_fkey"
    FOREIGN KEY ("organizationId", "providerId") REFERENCES "Provider"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Fulfillment_organizationId_assignedUserId_fkey"
    FOREIGN KEY ("organizationId", "assignedUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProvisioningAttempt"
  ADD CONSTRAINT "ProvisioningAttempt_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProvisioningAttempt_organizationId_fulfillmentId_fkey"
    FOREIGN KEY ("organizationId", "fulfillmentId") REFERENCES "Fulfillment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProvisioningAttempt_organizationId_providerId_fkey"
    FOREIGN KEY ("organizationId", "providerId") REFERENCES "Provider"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CredentialRecord"
  ADD CONSTRAINT "CredentialRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CredentialRecord_organizationId_fulfillmentId_fkey"
    FOREIGN KEY ("organizationId", "fulfillmentId") REFERENCES "Fulfillment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CredentialRecord_organizationId_activationId_fkey"
    FOREIGN KEY ("organizationId", "activationId") REFERENCES "Activation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CredentialRecord_organizationId_subscriptionId_fkey"
    FOREIGN KEY ("organizationId", "subscriptionId") REFERENCES "Subscription"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CredentialRecord_organizationId_revealedByUserId_fkey"
    FOREIGN KEY ("organizationId", "revealedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Trial"
  ADD CONSTRAINT "Trial_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trial_organizationId_contactId_fkey"
    FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trial_organizationId_opportunityId_fkey"
    FOREIGN KEY ("organizationId", "opportunityId") REFERENCES "Opportunity"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trial_organizationId_productId_fkey"
    FOREIGN KEY ("organizationId", "productId") REFERENCES "Product"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trial_organizationId_productId_planId_fkey"
    FOREIGN KEY ("organizationId", "productId", "planId") REFERENCES "ProductPlan"("organizationId", "productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trial_organizationId_productId_variantId_fkey"
    FOREIGN KEY ("organizationId", "productId", "variantId") REFERENCES "ProductVariant"("organizationId", "productId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trial_organizationId_providerId_fkey"
    FOREIGN KEY ("organizationId", "providerId") REFERENCES "Provider"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trial_organizationId_fulfillmentId_fkey"
    FOREIGN KEY ("organizationId", "fulfillmentId") REFERENCES "Fulfillment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trial_organizationId_ownerId_fkey"
    FOREIGN KEY ("organizationId", "ownerId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trial_organizationId_conversionSaleId_fkey"
    FOREIGN KEY ("organizationId", "conversionSaleId") REFERENCES "Sale"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Activation"
  ADD CONSTRAINT "Activation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Activation_organizationId_fulfillmentId_fkey"
    FOREIGN KEY ("organizationId", "fulfillmentId") REFERENCES "Fulfillment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Activation_organizationId_subscriptionId_fkey"
    FOREIGN KEY ("organizationId", "subscriptionId") REFERENCES "Subscription"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Activation_organizationId_providerId_fkey"
    FOREIGN KEY ("organizationId", "providerId") REFERENCES "Provider"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "ProvisioningAttempt_append_only_guard"
  BEFORE UPDATE OR DELETE ON "ProvisioningAttempt"
  FOR EACH ROW EXECUTE FUNCTION superflash_append_only_guard();
