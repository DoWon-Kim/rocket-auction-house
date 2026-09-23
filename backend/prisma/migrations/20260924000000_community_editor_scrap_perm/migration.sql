-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('TEXT', 'HTML');

-- CreateEnum
CREATE TYPE "BoardPermission" AS ENUM ('ALL', 'MEMBER', 'GOOD', 'DEVOTED', 'VIP', 'ADMIN');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "contentFormat" "ContentFormat" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "contentText" TEXT;

-- CreateTable
CREATE TABLE "BoardSetting" (
    "category" "BoardCategory" NOT NULL,
    "writePermission" "BoardPermission" NOT NULL DEFAULT 'ALL',
    "commentPermission" "BoardPermission" NOT NULL DEFAULT 'ALL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardSetting_pkey" PRIMARY KEY ("category")
);

-- CreateTable
CREATE TABLE "PostScrap" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostScrap_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "PostView" (
    "postId" TEXT NOT NULL,
    "viewerKey" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostView_pkey" PRIMARY KEY ("postId","viewerKey")
);

-- CreateIndex
CREATE INDEX "PostScrap_userId_createdAt_idx" ON "PostScrap"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostView_viewedAt_idx" ON "PostView"("viewedAt");

-- AddForeignKey
ALTER TABLE "PostScrap" ADD CONSTRAINT "PostScrap_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostScrap" ADD CONSTRAINT "PostScrap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 기존 글 검색용 평문 채우기
UPDATE "Post" SET "contentText" = "content" WHERE "contentText" IS NULL;
