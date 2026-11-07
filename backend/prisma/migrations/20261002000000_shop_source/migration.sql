-- AlterTable
ALTER TABLE "ShopItem" ADD COLUMN     "refCheckedAt" TIMESTAMP(3),
ADD COLUMN     "refPrice" INTEGER,
ADD COLUMN     "refSoldOut" BOOLEAN,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceSite" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ShopItem_sourceSite_sourceId_key" ON "ShopItem"("sourceSite", "sourceId");

