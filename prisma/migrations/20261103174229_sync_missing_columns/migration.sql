/*
  Warnings:

  - The values [FIXED] on the enum `DiscountType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `documentType` on the `driver_documents` table. All the data in the column will be lost.
  - You are about to drop the column `documentUrl` on the `driver_documents` table. All the data in the column will be lost.
  - You are about to drop the column `expiryDate` on the `driver_documents` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `promo_codes` table. All the data in the column will be lost.
  - You are about to drop the column `discountAmount` on the `promo_codes` table. All the data in the column will be lost.
  - You are about to drop the column `discountPercent` on the `promo_codes` table. All the data in the column will be lost.
  - You are about to drop the column `maxUses` on the `promo_codes` table. All the data in the column will be lost.
  - You are about to drop the column `minimumFareAmount` on the `promo_codes` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `promo_codes` table. All the data in the column will be lost.
  - You are about to drop the column `usedCount` on the `promo_codes` table. All the data in the column will be lost.
  - You are about to drop the column `isVerified` on the `vehicles` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[driverProfileId]` on the table `driver_documents` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[rideId,authorId]` on the table `reviews` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `driverSelfieUrl` to the `driver_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `drivingLicenseUrl` to the `driver_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nationalIdUrl` to the `driver_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `proofOfAddressUrl` to the `driver_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `taxIdUrl` to the `driver_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicleInsuranceUrl` to the `driver_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicleRegistrationUrl` to the `driver_documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `discountValue` to the `promo_codes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maxGlobalUses` to the `promo_codes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('RESTRICTED', 'SURCHARGE');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_DOCS', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VehicleApprovalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RideStopStatus" AS ENUM ('PENDING', 'ARRIVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('SAFETY', 'COMPLAINT', 'LOST_ITEM', 'GENERAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertInitiatorRole" AS ENUM ('CUSTOMER', 'DRIVER');

-- CreateEnum
CREATE TYPE "EmergencyAlertStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'FALSE_ALARM');

-- AlterEnum
BEGIN;
CREATE TYPE "DiscountType_new" AS ENUM ('FLAT', 'PERCENTAGE');
ALTER TABLE "public"."promo_codes" ALTER COLUMN "discountType" DROP DEFAULT;
ALTER TABLE "promo_codes" ALTER COLUMN "discountType" TYPE "DiscountType_new" USING ("discountType"::text::"DiscountType_new");
ALTER TYPE "DiscountType" RENAME TO "DiscountType_old";
ALTER TYPE "DiscountType_new" RENAME TO "DiscountType";
DROP TYPE "public"."DiscountType_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "DocumentStatus" ADD VALUE 'TEMPORARILY_BLOCKED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'RIDE_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE 'SECURITY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RideStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "RideStatus" ADD VALUE 'EMERGENCY';

-- DropIndex
DROP INDEX "reviews_rideId_key";

-- AlterTable
ALTER TABLE "customer_profiles" ADD COLUMN     "totalReviews" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "averageRating" SET DEFAULT 5.0;

-- AlterTable
ALTER TABLE "driver_documents" DROP COLUMN "documentType",
DROP COLUMN "documentUrl",
DROP COLUMN "expiryDate",
ADD COLUMN     "driverSelfieUrl" TEXT NOT NULL,
ADD COLUMN     "drivingLicenseExpiry" TIMESTAMP(3),
ADD COLUMN     "drivingLicenseUrl" TEXT NOT NULL,
ADD COLUMN     "nationalIdUrl" TEXT NOT NULL,
ADD COLUMN     "proofOfAddressUrl" TEXT NOT NULL,
ADD COLUMN     "taxIdUrl" TEXT NOT NULL,
ADD COLUMN     "vehicleInsuranceExpiry" TIMESTAMP(3),
ADD COLUMN     "vehicleInsuranceUrl" TEXT NOT NULL,
ADD COLUMN     "vehicleRegistrationExpiry" TIMESTAMP(3),
ADD COLUMN     "vehicleRegistrationUrl" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "driver_profiles" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "totalReviews" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "averageRating" SET DEFAULT 5.0;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "promo_codes" DROP COLUMN "description",
DROP COLUMN "discountAmount",
DROP COLUMN "discountPercent",
DROP COLUMN "maxUses",
DROP COLUMN "minimumFareAmount",
DROP COLUMN "updatedAt",
DROP COLUMN "usedCount",
ADD COLUMN     "currentUses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "discountValue" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxDiscountCap" DOUBLE PRECISION,
ADD COLUMN     "maxGlobalUses" INTEGER NOT NULL,
ADD COLUMN     "minRideValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "discountType" DROP DEFAULT;

-- AlterTable
ALTER TABLE "reviews" ALTER COLUMN "rating" DROP DEFAULT;

-- AlterTable
ALTER TABLE "rides" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedDistance" DOUBLE PRECISION,
ADD COLUMN     "estimatedDuration" INTEGER,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "fcmToken" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "isVerified",
ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "approvalStatus" "VehicleApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN     "insuranceExpiryDate" TIMESTAMP(3),
ADD COLUMN     "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "registrationExpiryDate" TIMESTAMP(3),
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- DropEnum
DROP TYPE "DocumentType";

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "baseFare" DOUBLE PRECISION NOT NULL,
    "perKmRate" DOUBLE PRECISION NOT NULL,
    "perMinRate" DOUBLE PRECISION NOT NULL,
    "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "adminFeePercentage" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "polygon" JSONB NOT NULL,
    "type" "ZoneType" NOT NULL,
    "surchargeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_usages" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rideId" TEXT,
    "discountApplied" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_stops" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "RideStopStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_ride_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "daysOfWeek" INTEGER[],
    "timeOfDay" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_ride_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rideId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "adminId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_alerts" (
    "id" TEXT NOT NULL,
    "rideId" TEXT,
    "initiatorId" TEXT NOT NULL,
    "initiatorRole" "AlertInitiatorRole" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "status" "EmergencyAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "resolvedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rules_vehicleType_key" ON "pricing_rules"("vehicleType");

-- CreateIndex
CREATE INDEX "promo_usages_promoCodeId_idx" ON "promo_usages"("promoCodeId");

-- CreateIndex
CREATE INDEX "promo_usages_userId_idx" ON "promo_usages"("userId");

-- CreateIndex
CREATE INDEX "ride_stops_rideId_sequence_idx" ON "ride_stops"("rideId", "sequence");

-- CreateIndex
CREATE INDEX "recurring_ride_profiles_userId_isActive_idx" ON "recurring_ride_profiles"("userId", "isActive");

-- CreateIndex
CREATE INDEX "emergency_contacts_userId_idx" ON "emergency_contacts"("userId");

-- CreateIndex
CREATE INDEX "support_tickets_userId_status_idx" ON "support_tickets"("userId", "status");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_idx" ON "ticket_messages"("ticketId");

-- CreateIndex
CREATE INDEX "emergency_alerts_status_createdAt_idx" ON "emergency_alerts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "emergency_alerts_initiatorId_idx" ON "emergency_alerts"("initiatorId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_documents_driverProfileId_key" ON "driver_documents"("driverProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_rideId_authorId_key" ON "reviews"("rideId", "authorId");

-- AddForeignKey
ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_stops" ADD CONSTRAINT "ride_stops_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_alerts" ADD CONSTRAINT "emergency_alerts_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_alerts" ADD CONSTRAINT "emergency_alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
