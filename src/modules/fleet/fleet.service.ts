import prisma from '../../config/db';
import { Prisma } from '@prisma/client';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import {
  BankDetailsInput,
  BusinessDetailsInput,
  DocumentsInput,
  LocationDetailsInput,
  SubmitOnboardingInput,
} from './fleet.validation';

const getEditableProfile = async (userId: string) => {
  const profile = await prisma.fleetManagerProfile.findUnique({
    where: { userId },
  });

  if (!profile || profile.isDeleted) {
    throw new NotFoundError('Fleet manager profile not found');
  }

  if (
    profile.verificationStatus !== 'PENDING_VERIFICATION' &&
    profile.verificationStatus !== 'REJECTED'
  ) {
    throw new ForbiddenError('Onboarding profile cannot be modified in its current status');
  }

  return profile;
};

const getOnboardingStatus = async (userId: string) => {
  const profile = await prisma.fleetManagerProfile.findUnique({
    where: { userId },
  });

  if (!profile || profile.isDeleted) {
    throw new NotFoundError('Fleet manager profile not found');
  }

  const completedSteps = {
    business: Boolean(profile.businessName && profile.licenseNumber && profile.nifNumber),
    location: Boolean(
      profile.latitude !== null &&
      profile.longitude !== null &&
      profile.street &&
      profile.postalCode &&
      profile.country,
    ),
    bank: Boolean(profile.accountHolderName && profile.iban),
    documents: Boolean(
      profile.photoUrl &&
      profile.businessLicenseUrl &&
      profile.idProofFrontUrl &&
      profile.idProofBackUrl &&
      profile.addressProofUrl &&
      profile.activityDocumentUrl &&
      profile.ibanProofUrl,
    ),
    submitted: Boolean(
      profile.submittedAt &&
      (profile.verificationStatus === 'UNDER_REVIEW' || profile.verificationStatus === 'APPROVED'),
    ),
  };

  return {
    profile,
    completedSteps,
  };
};

const updateBusinessDetails = async (userId: string, input: BusinessDetailsInput) => {
  const profile = await getEditableProfile(userId);

  try {
    return await prisma.fleetManagerProfile.update({
      where: { id: profile.id },
      data: {
        businessName: input.businessName,
        legalBusinessName: input.legalBusinessName || null,
        licenseNumber: input.licenseNumber,
        nifNumber: input.nifNumber,
        businessEmail: input.businessEmail || null,
        businessPhone: input.businessPhone || null,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'licenseNumber or nifNumber';
      throw new ConflictError(`A fleet profile with this ${target} already exists`);
    }
    throw err;
  }
};

const updateLocationDetails = async (userId: string, input: LocationDetailsInput) => {
  const profile = await getEditableProfile(userId);

  return await prisma.fleetManagerProfile.update({
    where: { id: profile.id },
    data: {
      latitude: input.latitude,
      longitude: input.longitude,
      street: input.street,
      city: input.city || null,
      district: input.district || null,
      state: input.state || null,
      postalCode: input.postalCode,
      country: input.country,
    },
  });
};

const updateBankDetails = async (userId: string, input: BankDetailsInput) => {
  const profile = await getEditableProfile(userId);

  return await prisma.fleetManagerProfile.update({
    where: { id: profile.id },
    data: {
      accountHolderName: input.accountHolderName,
      iban: input.iban,
    },
  });
};

const updateDocuments = async (userId: string, input: DocumentsInput) => {
  const profile = await getEditableProfile(userId);

  const dataToUpdate: Prisma.FleetManagerProfileUpdateInput = {};
  if (input.photoUrl !== undefined) dataToUpdate.photoUrl = input.photoUrl;
  if (input.businessLicenseUrl !== undefined)
    dataToUpdate.businessLicenseUrl = input.businessLicenseUrl;
  if (input.idProofFrontUrl !== undefined) dataToUpdate.idProofFrontUrl = input.idProofFrontUrl;
  if (input.idProofBackUrl !== undefined) dataToUpdate.idProofBackUrl = input.idProofBackUrl;
  if (input.addressProofUrl !== undefined) dataToUpdate.addressProofUrl = input.addressProofUrl;
  if (input.activityDocumentUrl !== undefined)
    dataToUpdate.activityDocumentUrl = input.activityDocumentUrl;
  if (input.ibanProofUrl !== undefined) dataToUpdate.ibanProofUrl = input.ibanProofUrl;

  return await prisma.fleetManagerProfile.update({
    where: { id: profile.id },
    data: dataToUpdate,
  });
};

const submitOnboarding = async (userId: string, input: SubmitOnboardingInput) => {
  const profile = await getEditableProfile(userId);

  const missingFields: string[] = [];
  if (!profile.businessName) missingFields.push('businessName');
  if (!profile.licenseNumber) missingFields.push('licenseNumber');
  if (!profile.nifNumber) missingFields.push('nifNumber');
  if (profile.latitude === null || profile.latitude === undefined) missingFields.push('latitude');
  if (profile.longitude === null || profile.longitude === undefined)
    missingFields.push('longitude');
  if (!profile.street) missingFields.push('street');
  if (!profile.postalCode) missingFields.push('postalCode');
  if (!profile.country) missingFields.push('country');
  if (!profile.accountHolderName) missingFields.push('accountHolderName');
  if (!profile.iban) missingFields.push('iban');
  if (!profile.photoUrl) missingFields.push('photoUrl');
  if (!profile.businessLicenseUrl) missingFields.push('businessLicenseUrl');
  if (!profile.idProofFrontUrl) missingFields.push('idProofFrontUrl');
  if (!profile.idProofBackUrl) missingFields.push('idProofBackUrl');
  if (!profile.addressProofUrl) missingFields.push('addressProofUrl');
  if (!profile.activityDocumentUrl) missingFields.push('activityDocumentUrl');
  if (!profile.ibanProofUrl) missingFields.push('ibanProofUrl');

  if (missingFields.length > 0) {
    throw new BadRequestError(
      `Cannot submit onboarding. Missing required fields: ${missingFields.join(', ')}`,
    );
  }

  return await prisma.fleetManagerProfile.update({
    where: { id: profile.id },
    data: {
      signerType: input.signerType,
      representativeName:
        input.signerType === 'AUTHORIZED_REPRESENTATIVE' ? input.representativeName || null : null,
      representativeId:
        input.signerType === 'AUTHORIZED_REPRESENTATIVE' ? input.representativeId || null : null,
      signatureUrl: input.signatureUrl,
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date(),
      submittedAt: new Date(),
      verificationStatus: 'UNDER_REVIEW',
      rejectionReason: null,
    },
  });
};

export const FleetService = {
  getEditableProfile,
  getOnboardingStatus,
  updateBusinessDetails,
  updateLocationDetails,
  updateBankDetails,
  updateDocuments,
  submitOnboarding,
};
