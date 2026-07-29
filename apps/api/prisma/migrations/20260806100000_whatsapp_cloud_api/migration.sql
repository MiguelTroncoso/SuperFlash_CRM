-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageType" AS ENUM ('TEXT', 'TEMPLATE', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'LOCATION', 'CONTACTS', 'BUTTON', 'INTERACTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppWebhookEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "whatsappCategory" TEXT,
ADD COLUMN     "whatsappComponents" JSONB,
ADD COLUMN     "whatsappExternalId" TEXT,
ADD COLUMN     "whatsappLanguage" TEXT,
ADD COLUMN     "whatsappName" TEXT,
ADD COLUMN     "whatsappStatus" TEXT;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "method" DROP DEFAULT;

-- CreateTable
CREATE TABLE "WhatsAppConnection" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessPhoneNumber" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "appSecretEncrypted" TEXT NOT NULL,
    "webhookVerifyTokenEncrypted" TEXT NOT NULL,
    "graphApiVersion" TEXT NOT NULL DEFAULT 'v23.0',
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastHealthcheckAt" TIMESTAMP(3),
    "lastHealthcheckError" TEXT,
    "lastWebhookReceivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppPhoneNumber" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT NOT NULL,
    "verifiedName" TEXT,
    "qualityRating" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppPhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "phoneNumberId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "assignedUserId" UUID,
    "externalContactPhone" TEXT NOT NULL,
    "externalContactPhoneNormalized" TEXT NOT NULL,
    "externalContactName" TEXT,
    "status" "WhatsAppConversationStatus" NOT NULL DEFAULT 'OPEN',
    "windowStartedAt" TIMESTAMP(3),
    "windowExpiresAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "phoneNumberId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "externalMessageId" TEXT,
    "idempotencyKey" TEXT,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "type" "WhatsAppMessageType" NOT NULL,
    "status" "WhatsAppMessageDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "text" TEXT,
    "templateName" TEXT,
    "templateLanguage" TEXT,
    "templateComponents" JSONB,
    "mediaId" TEXT,
    "mediaMimeType" TEXT,
    "mediaFilename" TEXT,
    "caption" TEXT,
    "location" JSONB,
    "contactsPayload" JSONB,
    "sanitizedPayload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "processingAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppWebhookEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "status" "WhatsAppWebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "requestId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessageStatus" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "messageId" UUID,
    "externalMessageId" TEXT NOT NULL,
    "status" "WhatsAppMessageDeliveryStatus" NOT NULL,
    "recipientPhone" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sanitizedPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessageStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppConnection_organizationId_status_idx" ON "WhatsAppConnection"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_organizationId_wabaId_idx" ON "WhatsAppConnection"("organizationId", "wabaId");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_lastHealthcheckAt_idx" ON "WhatsAppConnection"("lastHealthcheckAt");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_lastWebhookReceivedAt_idx" ON "WhatsAppConnection"("lastWebhookReceivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_organizationId_id_key" ON "WhatsAppConnection"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_organizationId_phoneNumberId_key" ON "WhatsAppConnection"("organizationId", "phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppPhoneNumber_organizationId_connectionId_idx" ON "WhatsAppPhoneNumber"("organizationId", "connectionId");

-- CreateIndex
CREATE INDEX "WhatsAppPhoneNumber_organizationId_active_idx" ON "WhatsAppPhoneNumber"("organizationId", "active");

-- CreateIndex
CREATE INDEX "WhatsAppPhoneNumber_createdAt_idx" ON "WhatsAppPhoneNumber"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppPhoneNumber_organizationId_id_key" ON "WhatsAppPhoneNumber"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppPhoneNumber_organizationId_phoneNumberId_key" ON "WhatsAppPhoneNumber"("organizationId", "phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_organizationId_status_lastMessageAt_idx" ON "WhatsAppConversation"("organizationId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_organizationId_contactId_idx" ON "WhatsAppConversation"("organizationId", "contactId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_organizationId_assignedUserId_idx" ON "WhatsAppConversation"("organizationId", "assignedUserId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_organizationId_externalContactPhoneNor_idx" ON "WhatsAppConversation"("organizationId", "externalContactPhoneNormalized");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_windowExpiresAt_idx" ON "WhatsAppConversation"("windowExpiresAt");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_createdAt_idx" ON "WhatsAppConversation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_organizationId_id_key" ON "WhatsAppConversation"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_organizationId_phoneNumberId_externalC_key" ON "WhatsAppConversation"("organizationId", "phoneNumberId", "externalContactPhoneNormalized");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_organizationId_conversationId_createdAt_idx" ON "WhatsAppMessage"("organizationId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_organizationId_status_nextAttemptAt_idx" ON "WhatsAppMessage"("organizationId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_organizationId_contactId_createdAt_idx" ON "WhatsAppMessage"("organizationId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_externalMessageId_idx" ON "WhatsAppMessage"("externalMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_requestId_idx" ON "WhatsAppMessage"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_organizationId_id_key" ON "WhatsAppMessage"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_organizationId_externalMessageId_key" ON "WhatsAppMessage"("organizationId", "externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_organizationId_idempotencyKey_key" ON "WhatsAppMessage"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_organizationId_status_availableAt_idx" ON "WhatsAppWebhookEvent"("organizationId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_organizationId_connectionId_receivedAt_idx" ON "WhatsAppWebhookEvent"("organizationId", "connectionId", "receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_requestId_idx" ON "WhatsAppWebhookEvent"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookEvent_organizationId_id_key" ON "WhatsAppWebhookEvent"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookEvent_organizationId_eventKey_key" ON "WhatsAppWebhookEvent"("organizationId", "eventKey");

-- CreateIndex
CREATE INDEX "WhatsAppMessageStatus_organizationId_messageId_createdAt_idx" ON "WhatsAppMessageStatus"("organizationId", "messageId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageStatus_organizationId_externalMessageId_idx" ON "WhatsAppMessageStatus"("organizationId", "externalMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessageStatus_createdAt_idx" ON "WhatsAppMessageStatus"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessageStatus_organizationId_id_key" ON "WhatsAppMessageStatus"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessageStatus_organizationId_externalMessageId_stat_key" ON "WhatsAppMessageStatus"("organizationId", "externalMessageId", "status");

-- CreateIndex
CREATE INDEX "Activation_organizationId_fulfillmentId_idx" ON "Activation"("organizationId", "fulfillmentId");

-- CreateIndex
CREATE INDEX "MessageTemplate_organizationId_whatsappName_whatsappLanguag_idx" ON "MessageTemplate"("organizationId", "whatsappName", "whatsappLanguage");

-- RenameForeignKey
ALTER TABLE "AutomationExecutionAction" RENAME CONSTRAINT "AutomationExecutionAction_organizationId_automationActionId_fke" TO "AutomationExecutionAction_organizationId_automationActionI_fkey";

-- RenameForeignKey
ALTER TABLE "AutomationExecutionAction" RENAME CONSTRAINT "AutomationExecutionAction_organizationId_automationExecutionId_" TO "AutomationExecutionAction_organizationId_automationExecuti_fkey";

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppPhoneNumber" ADD CONSTRAINT "WhatsAppPhoneNumber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppPhoneNumber" ADD CONSTRAINT "WhatsAppPhoneNumber_organizationId_connectionId_fkey" FOREIGN KEY ("organizationId", "connectionId") REFERENCES "WhatsAppConnection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_organizationId_connectionId_fkey" FOREIGN KEY ("organizationId", "connectionId") REFERENCES "WhatsAppConnection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_organizationId_phoneNumberId_fkey" FOREIGN KEY ("organizationId", "phoneNumberId") REFERENCES "WhatsAppPhoneNumber"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_organizationId_assignedUserId_fkey" FOREIGN KEY ("organizationId", "assignedUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "WhatsAppConversation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_connectionId_fkey" FOREIGN KEY ("organizationId", "connectionId") REFERENCES "WhatsAppConnection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_phoneNumberId_fkey" FOREIGN KEY ("organizationId", "phoneNumberId") REFERENCES "WhatsAppPhoneNumber"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_organizationId_contactId_fkey" FOREIGN KEY ("organizationId", "contactId") REFERENCES "Contact"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_organizationId_connectionId_fkey" FOREIGN KEY ("organizationId", "connectionId") REFERENCES "WhatsAppConnection"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageStatus" ADD CONSTRAINT "WhatsAppMessageStatus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageStatus" ADD CONSTRAINT "WhatsAppMessageStatus_organizationId_messageId_fkey" FOREIGN KEY ("organizationId", "messageId") REFERENCES "WhatsAppMessage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Activation_provider_idx" RENAME TO "Activation_organizationId_providerId_idx";

-- RenameIndex
ALTER INDEX "Activation_status_expiresAt_idx" RENAME TO "Activation_organizationId_status_expiresAt_idx";

-- RenameIndex
ALTER INDEX "Activation_subscription_idx" RENAME TO "Activation_organizationId_subscriptionId_idx";

-- RenameIndex
ALTER INDEX "AutomationAction_org_rule_order_key" RENAME TO "AutomationAction_organizationId_automationRuleId_actionOrde_key";

-- RenameIndex
ALTER INDEX "AutomationExecution_org_rule_event_key" RENAME TO "AutomationExecution_organizationId_automationRuleId_sourceE_key";

-- RenameIndex
ALTER INDEX "AutomationExecutionAction_org_exec_idx" RENAME TO "AutomationExecutionAction_organizationId_automationExecutio_idx";

-- RenameIndex
ALTER INDEX "AutomationExecutionAction_org_exec_order_key" RENAME TO "AutomationExecutionAction_organizationId_automationExecutio_key";

-- RenameIndex
ALTER INDEX "CredentialRecord_activation_idx" RENAME TO "CredentialRecord_organizationId_activationId_idx";

-- RenameIndex
ALTER INDEX "CredentialRecord_fulfillment_idx" RENAME TO "CredentialRecord_organizationId_fulfillmentId_idx";

-- RenameIndex
ALTER INDEX "CredentialRecord_status_idx" RENAME TO "CredentialRecord_organizationId_status_idx";

-- RenameIndex
ALTER INDEX "CredentialRecord_subscription_idx" RENAME TO "CredentialRecord_organizationId_subscriptionId_idx";

-- RenameIndex
ALTER INDEX "Fulfillment_assignee_status_idx" RENAME TO "Fulfillment_organizationId_assignedUserId_status_idx";

-- RenameIndex
ALTER INDEX "Fulfillment_provider_status_idx" RENAME TO "Fulfillment_organizationId_providerId_status_idx";

-- RenameIndex
ALTER INDEX "Fulfillment_requestId_idx" RENAME TO "Fulfillment_organizationId_requestId_idx";

-- RenameIndex
ALTER INDEX "Fulfillment_saleItem_idx" RENAME TO "Fulfillment_organizationId_saleItemId_idx";

-- RenameIndex
ALTER INDEX "Fulfillment_status_createdAt_idx" RENAME TO "Fulfillment_organizationId_status_createdAt_idx";

-- RenameIndex
ALTER INDEX "ProviderProductMapping_plan_idx" RENAME TO "ProviderProductMapping_organizationId_planId_idx";

-- RenameIndex
ALTER INDEX "ProviderProductMapping_product_active_idx" RENAME TO "ProviderProductMapping_organizationId_productId_active_idx";

-- RenameIndex
ALTER INDEX "ProviderProductMapping_provider_active_priority_idx" RENAME TO "ProviderProductMapping_organizationId_providerId_active_pri_idx";

-- RenameIndex
ALTER INDEX "ProviderProductMapping_variant_idx" RENAME TO "ProviderProductMapping_organizationId_variantId_idx";

-- RenameIndex
ALTER INDEX "ProvisioningAttempt_fulfillment_attempt_key" RENAME TO "ProvisioningAttempt_organizationId_fulfillmentId_attemptNum_key";

-- RenameIndex
ALTER INDEX "ProvisioningAttempt_fulfillment_createdAt_idx" RENAME TO "ProvisioningAttempt_organizationId_fulfillmentId_createdAt_idx";

-- RenameIndex
ALTER INDEX "ProvisioningAttempt_provider_idx" RENAME TO "ProvisioningAttempt_organizationId_providerId_idx";

-- RenameIndex
ALTER INDEX "ProvisioningAttempt_status_createdAt_idx" RENAME TO "ProvisioningAttempt_organizationId_status_createdAt_idx";

-- RenameIndex
ALTER INDEX "Trial_contact_product_status_idx" RENAME TO "Trial_organizationId_contactId_productId_status_idx";

-- RenameIndex
ALTER INDEX "Trial_opportunity_idx" RENAME TO "Trial_organizationId_opportunityId_idx";

-- RenameIndex
ALTER INDEX "Trial_owner_idx" RENAME TO "Trial_organizationId_ownerId_idx";

-- RenameIndex
ALTER INDEX "Trial_provider_idx" RENAME TO "Trial_organizationId_providerId_idx";

-- RenameIndex
ALTER INDEX "Trial_status_endsAt_idx" RENAME TO "Trial_organizationId_status_endsAt_idx";
