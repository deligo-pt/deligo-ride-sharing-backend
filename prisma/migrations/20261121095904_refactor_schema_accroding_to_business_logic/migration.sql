/*
  Warnings:

  - You are about to drop the column `drivingLicenseExpiry` on the `driver_documents` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleInsuranceExpiry` on the `driver_documents` table. All the data in the column will be lost.
  - You are about to drop the column `vehicleRegistrationExpiry` on the `driver_documents` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `wallet_transactions` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `balance` on the `wallets` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.

*/
-- DropIndex
DROP INDEX "users_email_idx";

-- DropIndex
DROP INDEX "users_phone_idx";

-- AlterTable
ALTER TABLE "admin_profiles" ALTER COLUMN "accessLabel" SET DEFAULT 'SUPPORT';

-- AlterTable
ALTER TABLE "driver_documents" DROP COLUMN "drivingLicenseExpiry",
DROP COLUMN "vehicleInsuranceExpiry",
DROP COLUMN "vehicleRegistrationExpiry",
ALTER COLUMN "driverSelfieUrl" DROP NOT NULL,
ALTER COLUMN "drivingLicenseUrl" DROP NOT NULL,
ALTER COLUMN "nationalIdUrl" DROP NOT NULL,
ALTER COLUMN "proofOfAddressUrl" DROP NOT NULL,
ALTER COLUMN "taxIdUrl" DROP NOT NULL,
ALTER COLUMN "vehicleInsuranceUrl" DROP NOT NULL,
ALTER COLUMN "vehicleRegistrationUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "driver_profiles" ALTER COLUMN "licenseNumber" DROP NOT NULL,
ALTER COLUMN "licenseExpiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "wallet_transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "wallets" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(12,2);
