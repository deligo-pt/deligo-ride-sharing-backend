import prisma from '../../config/db';
import type { CreateReviewDto } from './review.validation';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Reviews Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit a review for a completed ride.
 *
 * Business rules:
 *  1. Ride must be COMPLETED.
 *  2. The caller must have been a participant (customer OR driver).
 *  3. Each user may only review once per ride (@@unique[rideId, authorId]).
 *  4. After creating the review, the reviewee's profile stats are recalculated
 *     via a Prisma aggregate and updated atomically.
 */
const createReview = async (
  authorUserId: string,
  role: string,
  dto: CreateReviewDto,
): Promise<ReturnType<typeof prisma.review.findUnique>> => {
  const { rideId, rating, comment } = dto;

  // ── 1. Fetch ride with both participant IDs ─────────────────────────────────
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      status: true,
      customerId: true, // CustomerProfile.id
      driverProfileId: true, // DriverProfile.id
      customerProfile: { select: { userId: true } },
      driverProfile: { select: { userId: true, id: true } },
    },
  });

  if (!ride) throw new NotFoundError('Ride');
  if (ride.status !== 'COMPLETED')
    throw new BadRequestError('You can only review a COMPLETED ride.');

  // ── 2. Determine author and reviewee based on caller's role ─────────────────
  let revieweeUserId: string;

  if (role === 'CUSTOMER') {
    // Customer reviews the Driver
    if (ride.customerProfile?.userId !== authorUserId) {
      throw new ForbiddenError('You were not a participant in this ride.');
    }
    if (!ride.driverProfile) throw new BadRequestError('No driver was assigned to this ride.');
    revieweeUserId = ride.driverProfile.userId;
  } else if (role === 'DRIVER') {
    // Driver reviews the Customer
    if (ride.driverProfile?.userId !== authorUserId) {
      throw new ForbiddenError('You were not a participant in this ride.');
    }
    revieweeUserId = ride.customerProfile.userId;
  } else {
    throw new ForbiddenError('Only CUSTOMER and DRIVER roles can submit reviews.');
  }

  // ── 3. Guard: already reviewed? (DB also enforces @@unique[rideId, authorId]) ─
  const existing = await prisma.review.findUnique({
    where: { rideId_authorId: { rideId, authorId: authorUserId } },
  });
  if (existing) throw new BadRequestError('You have already submitted a review for this ride.');

  // ── 4. Create the review ───────────────────────────────────────────────────
  const review = await prisma.review.create({
    data: {
      rideId,
      authorId: authorUserId,
      targetId: revieweeUserId,
      rating,
      comment: comment ?? null,
    },
  });

  // ── 5. Recalculate reviewee's aggregate stats ──────────────────────────────
  const stats = await prisma.review.aggregate({
    where: { targetId: revieweeUserId },
    _avg: { rating: true },
    _count: { id: true },
  });

  const newAvg = stats._avg.rating ?? rating;
  const newTotal = stats._count.id;

  if (role === 'CUSTOMER') {
    // Customer reviewed a Driver → update DriverProfile
    await prisma.driverProfile.update({
      where: { userId: revieweeUserId },
      data: { averageRating: newAvg, totalReviews: newTotal },
    });
  } else {
    // Driver reviewed a Customer → update CustomerProfile
    await prisma.customerProfile.update({
      where: { userId: revieweeUserId },
      data: { averageRating: newAvg, totalReviews: newTotal },
    });
  }

  return prisma.review.findUnique({
    where: { id: review.id },
    include: {
      author: { select: { id: true, firstName: true, lastName: true } },
      target: { select: { id: true, firstName: true, lastName: true } },
    },
  });
};

/**
 * Fetch all reviews written ABOUT the logged-in user (reviewee), newest first.
 * Includes the reviewer's first name for display.
 */
const getMyReviews = async (userId: string) => {
  return prisma.review.findMany({
    where: { targetId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: { id: true, firstName: true, lastName: true, role: true },
      },
      ride: {
        select: {
          id: true,
          pickupAddress: true,
          dropoffAddress: true,
          completedAt: true,
        },
      },
    },
  });
};

export const ReviewService = {
  createReview,
  getMyReviews,
};
