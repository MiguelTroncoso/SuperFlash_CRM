ALTER TABLE "OutboxEvent"
  ADD COLUMN "deduplicationKey" TEXT;

CREATE UNIQUE INDEX "OutboxEvent_organizationId_deduplicationKey_key"
  ON "OutboxEvent" ("organizationId", "deduplicationKey");
