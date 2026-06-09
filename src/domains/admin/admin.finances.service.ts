import prisma from '../../config/db';
import { GetLedgerQuery } from './admin.finances.validation';

export const getFinancialLedger = async (query: GetLedgerQuery) => {
  const { startDate, endDate } = query;

  const where: any = {
    status: 'COMPLETED',
  };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  // 1. Calculate total revenue using Prisma aggregate
  const aggregation = await prisma.ride.aggregate({
    where,
    _sum: {
      finalFare: true,
    },
    _count: {
      id: true,
    },
  });

  const totalRevenue = aggregation._sum.finalFare ? Number(aggregation._sum.finalFare) : 0;
  const totalCompletedRides = aggregation._count.id;

  // 2. Fetch PricingRules to get the exact admin fee percentages per vehicle type
  // Wait, calculating driver earnings/platform commission perfectly requires iterating
  // through rides or using raw SQL, since adminFee is per ride's vehicle type.
  // For Phase 3, PRD says: "Write a basic loop or query to calculate Platform Commission (e.g., 20% of the total) and the Driver Earnings (80%)."
  // So we'll fetch all rides and loop, or just do a 20/80 split if they want a basic query.
  // Let's do a basic loop to be perfectly accurate based on adminFeePercentage of the ride's vehicleType.

  const rides = await prisma.ride.findMany({
    where,
    select: {
      finalFare: true,
      driverProfile: {
        select: {
          vehicle: {
            select: { vehicleType: true },
          },
        },
      },
    },
  });

  const pricingRules = await prisma.pricingRule.findMany();
  const feeMap = new Map(pricingRules.map(pr => [pr.vehicleType, pr.adminFeePercentage]));

  let platformCommission = 0;
  let driverEarnings = 0;

  for (const ride of rides) {
    const fare = ride.finalFare ? Number(ride.finalFare) : 0;
    const vType = ride.driverProfile?.vehicle?.vehicleType;
    const feePercent = vType ? (feeMap.get(vType) ?? 20.0) : 20.0; // Default 20%
    
    const commission = fare * (feePercent / 100);
    platformCommission += commission;
    driverEarnings += (fare - commission);
  }

  return {
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    platformCommission: parseFloat(platformCommission.toFixed(2)),
    driverEarnings: parseFloat(driverEarnings.toFixed(2)),
    totalCompletedRides,
  };
};
