import prisma from '../../config/db';
import { uploadToCloudinary } from '../../utils/cloudinary';
import { CreateVehicleInput, UpdateVehicleInput, ReviewVehicleInput } from './vehicle.validation';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { NotificationService, logNotificationFailure } from '../notification/notification.service';

// ─── Shared vehicle select shape ───────────────────────────────────────────────
const vehicleSelect = {
  id: true,
  vehicleClass: true,
  vehicleType: true,
  brand: true,
  model: true,
  year: true,
  color: true,
  licensePlate: true,
  capacity: true,
  registrationExpiryDate: true,
  insuranceExpiryDate: true,
  photoUrls: true,
  approvalStatus: true,
  adminNote: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  driverProfile: {
    select: {
      id: true,
      licenseNumber: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
} as const;

// ─── POST /api/v1/vehicles ────────────────────────────────────────────────────
// Driver registers their vehicle. Only one vehicle per driver profile is allowed.

const createVehicle = async (userId: string, payload: CreateVehicleInput) => {
  const driverProfile = await prisma.driverProfile.findUnique({ where: { userId } });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile', {
      message: 'Driver profile not found. You must be a registered driver to add a vehicle.',
    });
  }

  const existingVehicle = await prisma.vehicle.findUnique({
    where: { driverProfileId: driverProfile.id },
  });

  if (existingVehicle) {
    throw new BadRequestError(
      'A vehicle is already registered for this driver profile. Use PATCH to update it.',
    );
  }

  const existingPlate = await prisma.vehicle.findUnique({
    where: { licensePlate: payload.licensePlate },
  });

  if (existingPlate) {
    throw new BadRequestError(
      `License plate "${payload.licensePlate}" is already registered to another vehicle.`,
    );
  }

  return await prisma.vehicle.create({
    data: {
      ...payload,
      registrationExpiryDate: payload.registrationExpiryDate
        ? new Date(payload.registrationExpiryDate)
        : undefined,
      insuranceExpiryDate: payload.insuranceExpiryDate
        ? new Date(payload.insuranceExpiryDate)
        : undefined,
      driverProfileId: driverProfile.id,
    },
    select: vehicleSelect,
  });
};

// ─── GET /api/v1/vehicles/me ──────────────────────────────────────────────────
// Driver fetches their own vehicle.

const getMyVehicle = async (userId: string) => {
  const driverProfile = await prisma.driverProfile.findUnique({ where: { userId } });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile');
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { driverProfileId: driverProfile.id },
    select: vehicleSelect,
  });

  if (!vehicle) {
    throw new NotFoundError('Vehicle', {
      message: 'No vehicle found for this driver. Please register your vehicle first.',
    });
  }

  return vehicle;
};

// ─── GET /api/v1/vehicles (ADMIN) ─────────────────────────────────────────────
// Admin fetches all vehicles with an optional filter by approvalStatus.

const getAllVehicles = async (statusFilter?: string) => {
  return await prisma.vehicle.findMany({
    where: statusFilter
      ? { approvalStatus: statusFilter as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' }
      : undefined,
    select: vehicleSelect,
    orderBy: { createdAt: 'desc' },
  });
};

// ─── PATCH /api/v1/vehicles ───────────────────────────────────────────────────
// Driver updates their vehicle information. Re-triggers approval (status → PENDING_REVIEW).

const updateMyVehicle = async (userId: string, payload: UpdateVehicleInput) => {
  const driverProfile = await prisma.driverProfile.findUnique({ where: { userId } });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile');
  }

  const existingVehicle = await prisma.vehicle.findUnique({
    where: { driverProfileId: driverProfile.id },
  });

  if (!existingVehicle) {
    throw new NotFoundError('Vehicle', {
      message: 'No vehicle found. Please register a vehicle first.',
    });
  }

  // If the driver is changing the license plate, ensure it's not already taken
  if (payload.licensePlate && payload.licensePlate !== existingVehicle.licensePlate) {
    const plateExists = await prisma.vehicle.findUnique({
      where: { licensePlate: payload.licensePlate },
    });
    if (plateExists) {
      throw new BadRequestError(
        `License plate "${payload.licensePlate}" is already registered to another vehicle.`,
      );
    }
  }

  return await prisma.vehicle.update({
    where: { id: existingVehicle.id },
    data: {
      ...payload,
      registrationExpiryDate: payload.registrationExpiryDate
        ? new Date(payload.registrationExpiryDate)
        : undefined,
      insuranceExpiryDate: payload.insuranceExpiryDate
        ? new Date(payload.insuranceExpiryDate)
        : undefined,
      // Changing vehicle info requires re-approval
      approvalStatus: 'PENDING_REVIEW',
      adminNote: null,
      reviewedAt: null,
    },
    select: vehicleSelect,
  });
};

// ─── POST /api/v1/vehicles/photos ─────────────────────────────────────────────
// Driver uploads vehicle photos (up to 5). Appends to existing photoUrls.

const uploadVehiclePhotos = async (userId: string, files: Express.Multer.File[]) => {
  const driverProfile = await prisma.driverProfile.findUnique({ where: { userId } });

  if (!driverProfile) {
    throw new NotFoundError('Driver profile');
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { driverProfileId: driverProfile.id },
  });

  if (!vehicle) {
    throw new NotFoundError('Vehicle', {
      message: 'No vehicle found. Please register a vehicle before uploading photos.',
    });
  }

  const existingPhotoCount = vehicle.photoUrls.length;
  if (existingPhotoCount + files.length > 5) {
    throw new BadRequestError(
      `You can upload a maximum of 5 vehicle photos. You currently have ${existingPhotoCount} and are trying to add ${files.length} more.`,
    );
  }

  // Upload all photos concurrently to Cloudinary
  const uploadedUrls = await Promise.all(
    files.map((file) => uploadToCloudinary(file.buffer, 'vehicle-photos', file.mimetype)),
  );

  const newPhotoUrls = uploadedUrls.map((r) => r.secureUrl);

  return await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: {
      photoUrls: { push: newPhotoUrls },
      // New photos require re-approval
      approvalStatus: 'PENDING_REVIEW',
      adminNote: null,
      reviewedAt: null,
    },
    select: vehicleSelect,
  });
};

// ─── PATCH /api/v1/vehicles/:id/review (ADMIN) ────────────────────────────────
// Admin reviews a vehicle registration (Approve / Reject / Suspend).

const reviewVehicle = async (vehicleId: string, payload: ReviewVehicleInput) => {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      driverProfile: { select: { userId: true } },
    },
  });

  if (!vehicle) {
    throw new NotFoundError('Vehicle');
  }

  if (vehicle.approvalStatus === payload.approvalStatus) {
    throw new BadRequestError(`Vehicle is already ${payload.approvalStatus}.`);
  }

  const updated = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      approvalStatus: payload.approvalStatus,
      adminNote: payload.adminNote ?? null,
      reviewedAt: new Date(),
    },
    select: vehicleSelect,
  });

  const note = payload.adminNote ? ` Note: ${payload.adminNote}` : '';
  const notices: Partial<
    Record<typeof payload.approvalStatus, { title: string; message: string }>
  > = {
    APPROVED: { title: 'Vehicle approved', message: 'Your vehicle was approved for rides.' },
    REJECTED: { title: 'Vehicle rejected', message: `Your vehicle was rejected.${note}` },
    SUSPENDED: { title: 'Vehicle suspended', message: `Your vehicle was suspended.${note}` },
  };
  const notice = notices[payload.approvalStatus];

  if (notice) {
    void NotificationService.dispatch({
      userId: vehicle.driverProfile.userId,
      type: 'SYSTEM',
      ...notice,
      data: {
        vehicleId,
        approvalStatus: payload.approvalStatus,
        adminNote: payload.adminNote ?? null,
      },
    }).catch(logNotificationFailure('vehicle-review'));
  }

  return updated;
};

export const VehicleService = {
  createVehicle,
  getMyVehicle,
  getAllVehicles,
  updateMyVehicle,
  uploadVehiclePhotos,
  reviewVehicle,
};
