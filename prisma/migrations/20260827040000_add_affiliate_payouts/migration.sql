-- AlterTable
ALTER TABLE "AffiliateCommission" ADD COLUMN     "paidOutAt" TIMESTAMP(3),
ADD COLUMN     "payoutId" TEXT;

-- CreateTable
CREATE TABLE "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "commissionCount" INTEGER NOT NULL,
    "note" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliatePayout_affiliateId_createdAt_idx" ON "AffiliatePayout"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateId_paidOut_idx" ON "AffiliateCommission"("affiliateId", "paidOut");

-- CreateIndex
CREATE INDEX "AffiliateCommission_payoutId_idx" ON "AffiliateCommission"("payoutId");

-- AddForeignKey
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "AffiliatePayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
