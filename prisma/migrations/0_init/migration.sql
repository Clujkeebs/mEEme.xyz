-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tier" TEXT NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubId" TEXT,
    "stripeStatus" TEXT,
    "subscriptionEndsAt" TIMESTAMP(3),
    "referralCode" TEXT NOT NULL,
    "referredByCode" TEXT,
    "telegramChatId" TEXT,
    "telegramUsername" TEXT,
    "telegramLinkCode" TEXT,
    "notifyTelegram" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT false,
    "quietFromHourUtc" INTEGER,
    "quietToHourUtc" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "symbol" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "entryPriceUsd" DOUBLE PRECISION NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "realizedPnlUsd" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "symbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coilThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.68,
    "lastCoilScore" DOUBLE PRECISION,
    "lastSweptAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tokenAddress" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "symbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verdict" TEXT NOT NULL,
    "conviction" DOUBLE PRECISION NOT NULL,
    "coilScore" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "headline" TEXT NOT NULL,
    "coiledSupply" DOUBLE PRECISION NOT NULL,
    "trappedSupply" DOUBLE PRECISION NOT NULL,
    "insiderCoil" DOUBLE PRECISION NOT NULL,
    "insiderRealized" DOUBLE PRECISION NOT NULL,
    "velocityOfRealization" DOUBLE PRECISION NOT NULL,
    "priceAtSignal" DOUBLE PRECISION NOT NULL,
    "trapdoorUsd" DOUBLE PRECISION,
    "ceilingUsd" DOUBLE PRECISION,
    "halfLifeMin" INTEGER NOT NULL DEFAULT 15,
    "reasoningJson" TEXT NOT NULL,
    "ladderJson" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "shareSlug" TEXT NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalOutcome" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "price15m" DOUBLE PRECISION,
    "price1h" DOUBLE PRECISION,
    "price4h" DOUBLE PRECISION,
    "price24h" DOUBLE PRECISION,
    "maxPrice24h" DOUBLE PRECISION,
    "minPrice24h" DOUBLE PRECISION,
    "grade" TEXT NOT NULL DEFAULT 'pending',
    "edgePct" DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT,
    "tokenAddress" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deliveredVia" TEXT,
    "deliveryError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "locks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenCache" (
    "tokenAddress" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "symbol" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ttlSeconds" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "TokenCache_pkey" PRIMARY KEY ("tokenAddress")
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonUsage" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "locks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnonUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "callsToday" INTEGER NOT NULL DEFAULT 0,
    "callsDay" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeSubId_key" ON "User"("stripeSubId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramLinkCode_key" ON "User"("telegramLinkCode");

-- CreateIndex
CREATE INDEX "User_referredByCode_idx" ON "User"("referredByCode");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Position_userId_closedAt_idx" ON "Position"("userId", "closedAt");

-- CreateIndex
CREATE INDEX "Position_tokenAddress_idx" ON "Position"("tokenAddress");

-- CreateIndex
CREATE INDEX "Watch_active_lastSweptAt_idx" ON "Watch"("active", "lastSweptAt");

-- CreateIndex
CREATE UNIQUE INDEX "Watch_userId_tokenAddress_key" ON "Watch"("userId", "tokenAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_shareSlug_key" ON "Signal"("shareSlug");

-- CreateIndex
CREATE INDEX "Signal_tokenAddress_createdAt_idx" ON "Signal"("tokenAddress", "createdAt");

-- CreateIndex
CREATE INDEX "Signal_userId_createdAt_idx" ON "Signal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Signal_synthetic_createdAt_idx" ON "Signal"("synthetic", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SignalOutcome_signalId_key" ON "SignalOutcome"("signalId");

-- CreateIndex
CREATE INDEX "SignalOutcome_grade_resolvedAt_idx" ON "SignalOutcome"("grade", "resolvedAt");

-- CreateIndex
CREATE INDEX "Alert_userId_readAt_createdAt_idx" ON "Alert"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_deliveredAt_attempts_idx" ON "Alert"("deliveredAt", "attempts");

-- CreateIndex
CREATE UNIQUE INDEX "UsageDay_userId_day_key" ON "UsageDay"("userId", "day");

-- CreateIndex
CREATE INDEX "TokenCache_fetchedAt_idx" ON "TokenCache"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnonUsage_ipHash_day_key" ON "AnonUsage"("ipHash", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_userId_revokedAt_idx" ON "ApiKey"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watch" ADD CONSTRAINT "Watch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalOutcome" ADD CONSTRAINT "SignalOutcome_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageDay" ADD CONSTRAINT "UsageDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

