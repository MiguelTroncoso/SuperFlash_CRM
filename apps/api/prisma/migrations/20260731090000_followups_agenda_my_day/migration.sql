-- Sprint 6: follow-up lifecycle, append-only history and stable pipeline keys.

CREATE TYPE "FollowUpHistoryAction" AS ENUM (
  'CREATED',
  'UPDATED',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULED',
  'ASSIGNEE_CHANGED',
  'ARCHIVED',
  'RESTORED'
);

ALTER TABLE "PipelineStage"
ADD COLUMN "systemKey" TEXT;

UPDATE "PipelineStage"
SET "systemKey" = CASE
  WHEN "name" = 'Nuevo Lead' AND "order" = 1 THEN 'NEW_LEAD'
  WHEN "name" = 'Dejó en visto' AND "order" = 2 THEN 'LEFT_ON_READ'
  WHEN "name" = 'Demo entregada' AND "order" = 3 THEN 'DEMO_DELIVERED'
  WHEN "name" = 'Debe gastar créditos' AND "order" = 4 THEN 'AWAITING_CREDIT_USAGE'
  WHEN "name" = 'Debe juntar dinero' AND "order" = 5 THEN 'AWAITING_MONEY'
  WHEN "name" = 'Posible comprador' AND "order" = 6 THEN 'POTENTIAL_BUYER'
  WHEN "name" = 'Compró' AND "order" = 7 THEN 'WON'
  WHEN "name" = 'No concretado' AND "order" = 8 THEN 'LOST'
  ELSE "systemKey"
END
WHERE "deletedAt" IS NULL AND "systemKey" IS NULL;

CREATE INDEX "PipelineStage_organizationId_systemKey_idx"
ON "PipelineStage"("organizationId", "systemKey");

CREATE UNIQUE INDEX "PipelineStage_active_systemKey_key"
ON "PipelineStage"("organizationId", "systemKey")
WHERE "systemKey" IS NOT NULL AND "deletedAt" IS NULL;

ALTER TABLE "FollowUp"
ADD COLUMN "title" TEXT,
ADD COLUMN "reminderAt" TIMESTAMP(3),
ADD COLUMN "rescheduledFromId" UUID,
ADD COLUMN "rescheduledAt" TIMESTAMP(3),
ADD COLUMN "completionNote" TEXT,
ADD COLUMN "completedByUserId" UUID,
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledByUserId" UUID,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "createdByUserId" UUID;

UPDATE "FollowUp"
SET "title" = 'Seguimiento';

ALTER TABLE "FollowUp"
ALTER COLUMN "title" SET NOT NULL;

ALTER TABLE "Activity"
ADD COLUMN "followUpId" UUID;

CREATE TABLE "FollowUpHistory" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "followUpId" UUID NOT NULL,
  "action" "FollowUpHistoryAction" NOT NULL,
  "changedByUserId" UUID,
  "previousDueAt" TIMESTAMP(3),
  "newDueAt" TIMESTAMP(3),
  "previousStatus" "FollowUpStatus",
  "newStatus" "FollowUpStatus",
  "note" TEXT,
  "metadata" JSONB,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FollowUpHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FollowUpHistory_organizationId_id_key"
ON "FollowUpHistory"("organizationId", "id");
CREATE INDEX "FollowUpHistory_organizationId_idx"
ON "FollowUpHistory"("organizationId");
CREATE INDEX "FollowUpHistory_followUpId_idx"
ON "FollowUpHistory"("followUpId");
CREATE INDEX "FollowUpHistory_changedByUserId_idx"
ON "FollowUpHistory"("changedByUserId");
CREATE INDEX "FollowUpHistory_action_idx"
ON "FollowUpHistory"("action");
CREATE INDEX "FollowUpHistory_changedAt_idx"
ON "FollowUpHistory"("changedAt");

CREATE INDEX "FollowUp_organizationId_userId_status_dueAt_idx"
ON "FollowUp"("organizationId", "userId", "status", "dueAt");
CREATE INDEX "FollowUp_organizationId_opportunityId_status_idx"
ON "FollowUp"("organizationId", "opportunityId", "status");
CREATE INDEX "FollowUp_organizationId_archivedAt_idx"
ON "FollowUp"("organizationId", "archivedAt");
CREATE INDEX "FollowUp_organizationId_priority_status_idx"
ON "FollowUp"("organizationId", "priority", "status");
CREATE INDEX "FollowUp_rescheduledFromId_idx"
ON "FollowUp"("rescheduledFromId");
CREATE INDEX "Activity_followUpId_idx"
ON "Activity"("followUpId");

CREATE UNIQUE INDEX "FollowUp_active_duplicate_key"
ON "FollowUp"("organizationId", "opportunityId", "userId", "dueAt")
WHERE "status" = 'PENDING' AND "archivedAt" IS NULL AND "deletedAt" IS NULL;

ALTER TABLE "Activity"
ADD CONSTRAINT "Activity_organizationId_followUpId_fkey"
FOREIGN KEY ("organizationId", "followUpId")
REFERENCES "FollowUp"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FollowUp"
ADD CONSTRAINT "FollowUp_organizationId_createdByUserId_fkey"
FOREIGN KEY ("organizationId", "createdByUserId")
REFERENCES "User"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "FollowUp_organizationId_completedByUserId_fkey"
FOREIGN KEY ("organizationId", "completedByUserId")
REFERENCES "User"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "FollowUp_organizationId_cancelledByUserId_fkey"
FOREIGN KEY ("organizationId", "cancelledByUserId")
REFERENCES "User"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "FollowUp_organizationId_rescheduledFromId_fkey"
FOREIGN KEY ("organizationId", "rescheduledFromId")
REFERENCES "FollowUp"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FollowUpHistory"
ADD CONSTRAINT "FollowUpHistory_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "FollowUpHistory_organizationId_followUpId_fkey"
FOREIGN KEY ("organizationId", "followUpId") REFERENCES "FollowUp"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "FollowUpHistory_organizationId_changedByUserId_fkey"
FOREIGN KEY ("organizationId", "changedByUserId") REFERENCES "User"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
