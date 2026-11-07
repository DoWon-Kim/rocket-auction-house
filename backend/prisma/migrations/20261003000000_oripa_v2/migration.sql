-- CreateEnum
CREATE TYPE "OripaStatus" AS ENUM ('DRAFT', 'LIVE', 'PAUSED', 'SOLD_OUT');

-- CreateEnum
CREATE TYPE "OripaPrizeType" AS ENUM ('CARD', 'POINT');

-- DropForeignKey
ALTER TABLE "OripaItem" DROP CONSTRAINT "OripaItem_cardId_fkey";

-- DropForeignKey
ALTER TABLE "OripaItem" DROP CONSTRAINT "OripaItem_oripaId_fkey";

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "exchangeValue" INTEGER;

-- AlterTable
ALTER TABLE "Oripa" ADD COLUMN     "maxPerDraw" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "seedHash" TEXT,
ADD COLUMN     "serverSeed" TEXT,
ADD COLUMN     "soldOutAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "OripaStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "tcgType" "TcgType" NOT NULL DEFAULT 'POKEMON',
ADD COLUMN     "ticketOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "OripaItem" DROP COLUMN "weight",
ADD COLUMN     "exchangeValue" INTEGER,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "pointAmount" INTEGER,
ADD COLUMN     "prizeType" "OripaPrizeType" NOT NULL DEFAULT 'CARD',
ADD COLUMN     "remaining" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "cardId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Oripa_status_idx" ON "Oripa"("status");

-- AddForeignKey
ALTER TABLE "OripaItem" ADD CONSTRAINT "OripaItem_oripaId_fkey" FOREIGN KEY ("oripaId") REFERENCES "Oripa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OripaItem" ADD CONSTRAINT "OripaItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 기존 오리파: 판매 여부 → 상태 (완판은 SOLD_OUT, 나머지는 준비 중으로 돌려 티켓을 새로 봉인)
UPDATE "Oripa" SET "status" = CASE WHEN "remainSlots" <= 0 THEN 'SOLD_OUT'::"OripaStatus" ELSE 'DRAFT'::"OripaStatus" END;
ALTER TABLE "Oripa" DROP COLUMN "isActive";
