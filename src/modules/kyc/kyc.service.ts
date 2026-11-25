import type { DriverDocument, KycStatus, Prisma, UserStatus } from '@prisma/client';
import prisma from '../../config/db';
import { NotificationService, logNotificationFailure } from '../notification/notification.service';
import { AuthService } from '../auth/auth.service';
import {
  PendingKycQueryInput,
  RejectUserInput,
  ReviewDocumentInput,
  ReviewKycInput,
} from './kyc.validation';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { deleteFromRustFSInBackground } from '../../utils/rustfs.util';
import type {
  ApplyKycDecisionParams,
  DocumentType,
  FlattenedKycDocuments,
  KycRequirementItem,
  SingleDocumentPayload,
  UserKycActionResponse,
} from './kyc.interface';
import { KYC_OUTCOMES, REQUIRED_KYC_DOCUMENTS } from './kyc.constant';

export const documentSelect = {
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

export type KycDocumentPayload = Prisma.DriverDocumentGetPayload<{ select: typeof documentSelect }>;

export const driverDocumentListSelect = {
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
} as const;

export type DriverWithDocumentPayload = Prisma.DriverProfileGetPayload<{
  select: typeof driverDocumentListSelect;
}>;

export interface KycStatusResponse {
  isComplete: boolean;
  isFullyApproved: boolean;
  document: KycDocumentPayload | null;
}

export interface ApplyKycDecisionResult {
  document: DriverDocument;
  profile: {
    id: string;
    kycStatus: KycStatus;
    isAvailable: boolean;
  };
  user: {
    id: string;
    status: UserStatus;
  };
}

const buildFlattenedData = (documents: SingleDocumentPayload[]): FlattenedKycDocuments => {
  const map = new Map(documents.map((d) => [d.documentType, d]));
  const expiry = (type: DocumentType): Date | undefined => {
    const value = map.get(type)?.expiryDate;
    return value ? new Date(value) : undefined;
  };

  return {
    drivingLicenseUrl: map.get('DRIVING_LICENSE')?.documentUrl as string,
    drivingLicenseExpiresAt: expiry('DRIVING_LICENSE'),
    nationalIdUrl: map.get('NATIONAL_ID')?.documentUrl as string,
    vehicleRegistrationUrl: map.get('VEHICLE_REGISTRATION')?.documentUrl as string,
    vehicleRegistrationExpiresAt: expiry('VEHICLE_REGISTRATION'),
    vehicleInsuranceUrl: map.get('VEHICLE_INSURANCE')?.documentUrl as string,
    vehicleInsuranceExpiresAt: expiry('VEHICLE_INSURANCE'),
    driverSelfieUrl: map.get('DRIVER_SELFIE')?.documentUrl as string,
    proofOfAddressUrl: map.get('PROOF_OF_ADDRESS')?.documentUrl as string,
    taxIdUrl: map.get('TAX_ID')?.documentUrl as string,
  };
};

const submitAllDocuments = async (
  userId: string,
  documents: SingleDocumentPayload[],
): Promise<DriverDocument> => {
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId },
  });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile', {
      message: 'Driver profile not found. Only registered drivers can submit KYC documents.',
    });
  }

  const flattenedData = buildFlattenedData(documents);

  const previous = await prisma.driverDocument.findUnique({
    where: { driverProfileId: driverProfile.id },
  });

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
        // A re-submission without an expiry clears the previously stored one.
        drivingLicenseExpiresAt: flattenedData.drivingLicenseExpiresAt ?? null,
        vehicleRegistrationExpiresAt: flattenedData.vehicleRegistrationExpiresAt ?? null,
        vehicleInsuranceExpiresAt: flattenedData.vehicleInsuranceExpiresAt ?? null,
      },
    }),

    prisma.driverProfile.update({
      where: { id: driverProfile.id },
      data: { kycStatus: 'UNDER_REVIEW' },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { status: 'PENDING_VERIFICATION' },
    }),
  ]);

  // Drop superseded objects in the background, but never one that was just re-submitted.
  if (previous) {
    const kept = new Set(documents.map((d) => d.documentUrl));
    deleteFromRustFSInBackground(
      ...[
        previous.drivingLicenseUrl,
        previous.nationalIdUrl,
        previous.vehicleRegistrationUrl,
        previous.vehicleInsuranceUrl,
        previous.driverSelfieUrl,
        previous.proofOfAddressUrl,
        previous.taxIdUrl,
      ].filter((url) => url && !kept.has(url)),
    );
  }

  return upserted;
};

const getKycStatus = async (userId: string): Promise<KycStatusResponse> => {
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

const getPendingDocuments = async (): Promise<DriverWithDocumentPayload[]> => {
  return await prisma.driverProfile.findMany({
    where: {
      document: { verificationStatus: 'PENDING' },
    },
    select: driverDocumentListSelect,
    orderBy: { createdAt: 'desc' },
  });
};

const getAllDocuments = async (): Promise<DriverWithDocumentPayload[]> => {
  return await prisma.driverProfile.findMany({
    where: {
      document: { isNot: null },
    },
    select: driverDocumentListSelect,
    orderBy: { createdAt: 'desc' },
  });
};

const applyKycDecision = async (
  params: ApplyKycDecisionParams,
): Promise<ApplyKycDecisionResult> => {
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

  const reason = params.rejectionReason ?? params.reviewNote ?? null;
  const reasonText = reason ? ` Reason: ${reason}` : '';
  const notice =
    decision === 'APPROVED'
      ? {
          type: 'SYSTEM' as const,
          title: 'KYC approved',
          message: 'Your documents were approved. You can now go online and accept rides.',
        }
      : decision === 'REJECTED'
        ? {
            type: 'SYSTEM' as const,
            title: 'KYC rejected',
            message: `Your KYC submission was rejected.${reasonText} Please update your documents and resubmit.`,
          }
        : {
            type: 'SECURITY' as const,
            title: 'Driver account suspended',
            message: `Your driver account was suspended after review.${reasonText}`,
          };

  void NotificationService.dispatch({
    userId,
    ...notice,
    data: { kycStatus: outcome.kycStatus, decision, reason },
  }).catch(logNotificationFailure('kyc-review'));

  if (outcome.userStatus !== 'ACTIVE') {
    await AuthService.revokeAllUserSessions(userId);
  }

  return { document, profile, user };
};

const reviewDocument = async (
  documentId: string,
  payload: ReviewDocumentInput,
): Promise<DriverDocument> => {
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

export const driverProfileKycSelect = {
  id: true,
  licenseNumber: true,
  kycStatus: true,
  isAvailable: true,
  averageRating: true,
  totalRides: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
    },
  },
  document: { select: documentSelect },
  vehicle: {
    select: {
      id: true,
      vehicleClass: true,
      vehicleType: true,
      brand: true,
      model: true,
      licensePlate: true,
      approvalStatus: true,
    },
  },
} as const;

export type DriverProfileKycPayload = Prisma.DriverProfileGetPayload<{
  select: typeof driverProfileKycSelect;
}>;

export interface ReviewDriverKycResult {
  document: DriverDocument;
  profile: DriverProfileKycPayload;
}

const getPendingKycProfiles = async (): Promise<DriverProfileKycPayload[]> => {
  return prisma.driverProfile.findMany({
    where: {
      kycStatus: { in: ['UNDER_REVIEW', 'PENDING_DOCS'] },
    },
    select: driverProfileKycSelect,
    orderBy: { createdAt: 'asc' },
  });
};

const reviewDriverKyc = async (
  driverProfileId: string,
  payload: ReviewKycInput,
): Promise<ReviewDriverKycResult> => {
  const profile = await prisma.driverProfile.findUnique({
    where: { id: driverProfileId },
    include: { document: true, user: { select: { id: true } } },
  });

  if (!profile) {
    throw new NotFoundError('DriverProfile');
  }

  if (!profile.document) {
    throw new BadRequestError('This driver has not submitted any KYC documents yet.');
  }

  const { document } = await applyKycDecision({
    driverProfileId,
    userId: profile.user.id,
    decision: payload.kycStatus,
    reviewNote: payload.reviewNote,
    rejectionReason: payload.rejectionReason,
  });

  const updatedProfile = await prisma.driverProfile.findUniqueOrThrow({
    where: { id: driverProfileId },
    select: driverProfileKycSelect,
  });

  return { document, profile: updatedProfile };
};

const getMyDocuments = async (userId: string): Promise<KycDocumentPayload | null> => {
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

const getKycRequirements = (): KycRequirementItem[] => {
  return REQUIRED_KYC_DOCUMENTS.map((doc) => ({
    documentType: doc.type,
    label: doc.label,
    description: doc.description,
    requiresExpiry: doc.requiresExpiry,
  }));
};

export const pendingKycSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  driverProfile: {
    select: {
      id: true,
      licenseNumber: true,
      licenseExpiresAt: true,
      kycStatus: true,
      createdAt: true,
      document: { select: documentSelect },
      vehicle: {
        select: {
          id: true,
          brand: true,
          model: true,
          licensePlate: true,
          approvalStatus: true,
        },
      },
    },
  },
  fleetManagerProfile: {
    select: {
      id: true,
      businessName: true,
      legalBusinessName: true,
      licenseNumber: true,
      nifNumber: true,
      businessEmail: true,
      businessPhone: true,
      verificationStatus: true,
      submittedAt: true,
      createdAt: true,
      photoUrl: true,
      businessLicenseUrl: true,
      businessLicenseExpiresAt: true,
      idProofFrontUrl: true,
      idProofBackUrl: true,
      idProofExpiresAt: true,
      addressProofUrl: true,
      addressProofExpiresAt: true,
      activityDocumentUrl: true,
      activityDocumentExpiresAt: true,
      ibanProofUrl: true,
      ibanProofExpiresAt: true,
    },
  },
} as const;

export type PendingKycItem = Prisma.UserGetPayload<{ select: typeof pendingKycSelect }>;

export interface PendingKycResponse {
  items: PendingKycItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    totalPage: number;
  };
}

const getPendingKyc = async (query: PendingKycQueryInput): Promise<PendingKycResponse> => {
  const { role, page = 1, limit = 20 } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    isDeleted: false,
  };

  if (role === 'DRIVER') {
    where.role = 'DRIVER';
    where.driverProfile = {
      kycStatus: { in: ['UNDER_REVIEW', 'PENDING_DOCS'] },
    };
  } else if (role === 'FLEET_MANAGER') {
    where.role = 'FLEET_MANAGER';
    where.fleetManagerProfile = {
      verificationStatus: 'UNDER_REVIEW',
    };
  } else {
    where.OR = [
      {
        role: 'DRIVER',
        driverProfile: {
          kycStatus: { in: ['UNDER_REVIEW', 'PENDING_DOCS'] },
        },
      },
      {
        role: 'FLEET_MANAGER',
        fleetManagerProfile: {
          verificationStatus: 'UNDER_REVIEW',
        },
      },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: pendingKycSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages,
      totalPage: totalPages,
    },
  };
};

const acceptUser = async (adminId: string, userId: string): Promise<UserKycActionResponse> => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    include: {
      driverProfile: {
        include: { document: true },
      },
      fleetManagerProfile: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role !== 'DRIVER' && user.role !== 'FLEET_MANAGER') {
    throw new BadRequestError('Only DRIVER or FLEET_MANAGER accounts can be reviewed via KYC.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', previousStatus: null },
    });

    if (user.role === 'DRIVER') {
      if (!user.driverProfile || !user.driverProfile.document) {
        throw new BadRequestError('Driver has not submitted KYC documents yet.');
      }

      await tx.driverProfile.update({
        where: { id: user.driverProfile.id },
        data: { kycStatus: 'APPROVED', previousKycStatus: null },
      });

      await tx.driverDocument.update({
        where: { id: user.driverProfile.document.id },
        data: {
          verificationStatus: 'APPROVED',
          previousVerificationStatus: null,
          rejectionReason: null,
          reviewedAt: new Date(),
        },
      });
    } else {
      if (!user.fleetManagerProfile) {
        throw new BadRequestError('Fleet manager profile not found.');
      }

      await tx.fleetManagerProfile.update({
        where: { id: user.fleetManagerProfile.id },
        data: {
          verificationStatus: 'APPROVED',
          previousVerificationStatus: null,
          rejectionReason: null,
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      });
    }
  });

  void NotificationService.dispatch({
    userId,
    type: 'SYSTEM',
    title: 'KYC Approved',
    message:
      user.role === 'DRIVER'
        ? 'Your KYC documents were approved. You can now go online and accept rides.'
        : 'Your Fleet Manager profile has been verified and approved.',
    data: { role: user.role, status: 'ACTIVE' },
  }).catch(logNotificationFailure('accept-user'));

  return {
    message: `${user.role === 'DRIVER' ? 'Driver' : 'Fleet Manager'} KYC approved successfully`,
    userId,
    role: user.role,
    status: 'ACTIVE',
  };
};

const rejectUser = async (
  adminId: string,
  userId: string,
  payload: RejectUserInput,
): Promise<UserKycActionResponse> => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    include: {
      driverProfile: {
        include: { document: true },
      },
      fleetManagerProfile: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role !== 'DRIVER' && user.role !== 'FLEET_MANAGER') {
    throw new BadRequestError('Only DRIVER or FLEET_MANAGER accounts can be reviewed via KYC.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { status: 'PENDING_VERIFICATION' },
    });

    if (user.role === 'DRIVER') {
      if (!user.driverProfile || !user.driverProfile.document) {
        throw new BadRequestError('Driver has not submitted KYC documents yet.');
      }

      await tx.driverProfile.update({
        where: { id: user.driverProfile.id },
        data: { kycStatus: 'REJECTED', isAvailable: false },
      });

      await tx.driverDocument.update({
        where: { id: user.driverProfile.document.id },
        data: {
          verificationStatus: 'REJECTED',
          rejectionReason: payload.rejectionReason,
          reviewedAt: new Date(),
        },
      });
    } else {
      if (!user.fleetManagerProfile) {
        throw new BadRequestError('Fleet manager profile not found.');
      }

      await tx.fleetManagerProfile.update({
        where: { id: user.fleetManagerProfile.id },
        data: {
          verificationStatus: 'REJECTED',
          rejectionReason: payload.rejectionReason,
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      });
    }
  });

  void NotificationService.dispatch({
    userId,
    type: 'SYSTEM',
    title: 'KYC Rejected',
    message: `Your KYC submission was rejected. Reason: ${payload.rejectionReason}. Please update your details and resubmit.`,
    data: { role: user.role, status: 'PENDING_VERIFICATION', reason: payload.rejectionReason },
  }).catch(logNotificationFailure('reject-user'));

  return {
    message: `${user.role === 'DRIVER' ? 'Driver' : 'Fleet Manager'} KYC rejected successfully`,
    userId,
    role: user.role,
    status: 'PENDING_VERIFICATION',
  };
};

const blockUser = async (adminId: string, userId: string): Promise<UserKycActionResponse> => {
  if (adminId === userId) {
    throw new ForbiddenError('You cannot block your own account.');
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    include: {
      driverProfile: {
        include: { document: true },
      },
      fleetManagerProfile: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role !== 'DRIVER' && user.role !== 'FLEET_MANAGER') {
    throw new BadRequestError('Only DRIVER or FLEET_MANAGER accounts can be blocked here.');
  }

  if (user.status === 'SUSPENDED') {
    throw new BadRequestError('User is already blocked.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        previousStatus: user.status,
        status: 'SUSPENDED',
      },
    });

    if (user.role === 'DRIVER' && user.driverProfile) {
      await tx.driverProfile.update({
        where: { id: user.driverProfile.id },
        data: {
          previousKycStatus: user.driverProfile.kycStatus,
          kycStatus: 'SUSPENDED',
          isAvailable: false,
        },
      });

      if (user.driverProfile.document) {
        await tx.driverDocument.update({
          where: { id: user.driverProfile.document.id },
          data: {
            previousVerificationStatus: user.driverProfile.document.verificationStatus,
            verificationStatus: 'SUSPENDED',
          },
        });
      }
    } else if (user.role === 'FLEET_MANAGER' && user.fleetManagerProfile) {
      await tx.fleetManagerProfile.update({
        where: { id: user.fleetManagerProfile.id },
        data: {
          previousVerificationStatus: user.fleetManagerProfile.verificationStatus,
          verificationStatus: 'SUSPENDED',
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      });
    }
  });

  await AuthService.revokeAllUserSessions(userId);

  void NotificationService.dispatch({
    userId,
    type: 'SECURITY',
    title: 'Account Blocked',
    message: 'Your account has been suspended by an administrator. Please contact support.',
    data: { status: 'SUSPENDED' },
  }).catch(logNotificationFailure('block-user'));

  return {
    message: `${user.role === 'DRIVER' ? 'Driver' : 'Fleet Manager'} blocked successfully`,
    userId,
    role: user.role,
    status: 'SUSPENDED',
  };
};

const unblockUser = async (adminId: string, userId: string): Promise<UserKycActionResponse> => {
  const user = await prisma.user.findFirst({
    where: { id: userId, isDeleted: false },
    include: {
      driverProfile: {
        include: { document: true },
      },
      fleetManagerProfile: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role !== 'DRIVER' && user.role !== 'FLEET_MANAGER') {
    throw new BadRequestError('Only DRIVER or FLEET_MANAGER accounts can be unblocked here.');
  }

  if (user.status !== 'SUSPENDED') {
    throw new BadRequestError('User is not currently blocked.');
  }

  const restoredUserStatus = user.previousStatus ?? 'PENDING_VERIFICATION';

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        status: restoredUserStatus,
        previousStatus: null,
      },
    });

    if (user.role === 'DRIVER' && user.driverProfile) {
      const restoredKyc = user.driverProfile.previousKycStatus ?? 'PENDING_DOCS';
      await tx.driverProfile.update({
        where: { id: user.driverProfile.id },
        data: {
          kycStatus: restoredKyc,
          previousKycStatus: null,
        },
      });

      if (user.driverProfile.document) {
        const restoredDoc = user.driverProfile.document.previousVerificationStatus ?? 'PENDING';
        await tx.driverDocument.update({
          where: { id: user.driverProfile.document.id },
          data: {
            verificationStatus: restoredDoc,
            previousVerificationStatus: null,
          },
        });
      }
    } else if (user.role === 'FLEET_MANAGER' && user.fleetManagerProfile) {
      const restoredVerification =
        user.fleetManagerProfile.previousVerificationStatus ?? 'PENDING_VERIFICATION';
      await tx.fleetManagerProfile.update({
        where: { id: user.fleetManagerProfile.id },
        data: {
          verificationStatus: restoredVerification,
          previousVerificationStatus: null,
          reviewedAt: new Date(),
          reviewedById: adminId,
        },
      });
    }
  });

  void NotificationService.dispatch({
    userId,
    type: 'SECURITY',
    title: 'Account Unblocked',
    message: 'Your account has been unblocked. Welcome back!',
    data: { status: restoredUserStatus },
  }).catch(logNotificationFailure('unblock-user'));

  return {
    message: `${user.role === 'DRIVER' ? 'Driver' : 'Fleet Manager'} unblocked successfully`,
    userId,
    role: user.role,
    status: restoredUserStatus,
  };
};

export const KycService = {
  submitAllDocuments,
  getKycStatus,
  getPendingDocuments,
  getAllDocuments,
  reviewDocument,
  applyKycDecision,
  getPendingKycProfiles,
  reviewDriverKyc,
  getMyDocuments,
  getKycRequirements,
  getPendingKyc,
  acceptUser,
  rejectUser,
  blockUser,
  unblockUser,
};
