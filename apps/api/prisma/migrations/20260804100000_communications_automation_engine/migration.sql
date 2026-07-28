-- Communications and automation engine: durable rules, execution queue and internal notifications.
CREATE TYPE "MessageTemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "MessageTemplateChannel" AS ENUM ('INTERNAL', 'EMAIL', 'WHATSAPP', 'SMS', 'PUSH', 'WEBHOOK');
CREATE TYPE "AutomationTrigger" AS ENUM (
  'CONTACT_CREATED',
  'OPPORTUNITY_STAGE_CHANGED',
  'SALE_CONFIRMED',
  'PAYMENT_CONFIRMED',
  'TRIAL_EXPIRING',
  'TRIAL_EXPIRED',
  'SUBSCRIPTION_RENEWAL_DUE',
  'FULFILLMENT_COMPLETED',
  'ACTIVATION_CREATED'
);
CREATE TYPE "AutomationActionType" AS ENUM (
  'CREATE_TASK',
  'CREATE_NOTIFICATION',
  'ADD_ACTIVITY',
  'CREATE_FOLLOW_UP',
  'ENQUEUE_OUTBOX',
  'INTERNAL_WEBHOOK'
);
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "AutomationActionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

CREATE TABLE "MessageTemplate" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "createdByUserId" UUID,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "channel" "MessageTemplateChannel" NOT NULL DEFAULT 'INTERNAL',
  "status" "MessageTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "variables" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationRule" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "templateId" UUID,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "trigger" "AutomationTrigger" NOT NULL,
  "conditions" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationAction" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "automationRuleId" UUID NOT NULL,
  "actionOrder" INTEGER NOT NULL,
  "type" "AutomationActionType" NOT NULL,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationExecution" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "automationRuleId" UUID NOT NULL,
  "actorId" UUID,
  "trigger" "AutomationTrigger" NOT NULL,
  "sourceEventId" UUID NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" UUID NOT NULL,
  "requestId" TEXT NOT NULL,
  "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "inputPayload" JSONB NOT NULL,
  "resultPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationExecutionAction" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "automationExecutionId" UUID NOT NULL,
  "automationActionId" UUID NOT NULL,
  "actionOrder" INTEGER NOT NULL,
  "type" "AutomationActionType" NOT NULL,
  "config" JSONB NOT NULL,
  "status" "AutomationActionStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "resultPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationExecutionAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
  "actionUrl" TEXT,
  "metadata" JSONB,
  "requestId" TEXT,
  "readAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageTemplate_organizationId_id_key" ON "MessageTemplate"("organizationId", "id");
CREATE UNIQUE INDEX "MessageTemplate_organizationId_slug_key" ON "MessageTemplate"("organizationId", "slug");
CREATE INDEX "MessageTemplate_organizationId_status_channel_idx" ON "MessageTemplate"("organizationId", "status", "channel");
CREATE INDEX "MessageTemplate_organizationId_createdAt_idx" ON "MessageTemplate"("organizationId", "createdAt");

CREATE UNIQUE INDEX "AutomationRule_organizationId_id_key" ON "AutomationRule"("organizationId", "id");
CREATE UNIQUE INDEX "AutomationRule_organizationId_name_key" ON "AutomationRule"("organizationId", "name");
CREATE INDEX "AutomationRule_organizationId_trigger_active_idx" ON "AutomationRule"("organizationId", "trigger", "active");
CREATE INDEX "AutomationRule_organizationId_createdAt_idx" ON "AutomationRule"("organizationId", "createdAt");

CREATE UNIQUE INDEX "AutomationAction_organizationId_id_key" ON "AutomationAction"("organizationId", "id");
CREATE UNIQUE INDEX "AutomationAction_org_rule_order_key" ON "AutomationAction"("organizationId", "automationRuleId", "actionOrder");
CREATE INDEX "AutomationAction_organizationId_automationRuleId_idx" ON "AutomationAction"("organizationId", "automationRuleId");

CREATE UNIQUE INDEX "AutomationExecution_organizationId_id_key" ON "AutomationExecution"("organizationId", "id");
CREATE UNIQUE INDEX "AutomationExecution_org_rule_event_key" ON "AutomationExecution"("organizationId", "automationRuleId", "sourceEventId");
CREATE INDEX "AutomationExecution_status_availableAt_idx" ON "AutomationExecution"("status", "availableAt");
CREATE INDEX "AutomationExecution_organizationId_status_availableAt_idx" ON "AutomationExecution"("organizationId", "status", "availableAt");
CREATE INDEX "AutomationExecution_organizationId_trigger_createdAt_idx" ON "AutomationExecution"("organizationId", "trigger", "createdAt");
CREATE INDEX "AutomationExecution_requestId_idx" ON "AutomationExecution"("requestId");

CREATE UNIQUE INDEX "AutomationExecutionAction_organizationId_id_key" ON "AutomationExecutionAction"("organizationId", "id");
CREATE UNIQUE INDEX "AutomationExecutionAction_org_exec_order_key" ON "AutomationExecutionAction"("organizationId", "automationExecutionId", "actionOrder");
CREATE INDEX "AutomationExecutionAction_org_exec_idx" ON "AutomationExecutionAction"("organizationId", "automationExecutionId");
CREATE INDEX "AutomationExecutionAction_status_createdAt_idx" ON "AutomationExecutionAction"("status", "createdAt");

CREATE UNIQUE INDEX "Notification_organizationId_id_key" ON "Notification"("organizationId", "id");
CREATE INDEX "Notification_organizationId_userId_status_createdAt_idx" ON "Notification"("organizationId", "userId", "status", "createdAt");
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");
CREATE INDEX "Notification_requestId_idx" ON "Notification"("requestId");

ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_organizationId_createdByUserId_fkey" FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_createdByUserId_fkey" FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "MessageTemplate"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationAction" ADD CONSTRAINT "AutomationAction_organizationId_automationRuleId_fkey" FOREIGN KEY ("organizationId", "automationRuleId") REFERENCES "AutomationRule"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_organizationId_automationRuleId_fkey" FOREIGN KEY ("organizationId", "automationRuleId") REFERENCES "AutomationRule"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_organizationId_actorId_fkey" FOREIGN KEY ("organizationId", "actorId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationExecutionAction" ADD CONSTRAINT "AutomationExecutionAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationExecutionAction" ADD CONSTRAINT "AutomationExecutionAction_organizationId_automationExecutionId_fkey" FOREIGN KEY ("organizationId", "automationExecutionId") REFERENCES "AutomationExecution"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomationExecutionAction" ADD CONSTRAINT "AutomationExecutionAction_organizationId_automationActionId_fkey" FOREIGN KEY ("organizationId", "automationActionId") REFERENCES "AutomationAction"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
