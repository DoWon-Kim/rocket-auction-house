-- AlterTable
ALTER TABLE "Card" ADD COLUMN "snkrdunkListings" TEXT,
                   ADD COLUMN "snkrdunkPrice" INTEGER,
                   ADD COLUMN "snkrdunkUpdatedAt" TIMESTAMP(3);
