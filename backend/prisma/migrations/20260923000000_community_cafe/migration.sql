-- CreateEnum
CREATE TYPE "BoardCategory" AS ENUM ('FREE', 'SHOWOFF', 'INFO', 'QNA', 'REVIEW');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNITY_COMMENT';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "category" "BoardCategory",
ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Post_type_category_createdAt_idx" ON "Post"("type", "category", "createdAt");

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 기존 커뮤니티 글은 자유게시판으로 분류
UPDATE "Post" SET "category" = 'FREE' WHERE "type" = 'COMMUNITY' AND "category" IS NULL;
