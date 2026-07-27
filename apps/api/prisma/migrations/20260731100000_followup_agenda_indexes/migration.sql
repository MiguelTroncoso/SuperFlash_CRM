-- Sprint 6: tenant-scoped due date index for agenda range scans.

CREATE INDEX "FollowUp_organizationId_dueAt_idx"
ON "FollowUp"("organizationId", "dueAt");
