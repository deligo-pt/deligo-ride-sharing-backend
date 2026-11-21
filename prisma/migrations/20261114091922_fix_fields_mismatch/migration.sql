/*
  Warnings:

  - You are about to drop the column `isEmailVerified` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `isPhoneVerified` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "isEmailVerified",
DROP COLUMN "isPhoneVerified",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;
