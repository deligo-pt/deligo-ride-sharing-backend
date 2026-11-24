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
