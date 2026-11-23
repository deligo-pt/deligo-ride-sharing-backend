import type { DocumentStatus, KycStatus, UserStatus } from '@prisma/client';
import prisma from '../../config/db';
import {
  ReviewDocumentInput,
  REQUIRED_KYC_DOCUMENTS,
  SingleDocumentPayload,
} from './kyc.validation';
import { BadRequestError, NotFoundError } from '../../utils/errors';

// ─── Shared document select shape ─────────────────────────────────────────────

const documentSelect = {
  id: true,
  drivingLicenseUrl: true,
  nationalIdUrl: true,
  vehicleRegistrationUrl: true,
  vehicleInsuranceUrl: true,
  driverSelfieUrl: true,
  proofOfAddressUrl: true,
  taxIdUrl: true,
  verificationStatus: true,
  reviewNote: true,
  rejectionReason: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Helper to map an array of SingleDocumentPayload into the flattened schema format
const buildFlattenedData = (documents: SingleDocumentPayload[]) => {
  const map = new Map(documents.map((d) => [d.documentType, d]));

  return {
    drivingLicenseUrl: map.get('DRIVING_LICENSE')?.documentUrl as string,
    nationalIdUrl: map.get('NATIONAL_ID')?.documentUrl as string,
    vehicleRegistrationUrl: map.get('VEHICLE_REGISTRATION')?.documentUrl as string,
    vehicleInsuranceUrl: map.get('VEHICLE_INSURANCE')?.documentUrl as string,
    driverSelfieUrl: map.get('DRIVER_SELFIE')?.documentUrl as string,
    proofOfAddressUrl: map.get('PROOF_OF_ADDRESS')?.documentUrl as string,
    taxIdUrl: map.get('TAX_ID')?.documentUrl as string,
  };
};

// ─── POST /kyc/documents (BULK) ────────────────────────────────────────────────
// Upserts the flattened DriverDocument row for a driver.

const uploadAllDocuments = async (userId: string, documents: SingleDocumentPayload[]) => {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
  });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile', {
      message: 'Driver profile not found. Only registered drivers can upload KYC documents.',
    });
  }

  const flattenedData = buildFlattenedData(documents);

  // Use upsert because driverProfileId is @unique
  // Document upsert, KYC state and account status move together.
  const [upserted] = await prisma.$transaction([
    prisma.driverDocument.upsert({
      where: { driverProfileId: driverProfile.id },
      create: {
        driverProfileId: driverProfile.id,
        verificationStatus: 'PENDING',
        ...flattenedData,
      },
      update: {
        verificationStatus: 'PENDING',
        reviewNote: null,
        rejectionReason: null,
        reviewedAt: null,
        ...flattenedData,
      },
    }),
    // UNDER_REVIEW is what puts the driver in the admin review queue (GET /admin/kyc/pending).
    prisma.driverProfile.update({
      where: { id: driverProfile.id },
      data: { kycStatus: 'UNDER_REVIEW' },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { status: 'PENDING_VERIFICATION' },
    }),
  ]);

  return upserted;
};

// ─── GET /kyc/status ─────────────────────────────────────────────────────────

const getKycStatus = async (userId: string) => {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
    include: {
      document: { select: documentSelect },
    },
  });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile');
  }

  const doc = driverProfile.document;

  return {
    isComplete: !!doc,
    isFullyApproved: doc?.verificationStatus === 'APPROVED',
    document: doc || null,
  };
};

// ─── GET /kyc/documents/pending ──────────────────────────────────────────────

const getPendingDocuments = async () => {
  return await prisma.driverProfile.findMany({
    where: {
      document: { verificationStatus: 'PENDING' },
    },
    select: {
      id: true,
      licenseNumber: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
        },
      },
      document: {
        select: documentSelect,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

// ─── GET /kyc/documents/all ───────────────────────────────────────────────────

const getAllDocuments = async () => {
  return await prisma.driverProfile.findMany({
    where: {
      document: { isNot: null },
    },
    select: {
      id: true,
      licenseNumber: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
        },
      },
      document: {
        select: documentSelect,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

// ─── KYC review (single source of truth) ──────────────────────────────────────
// Both review endpoints — PATCH /kyc/documents/:id/review and
// PATCH /admin/kyc/:driverProfileId — end up here, so a review ALWAYS updates the
// document, DriverProfile.kycStatus and User.status together in ONE transaction.
// (ride acceptance requires kycStatus === APPROVED *and* user.status === ACTIVE.)

export type KycDecision = Exclude<DocumentStatus, 'PENDING'>;

const KYC_OUTCOMES: Record<KycDecision, { kycStatus: KycStatus; userStatus: UserStatus }> = {
  APPROVED: { kycStatus: 'APPROVED', userStatus: 'ACTIVE' },
  REJECTED: { kycStatus: 'REJECTED', userStatus: 'PENDING_VERIFICATION' },
  SUSPENDED: { kycStatus: 'SUSPENDED', userStatus: 'SUSPENDED' },
  TEMPORARILY_BLOCKED: { kycStatus: 'SUSPENDED', userStatus: 'SUSPENDED' },
};

interface ApplyKycDecisionParams {
  driverProfileId: string;
  userId: string;
  decision: KycDecision;
  reviewNote?: string | null;
  rejectionReason?: string | null;
}

const applyKycDecision = async (params: ApplyKycDecisionParams) => {
  const { driverProfileId, userId, decision } = params;
  const outcome = KYC_OUTCOMES[decision];

  const [document, profile, user] = await prisma.$transaction([
    prisma.driverDocument.update({
      where: { driverProfileId },
      data: {
        verificationStatus: decision,
        reviewNote: params.reviewNote ?? null,
        rejectionReason: decision === 'APPROVED' ? null : (params.rejectionReason ?? null),
        reviewedAt: new Date(),
      },
    }),
    // isAvailable stays false after any review — an approved driver toggles it themselves.
    prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { kycStatus: outcome.kycStatus, isAvailable: false },
      select: { id: true, kycStatus: true, isAvailable: true },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { status: outcome.userStatus },
      select: { id: true, status: true },
    }),
  ]);

  return { document, profile, user };
};

// ─── PATCH /kyc/documents/:id/review ─────────────────────────────────────────

const reviewDocument = async (documentId: string, payload: ReviewDocumentInput) => {
  const existing = await prisma.driverDocument.findUnique({
    where: { id: documentId },
    include: {
      driverProfile: {
        select: { userId: true, id: true },
      },
    },
  });

  if (!existing) {
    throw new NotFoundError('Document set');
  }

  if (existing.verificationStatus === payload.verificationStatus) {
    throw new BadRequestError(`Document set is already ${existing.verificationStatus}.`);
  }

  const { document } = await applyKycDecision({
    driverProfileId: existing.driverProfile.id,
    userId: existing.driverProfile.userId,
    decision: payload.verificationStatus,
    reviewNote: payload.reviewNote,
    rejectionReason: payload.rejectionReason,
  });

  return document;
};

// ─── GET /kyc/documents/me ───────────────────────────────────────────────────

const getMyDocuments = async (userId: string) => {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
  });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile');
  }

  return await prisma.driverDocument.findUnique({
    where: { driverProfileId: driverProfile.id },
    select: documentSelect,
  });
};

// ─── GET /kyc/requirements ────────────────────────────────────────────────────

const getKycRequirements = () => {
  return REQUIRED_KYC_DOCUMENTS.map((doc) => ({
    documentType: doc.type,
    label: doc.label,
    description: doc.description,
    requiresExpiry: doc.requiresExpiry,
  }));
};

export const KycService = {
  uploadAllDocuments,
  getKycStatus,
  getPendingDocuments,
  getAllDocuments,
  reviewDocument,
  applyKycDecision,
  getMyDocuments,
  getKycRequirements,
};
