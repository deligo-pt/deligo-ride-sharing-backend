-- AlterTable
ALTER TABLE "users" ADD COLUMN "previousStatus" "UserStatus";

-- AlterTable
ALTER TABLE "fleet_manager_profiles" ADD COLUMN "previousVerificationStatus" "FleetVerificationStatus";

-- AlterTable
ALTER TABLE "driver_profiles" ADD COLUMN "previousKycStatus" "KycStatus";

-- AlterTable
ALTER TABLE "driver_documents" ADD COLUMN "previousVerificationStatus" "DocumentStatus";
