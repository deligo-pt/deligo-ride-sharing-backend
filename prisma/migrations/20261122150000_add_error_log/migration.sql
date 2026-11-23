-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "code" TEXT,
    "message" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestBody" JSONB,
    "requestQuery" JSONB,
    "errorSources" JSONB,
    "stack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_logs_statusCode_createdAt_idx" ON "error_logs"("statusCode", "createdAt");

-- CreateIndex
CREATE INDEX "error_logs_createdAt_idx" ON "error_logs"("createdAt");

