import type { KycStatus, UserStatus } from '@prisma/client';
import type { DocumentType, KycDecision, RequiredDocument } from './kyc.interface';

export const REQUIRED_KYC_DOCUMENTS: RequiredDocument[] = [
  {
    type: 'DRIVING_LICENSE',
    label: 'Valid Driver License',
    description: "A government-issued driver's license that is currently valid.",
    requiresExpiry: true,
  },
  {
    type: 'NATIONAL_ID',
    label: 'National Identification Document',
    description: 'National ID card, passport, or any government-issued photo ID.',
    requiresExpiry: false,
  },
  {
    type: 'VEHICLE_REGISTRATION',
    label: 'Vehicle Registration Certificate',
    description: 'Official certificate proving the vehicle is registered in your name.',
    requiresExpiry: true,
  },
  {
    type: 'VEHICLE_INSURANCE',
    label: 'Vehicle Insurance Certificate',
    description: 'Current and valid vehicle insurance policy document.',
    requiresExpiry: true,
  },
  {
    type: 'DRIVER_SELFIE',
    label: 'Driver Selfie Verification',
    description: "A clear, recent photo of the driver's face (no sunglasses or hats).",
    requiresExpiry: false,
  },
  {
    type: 'PROOF_OF_ADDRESS',
    label: 'Proof of Address',
    description: 'Recent utility bill, bank statement, or official mail (not older than 3 months).',
    requiresExpiry: false,
  },
  {
    type: 'TAX_ID',
    label: 'Tax Identification Number',
    description: 'Government-issued Tax ID or TIN document.',
    requiresExpiry: false,
  },
];

export const REQUIRED_DOCUMENT_TYPES = REQUIRED_KYC_DOCUMENTS.map((d) => d.type);

export const EXPIRY_REQUIRED_TYPES: DocumentType[] = REQUIRED_KYC_DOCUMENTS.filter(
  (d) => d.requiresExpiry,
).map((d) => d.type);

export const KYC_OUTCOMES: Record<KycDecision, { kycStatus: KycStatus; userStatus: UserStatus }> = {
  APPROVED: { kycStatus: 'APPROVED', userStatus: 'ACTIVE' },
  REJECTED: { kycStatus: 'REJECTED', userStatus: 'PENDING_VERIFICATION' },
  SUSPENDED: { kycStatus: 'SUSPENDED', userStatus: 'SUSPENDED' },
  TEMPORARILY_BLOCKED: { kycStatus: 'SUSPENDED', userStatus: 'SUSPENDED' },
};
