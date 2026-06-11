import prisma from '../../config/db';
import { uploadToCloudinary } from '../../utils/cloudinary';
import type { UpdateProfileInput, SavedLocationInput } from './customers.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Customers Service — PRD 2.1
//
// Handles: profile retrieval, profile edits, avatar upload, and saved
// location CRUD.  All DB mutations go through the extended Prisma client
// (soft-delete extension active).
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/v1/customers/me ──────────────────────────────────────────────────

/**
 * Fetch the authenticated customer's core User record plus their
 * CustomerProfile stats and all active (non-deleted) SavedLocations.
 */
export async function getMyProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      profilePicture: true,
      fcmToken: true,
      customerProfile: {
        select: {
          id: true,
          totalRides: true,
          totalReviews: true,
          averageRating: true,
          homeAddress: true,
          workAddress: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      // The soft-delete extension automatically injects { isDeleted: false }
      savedLocations: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          address: true,
          lat: true,
          lng: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  return user;
}

// ── PATCH /api/v1/customers/me ────────────────────────────────────────────────

/**
 * Update firstName and/or lastName on the User record.
 */
export async function updateMyProfile(userId: string, data: UpdateProfileInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.firstName !== undefined && { firstName: data.firstName }),
      ...(data.lastName !== undefined && { lastName: data.lastName }),
    },
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      profilePicture: true,
      role: true,
      status: true,
    },
  });
}

// ── POST /api/v1/customers/me/avatar ─────────────────────────────────────────

/**
 * Upload a profile picture to Cloudinary and persist the returned URL
 * in the User.profilePicture field.
 */
export async function uploadAvatar(
  userId: string,
  file: Express.Multer.File,
): Promise<{ profilePicture: string }> {
  const result = await uploadToCloudinary(file.buffer, 'avatars', file.mimetype);

  await prisma.user.update({
    where: { id: userId },
    data: { profilePicture: result.secureUrl },
  });

  return { profilePicture: result.secureUrl };
}

// ── POST /api/v1/customers/locations ─────────────────────────────────────────

/**
 * Create a new SavedLocation for the authenticated user.
 */
export async function createSavedLocation(userId: string, data: SavedLocationInput) {
  return prisma.savedLocation.create({
    data: {
      userId,
      name: data.name,
      address: data.address,
      lat: data.lat,
      lng: data.lng,
    },
    select: {
      id: true,
      name: true,
      address: true,
      lat: true,
      lng: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// ── DELETE /api/v1/customers/locations/:id ────────────────────────────────────

/**
 * Soft-delete a SavedLocation.
 *
 * The Prisma soft-delete extension converts prisma.savedLocation.delete()
 * into an UPDATE { isDeleted: true, deletedAt: now() } automatically.
 *
 * Ownership is verified before deletion.
 */
export async function deleteSavedLocation(userId: string, locationId: string): Promise<void> {
  const location = await prisma.savedLocation.findUnique({
    where: { id: locationId },
    select: { id: true, userId: true },
  });

  if (!location) {
    throw new Error('LOCATION_NOT_FOUND');
  }

  if (location.userId !== userId) {
    throw new Error('LOCATION_FORBIDDEN');
  }

  // The soft-delete extension intercepts this and performs an UPDATE instead
  await prisma.savedLocation.delete({ where: { id: locationId } });
}
