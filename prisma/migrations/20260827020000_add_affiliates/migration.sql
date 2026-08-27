-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateReferral" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstPaidAt" TIMESTAMP(3),

    CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "commissionUsd" DOUBLE PRECISION NOT NULL,
    "paidOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_code_key" ON "Affiliate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_email_key" ON "Affiliate"("email");

-- CreateIndex
CREATE INDEX "Affiliate_active_idx" ON "Affiliate"("active");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateReferral_userId_key" ON "AffiliateReferral"("userId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_affiliateId_idx" ON "AffiliateReferral"("affiliateId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCommission_stripeInvoiceId_key" ON "AffiliateCommission"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "AffiliateCommission_affiliateId_createdAt_idx" ON "AffiliateCommission"("affiliateId", "createdAt");

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "AffiliateReferral"("id") ON DELETE CASCADE ON UPDATE CASCADE;
