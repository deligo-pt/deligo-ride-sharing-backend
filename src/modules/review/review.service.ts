import prisma from '../../config/db';
import type { CreateReviewDto } from './review.validation';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';

const createReview = async (
  authorUserId: string,
  role: string,
  dto: CreateReviewDto,
): Promise<ReturnType<typeof prisma.review.findUnique>> => {
  const { rideId, rating, comment } = dto;

  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: {
      id: true,
      status: true,
      customerId: true,
      driverProfileId: true,
      customerProfile: { select: { userId: true } },
      driverProfile: { select: { userId: true, id: true } },
    },
  });

  if (!ride) throw new NotFoundError('Ride');
  if (ride.status !== 'COMPLETED')
    throw new BadRequestError('You can only review a COMPLETED ride.');

  let revieweeUserId: string;

  if (role === 'CUSTOMER') {
    if (ride.customerProfile?.userId !== authorUserId) {
      throw new ForbiddenError('You were not a participant in this ride.');
    }
    if (!ride.driverProfile) throw new BadRequestError('No driver was assigned to this ride.');
    revieweeUserId = ride.driverProfile.userId;
  } else if (role === 'DRIVER') {
    if (ride.driverProfile?.userId !== authorUserId) {
      throw new ForbiddenError('You were not a participant in this ride.');
    }
    revieweeUserId = ride.customerProfile.userId;
  } else {
    throw new ForbiddenError('Only CUSTOMER and DRIVER roles can submit reviews.');
  }

  const existing = await prisma.review.findUnique({
    where: { rideId_authorId: { rideId, authorId: authorUserId } },
  });
  if (existing) throw new BadRequestError('You have already submitted a review for this ride.');

  const review = await prisma.review.create({
    data: {
      rideId,
      authorId: authorUserId,
      targetId: revieweeUserId,
      rating,
      comment: comment ?? null,
    },
  });

  const stats = await prisma.review.aggregate({
    where: { targetId: revieweeUserId },
    _avg: { rating: true },
    _count: { id: true },
  });

  const newAvg = stats._avg.rating ?? rating;
  const newTotal = stats._count.id;

  if (role === 'CUSTOMER') {
    await prisma.driverProfile.update({
      where: { userId: revieweeUserId },
      data: { averageRating: newAvg, totalReviews: newTotal },
    });
  } else {
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
