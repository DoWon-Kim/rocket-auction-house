-- CreateEnum
CREATE TYPE "CardSource" AS ENUM ('SNKRDUNK');

-- CreateEnum
CREATE TYPE "CardSourceStatus" AS ENUM ('PENDING', 'LINKED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CardMatchMethod" AS ENUM ('AUTO', 'MANUAL', 'CREATED', 'LEGACY');

-- CreateTable
CREATE TABLE "CardSourceItem" (
    "id" TEXT NOT NULL,
    "source" "CardSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "tcgType" "TcgType" NOT NULL,
    "lang" TEXT,
    "productCode" TEXT,
    "rawName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setName" TEXT,
    "setCode" TEXT,
    "cardNumber" TEXT,
    "rarity" TEXT,
    "imageUrl" TEXT,
    "price" INTEGER,
    "listings" TEXT,
    "priceUpdatedAt" TIMESTAMP(3),
    "status" "CardSourceStatus" NOT NULL DEFAULT 'PENDING',
    "matchMethod" "CardMatchMethod",
    "cardId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardSourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardSourceItem_status_source_tcgType_idx" ON "CardSourceItem"("status", "source", "tcgType");

-- CreateIndex
CREATE INDEX "CardSourceItem_cardId_idx" ON "CardSourceItem"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "CardSourceItem_source_externalId_key" ON "CardSourceItem"("source", "externalId");

-- AddForeignKey
ALTER TABLE "CardSourceItem" ADD CONSTRAINT "CardSourceItem_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 이전 스니덩 임포터가 만든 카드(externalId = snkrdunk_<id>)를 연결 표로 이관
INSERT INTO "CardSourceItem" (
    "id", "source", "externalId", "tcgType", "rawName", "name", "setName", "setCode", "cardNumber",
    "rarity", "imageUrl", "price", "listings", "priceUpdatedAt", "status", "matchMethod", "cardId", "updatedAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || c."id")::uuid::text,
    'SNKRDUNK', substring(c."externalId" from 10), c."tcgType", c."name", c."name", c."setName", c."setCode", c."cardNumber",
    c."rarity", c."imageUrl", c."snkrdunkPrice", c."snkrdunkListings", c."snkrdunkUpdatedAt", 'LINKED', 'LEGACY', c."id", CURRENT_TIMESTAMP
FROM "Card" c
WHERE c."externalId" LIKE 'snkrdunk\_%'
ON CONFLICT ("source", "externalId") DO NOTHING;
