-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "closingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonResult" (
    "seasonId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "trophies" INTEGER NOT NULL,
    "best" INTEGER NOT NULL,

    CONSTRAINT "SeasonResult_pkey" PRIMARY KEY ("seasonId","accountId")
);

-- CreateIndex
CREATE INDEX "SeasonResult_seasonId_rank_idx" ON "SeasonResult"("seasonId", "rank");

-- AddForeignKey
ALTER TABLE "SeasonResult" ADD CONSTRAINT "SeasonResult_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;
