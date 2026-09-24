-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "detailSyncedAt" TIMESTAMP(3),
ADD COLUMN     "dexIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "evolvesFrom" TEXT,
ADD COLUMN     "regulationMark" TEXT,
ADD COLUMN     "stage" TEXT;

-- CreateTable
CREATE TABLE "CardSet" (
    "id" TEXT NOT NULL,
    "tcgType" "TcgType" NOT NULL,
    "lang" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "series" TEXT,
    "releaseDate" TIMESTAMP(3),
    "logoUrl" TEXT,
    "symbolUrl" TEXT,
    "officialCount" INTEGER,
    "totalCount" INTEGER,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardSet_tcgType_releaseDate_idx" ON "CardSet"("tcgType", "releaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "CardSet_tcgType_lang_code_key" ON "CardSet"("tcgType", "lang", "code");

-- CreateIndex
CREATE INDEX "Card_tcgType_setCode_idx" ON "Card"("tcgType", "setCode");

-- CreateIndex
CREATE INDEX "Card_regulationMark_idx" ON "Card"("regulationMark");

-- CreateIndex
CREATE INDEX "Card_evolvesFrom_idx" ON "Card"("evolvesFrom");

