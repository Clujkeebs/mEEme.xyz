-- Leader election for scheduled jobs, so more than one replica is safe.
CREATE TABLE "JobLease" (
    "name" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("name")
);

CREATE INDEX "JobLease_expiresAt_idx" ON "JobLease"("expiresAt");
