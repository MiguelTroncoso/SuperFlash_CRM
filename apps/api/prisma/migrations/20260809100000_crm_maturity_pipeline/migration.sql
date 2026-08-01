CREATE TYPE "OpportunityPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

ALTER TABLE "Opportunity"
  ADD COLUMN "probability" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "priority" "OpportunityPriority" NOT NULL DEFAULT 'NORMAL';

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_probability_check" CHECK ("probability" >= 0 AND "probability" <= 100);

CREATE INDEX "Opportunity_organizationId_priority_deletedAt_idx"
  ON "Opportunity"("organizationId", "priority", "deletedAt");
CREATE INDEX "Opportunity_organizationId_probability_deletedAt_idx"
  ON "Opportunity"("organizationId", "probability", "deletedAt");
