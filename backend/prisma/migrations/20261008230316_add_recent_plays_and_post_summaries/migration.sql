-- CreateTable
CREATE TABLE "RecentPlay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "radioId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentPlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostSummary" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecentPlay_userId_playedAt_idx" ON "RecentPlay"("userId", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecentPlay_userId_radioId_key" ON "RecentPlay"("userId", "radioId");

-- CreateIndex
CREATE UNIQUE INDEX "PostSummary_postId_userId_key" ON "PostSummary"("postId", "userId");

-- AddForeignKey
ALTER TABLE "RecentPlay" ADD CONSTRAINT "RecentPlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostSummary" ADD CONSTRAINT "PostSummary_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostSummary" ADD CONSTRAINT "PostSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
