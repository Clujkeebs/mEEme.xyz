-- Deduplicated application errors, so a fault survives a restart and can be
-- read as a list rather than scrolled for in an ephemeral log stream.
CREATE TABLE "ErrorEvent" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErrorEvent_fingerprint_key" ON "ErrorEvent"("fingerprint");
CREATE INDEX "ErrorEvent_resolvedAt_lastSeenAt_idx" ON "ErrorEvent"("resolvedAt", "lastSeenAt");
CREATE INDEX "ErrorEvent_lastSeenAt_idx" ON "ErrorEvent"("lastSeenAt");
