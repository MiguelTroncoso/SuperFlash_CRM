-- CreateIndex
CREATE INDEX "Activity_organizationId_contactId_createdAt_idx" ON "Activity"("organizationId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_firstName_idx" ON "Contact"("firstName");

-- CreateIndex
CREATE INDEX "Contact_lastName_idx" ON "Contact"("lastName");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_source_idx" ON "Contact"("source");

-- CreateIndex
CREATE INDEX "Contact_archivedAt_idx" ON "Contact"("archivedAt");

-- CreateIndex
CREATE INDEX "Contact_lastActivityAt_idx" ON "Contact"("lastActivityAt");

-- CreateIndex
CREATE INDEX "ContactTag_contactId_deletedAt_idx" ON "ContactTag"("contactId", "deletedAt");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_contactId_deletedAt_idx" ON "Opportunity"("organizationId", "contactId", "deletedAt");

-- CreateIndex
CREATE INDEX "Tag_deletedAt_idx" ON "Tag"("deletedAt");
