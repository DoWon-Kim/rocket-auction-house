-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'SYSTEM', 'OFFER');

-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'RESERVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LISTING_RESERVED';
ALTER TYPE "NotificationType" ADD VALUE 'PURCHASE_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOWED_SHOP_LISTING';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "offerId" TEXT,
ADD COLUMN     "type" "ChatMessageType" NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "bumpedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "negotiable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservedAt" TIMESTAMP(3),
ADD COLUMN     "reservedForId" TEXT,
ADD COLUMN     "reservedPrice" INTEGER,
ADD COLUMN     "shippingFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "title" VARCHAR(60);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "address" TEXT,
ADD COLUMN     "addressDetail" TEXT,
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT,
ADD COLUMN     "shippingFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingMemo" TEXT,
ADD COLUMN     "zipCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shopIntro" VARCHAR(300);

-- CreateTable
CREATE TABLE "ListingLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingLike_listingId_idx" ON "ListingLike"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingLike_userId_listingId_key" ON "ListingLike"("userId", "listingId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "Listing_status_bumpedAt_idx" ON "Listing"("status", "bumpedAt");

-- CreateIndex
CREATE INDEX "Listing_reservedForId_idx" ON "Listing"("reservedForId");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_reservedForId_fkey" FOREIGN KEY ("reservedForId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingLike" ADD CONSTRAINT "ListingLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingLike" ADD CONSTRAINT "ListingLike_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 기존 리스팅은 등록 시각을 끌올 기준으로
UPDATE "Listing" SET "bumpedAt" = "createdAt";
