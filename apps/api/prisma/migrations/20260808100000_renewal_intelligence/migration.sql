-- Renewal Intelligence keeps the financial cycle status separate from the operational workflow.
CREATE TYPE "RenewalWorkflowStatus" AS ENUM (
  'PENDING', 'CONTACTED', 'IN_CONVERSATION', 'PAYMENT_PROMISE', 'PAID',
  'RENEWED', 'NOT_RENEWED', 'CANCELLED', 'LOST'
);

CREATE TYPE "RenewalReminderKind" AS ENUM (
  'DAYS_30', 'DAYS_15', 'DAYS_7', 'DAYS_3', 'DAYS_1', 'DUE_TODAY', 'OVERDUE_3', 'OVERDUE_7'
);

CREATE TYPE "RenewalReminderStatus" AS ENUM ('PENDING', 'DELIVERED', 'CANCELLED');

ALTER TABLE "Renewal"
  ADD COLUMN "workflowStatus" "RenewalWorkflowStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "Notification" ADD COLUMN "deduplicationKey" TEXT;

CREATE TABLE "RenewalReminder" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "renewalId" UUID NOT NULL,
  "userId" UUID,
  "notificationId" UUID,
  "kind" "RenewalReminderKind" NOT NULL,
  "status" "RenewalReminderStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RenewalReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RenewalReminder_organizationId_id_key"
  ON "RenewalReminder"("organizationId", "id");
CREATE UNIQUE INDEX "RenewalReminder_organizationId_renewalId_kind_key"
  ON "RenewalReminder"("organizationId", "renewalId", "kind");
CREATE UNIQUE INDEX "RenewalReminder_organizationId_notificationId_key"
  ON "RenewalReminder"("organizationId", "notificationId");
CREATE INDEX "RenewalReminder_organizationId_status_scheduledFor_idx"
  ON "RenewalReminder"("organizationId", "status", "scheduledFor");
CREATE INDEX "RenewalReminder_organizationId_renewalId_idx"
  ON "RenewalReminder"("organizationId", "renewalId");
CREATE INDEX "RenewalReminder_organizationId_userId_idx"
  ON "RenewalReminder"("organizationId", "userId");
CREATE INDEX "RenewalReminder_createdAt_idx" ON "RenewalReminder"("createdAt");

CREATE INDEX "Renewal_organizationId_workflowStatus_idx"
  ON "Renewal"("organizationId", "workflowStatus");
CREATE UNIQUE INDEX "Notification_organizationId_deduplicationKey_key"
  ON "Notification"("organizationId", "deduplicationKey");

ALTER TABLE "RenewalReminder"
  ADD CONSTRAINT "RenewalReminder_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RenewalReminder"
  ADD CONSTRAINT "RenewalReminder_organizationId_renewalId_fkey"
  FOREIGN KEY ("organizationId", "renewalId") REFERENCES "Renewal"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RenewalReminder"
  ADD CONSTRAINT "RenewalReminder_organizationId_userId_fkey"
  FOREIGN KEY ("organizationId", "userId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RenewalReminder"
  ADD CONSTRAINT "RenewalReminder_organizationId_notificationId_fkey"
  FOREIGN KEY ("organizationId", "notificationId") REFERENCES "Notification"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
