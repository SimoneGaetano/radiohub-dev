-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "radioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_radioId_key" ON "Favorite"("userId", "radioId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_externalId_key" ON "Post"("externalId");

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
