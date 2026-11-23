-- CreateEnum
CREATE TYPE "FleetVerificationStatus" AS ENUM ('PENDING_VERIFICATION', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "FleetSignerType" AS ENUM ('MYSELF', 'AUTHORIZED_REPRESENTATIVE');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'FLEET_MANAGER';

-- CreateTable
CREATE TABLE "fleet_manager_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT,
    "legalBusinessName" TEXT,
    "licenseNumber" TEXT,
    "nifNumber" TEXT,
    "businessEmail" TEXT,
    "businessPhone" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "street" TEXT,
    "city" TEXT,
    "district" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "accountHolderName" TEXT,
    "iban" TEXT,
    "photoUrl" TEXT,
    "businessLicenseUrl" TEXT,
    "idProofFrontUrl" TEXT,
    "idProofBackUrl" TEXT,
    "addressProofUrl" TEXT,
    "activityDocumentUrl" TEXT,
    "ibanProofUrl" TEXT,
    "signerType" "FleetSignerType",
    "representativeName" TEXT,
    "representativeId" TEXT,
    "signatureUrl" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "privacyAcceptedAt" TIMESTAMP(3),
    "verificationStatus" "FleetVerificationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "adminNote" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_manager_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fleet_manager_profiles_userId_key" ON "fleet_manager_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_manager_profiles_licenseNumber_key" ON "fleet_manager_profiles"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_manager_profiles_nifNumber_key" ON "fleet_manager_profiles"("nifNumber");

-- CreateIndex
CREATE INDEX "fleet_manager_profiles_verificationStatus_idx" ON "fleet_manager_profiles"("verificationStatus");

-- AddForeignKey
ALTER TABLE "fleet_manager_profiles" ADD CONSTRAINT "fleet_manager_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
