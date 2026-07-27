-- Pipeline archive is a record-level concern; legacy ARCHIVED stages become OPEN.
BEGIN;
UPDATE "PipelineStage" SET "category" = 'OPEN' WHERE "category"::text = 'ARCHIVED';
CREATE TYPE "PipelineStageCategory_new" AS ENUM ('OPEN', 'WON', 'LOST');
ALTER TABLE "PipelineStage" ALTER COLUMN "category" TYPE "PipelineStageCategory_new" USING ("category"::text::"PipelineStageCategory_new");
ALTER TYPE "PipelineStageCategory" RENAME TO "PipelineStageCategory_old";
ALTER TYPE "PipelineStageCategory_new" RENAME TO "PipelineStageCategory";
DROP TYPE "PipelineStageCategory_old";
COMMIT;

ALTER TABLE "Opportunity"
ADD COLUMN "lastStageChangedAt" TIMESTAMP(3),
ADD COLUMN "lostAt" TIMESTAMP(3),
ADD COLUMN "lostReason" TEXT,
ADD COLUMN "notes" TEXT;

CREATE TABLE "OpportunityStageHistory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "opportunityId" UUID NOT NULL,
    "fromStageId" UUID,
    "toStageId" UUID NOT NULL,
    "changedByUserId" UUID,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityStageHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpportunityStageHistory_organizationId_id_key" ON "OpportunityStageHistory"("organizationId", "id");
CREATE INDEX "OpportunityStageHistory_organizationId_idx" ON "OpportunityStageHistory"("organizationId");
CREATE INDEX "OpportunityStageHistory_opportunityId_idx" ON "OpportunityStageHistory"("opportunityId");
CREATE INDEX "OpportunityStageHistory_fromStageId_idx" ON "OpportunityStageHistory"("fromStageId");
CREATE INDEX "OpportunityStageHistory_toStageId_idx" ON "OpportunityStageHistory"("toStageId");
CREATE INDEX "OpportunityStageHistory_changedByUserId_idx" ON "OpportunityStageHistory"("changedByUserId");
CREATE INDEX "OpportunityStageHistory_changedAt_idx" ON "OpportunityStageHistory"("changedAt");

CREATE INDEX "Opportunity_organizationId_pipelineStageId_deletedAt_idx" ON "Opportunity"("organizationId", "pipelineStageId", "deletedAt");
CREATE INDEX "Opportunity_organizationId_archivedAt_idx" ON "Opportunity"("organizationId", "archivedAt");
CREATE INDEX "Opportunity_organizationId_lastStageChangedAt_idx" ON "Opportunity"("organizationId", "lastStageChangedAt");
CREATE INDEX "Opportunity_organizationId_wonAt_idx" ON "Opportunity"("organizationId", "wonAt");
CREATE INDEX "Opportunity_organizationId_lostAt_idx" ON "Opportunity"("organizationId", "lostAt");

-- Backfill the initial event for opportunities created before Sprint 5.
UPDATE "Opportunity"
SET "lastStageChangedAt" = COALESCE("lastStageChangedAt", "createdAt")
WHERE "lastStageChangedAt" IS NULL;

INSERT INTO "OpportunityStageHistory" (
  "id", "organizationId", "opportunityId", "fromStageId", "toStageId",
  "changedByUserId", "reason", "changedAt", "createdAt"
)
SELECT
  gen_random_uuid(),
  o."organizationId",
  o."id",
  NULL,
  o."pipelineStageId",
  o."userId",
  'Oportunidad creada',
  COALESCE(o."lastStageChangedAt", o."createdAt"),
  o."createdAt"
FROM "Opportunity" o
WHERE NOT EXISTS (
  SELECT 1
  FROM "OpportunityStageHistory" h
  WHERE h."organizationId" = o."organizationId"
    AND h."opportunityId" = o."id"
);

ALTER TABLE "OpportunityStageHistory" ADD CONSTRAINT "OpportunityStageHistory_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpportunityStageHistory" ADD CONSTRAINT "OpportunityStageHistory_organizationId_opportunityId_fkey"
  FOREIGN KEY ("organizationId", "opportunityId") REFERENCES "Opportunity"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpportunityStageHistory" ADD CONSTRAINT "OpportunityStageHistory_organizationId_fromStageId_fkey"
  FOREIGN KEY ("organizationId", "fromStageId") REFERENCES "PipelineStage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpportunityStageHistory" ADD CONSTRAINT "OpportunityStageHistory_organizationId_toStageId_fkey"
  FOREIGN KEY ("organizationId", "toStageId") REFERENCES "PipelineStage"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OpportunityStageHistory" ADD CONSTRAINT "OpportunityStageHistory_organizationId_changedByUserId_fkey"
  FOREIGN KEY ("organizationId", "changedByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
