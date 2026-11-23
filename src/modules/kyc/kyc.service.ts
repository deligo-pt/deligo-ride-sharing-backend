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
  const upserted = await prisma.driverDocument.upsert({
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
  });

  await prisma.user.update({
    where: { id: userId },
    data: { status: 'PENDING_VERIFICATION' },
  });

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

// ─── PATCH /kyc/documents/:id/review ─────────────────────────────────────────
// Admin approves or rejects the entire document set.

const reviewDocument = async (documentId: string, payload: ReviewDocumentInput) => {
  const document = await prisma.driverDocument.findUnique({
    where: { id: documentId },
    include: {
      driverProfile: {
        select: { userId: true, id: true },
      },
    },
  });

  if (!document) {
    throw new NotFoundError('Document set');
  }

  if (document.verificationStatus === payload.verificationStatus) {
    throw new BadRequestError(`Document set is already ${document.verificationStatus}.`);
  }

  const updatedDoc = await prisma.driverDocument.update({
    where: { id: documentId },
    data: {
      verificationStatus: payload.verificationStatus,
      reviewNote: payload.reviewNote,
      rejectionReason: payload.verificationStatus !== 'APPROVED' ? payload.rejectionReason : null,
      reviewedAt: new Date(),
    },
  });

  if (payload.verificationStatus === 'APPROVED') {
    await prisma.user.update({
      where: { id: document.driverProfile.userId },
      data: { status: 'ACTIVE' },
    });
  } else if (payload.verificationStatus === 'REJECTED') {
    await prisma.user.update({
      where: { id: document.driverProfile.userId },
      data: { status: 'PENDING_VERIFICATION' },
    });
  } else if (
    payload.verificationStatus === 'SUSPENDED' ||
    payload.verificationStatus === 'TEMPORARILY_BLOCKED'
  ) {
    await prisma.user.update({
      where: { id: document.driverProfile.userId },
      data: { status: 'SUSPENDED' },
    });
  }

  return updatedDoc;
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
  getMyDocuments,
  getKycRequirements,
};
