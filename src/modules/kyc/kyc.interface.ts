import type { DocumentStatus } from '@prisma/client';

export type DocumentType =
  | 'DRIVING_LICENSE'
  | 'NATIONAL_ID'
  | 'VEHICLE_REGISTRATION'
  | 'VEHICLE_INSURANCE'
  | 'DRIVER_SELFIE'
  | 'PROOF_OF_ADDRESS'
  | 'TAX_ID';

export type KycDecision = Exclude<DocumentStatus, 'PENDING'>;

export interface RequiredDocument {
  type: DocumentType;
  label: string;
  description: string;
  requiresExpiry: boolean;
}

export interface SingleDocumentPayload {
  documentType: DocumentType;
  documentUrl: string;
  expiryDate?: string;
}

export interface ApplyKycDecisionParams {
  driverProfileId: string;
  userId: string;
  decision: KycDecision;
  reviewNote?: string | null;
  rejectionReason?: string | null;
}

export interface FlattenedKycDocuments {
  drivingLicenseUrl: string;
  drivingLicenseExpiresAt?: Date;
  nationalIdUrl: string;
  vehicleRegistrationUrl: string;
  vehicleRegistrationExpiresAt?: Date;
  vehicleInsuranceUrl: string;
  vehicleInsuranceExpiresAt?: Date;
  driverSelfieUrl: string;
  proofOfAddressUrl: string;
  taxIdUrl: string;
}

export interface KycRequirementItem {
  documentType: DocumentType;
  label: string;
  description: string;
  requiresExpiry: boolean;
}

export interface UserKycActionResponse {
  message: string;
  userId: string;
  role: string;
  status: string;
}
