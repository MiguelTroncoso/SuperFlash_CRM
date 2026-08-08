ALTER TABLE "FollowUp"
ADD COLUMN "autoSuggested" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "FollowUp_organizationId_opportunityId_autoSuggested_idx"
ON "FollowUp"("organizationId", "opportunityId", "autoSuggested");
