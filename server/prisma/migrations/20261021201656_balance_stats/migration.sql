-- CreateTable
CREATE TABLE "BalanceVersion" (
    "version" SERIAL NOT NULL,
    "overrides" JSONB NOT NULL,
    "note" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceVersion_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "CardStat" (
    "version" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "games" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "plays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CardStat_pkey" PRIMARY KEY ("version","key")
);
