-- CreateIndex
CREATE INDEX "rides_status_scheduledAt_idx" ON "rides"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "rides_status_createdAt_idx" ON "rides"("status", "createdAt");
