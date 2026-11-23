-- AlterTable
ALTER TABLE "driver_documents" ADD COLUMN     "drivingLicenseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "nationalIdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "proofOfAddressExpiresAt" TIMESTAMP(3),
ADD COLUMN     "taxIdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "vehicleInsuranceExpiresAt" TIMESTAMP(3),
ADD COLUMN     "vehicleRegistrationExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "fleet_manager_profiles" ADD COLUMN     "activityDocumentExpiresAt" TIMESTAMP(3),
ADD COLUMN     "addressProofExpiresAt" TIMESTAMP(3),
ADD COLUMN     "businessLicenseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "ibanProofExpiresAt" TIMESTAMP(3),
ADD COLUMN     "idProofExpiresAt" TIMESTAMP(3);
