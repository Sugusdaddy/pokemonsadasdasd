-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "trophies" INTEGER NOT NULL DEFAULT 0,
    "maxTrophies" INTEGER NOT NULL DEFAULT 0,
    "kingLevel" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "address" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "AuthNonce" (
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "blueId" TEXT,
    "redId" TEXT,
    "winner" TEXT,
    "reason" TEXT NOT NULL,
    "players" JSONB NOT NULL,
    "crowns" JSONB NOT NULL,
    "ticks" INTEGER NOT NULL,
    "hash" BIGINT NOT NULL,
    "replay" JSONB NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_trophies_idx" ON "Account"("trophies");

-- CreateIndex
CREATE INDEX "Wallet_accountId_idx" ON "Wallet"("accountId");

-- CreateIndex
CREATE INDEX "Match_endedAt_idx" ON "Match"("endedAt");

-- CreateIndex
CREATE INDEX "Match_blueId_idx" ON "Match"("blueId");

-- CreateIndex
CREATE INDEX "Match_redId_idx" ON "Match"("redId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
