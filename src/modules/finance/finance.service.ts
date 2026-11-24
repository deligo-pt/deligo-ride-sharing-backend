import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { GetLedgerQuery } from './finance.validation';

const getFinancialLedger = async (query: GetLedgerQuery) => {
  const { startDate, endDate } = query;

  const where: Prisma.RideWhereInput = {
    status: 'COMPLETED',
    ...((startDate || endDate) && {
      createdAt: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      },
    }),
  };

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
  const feeMap = new Map(pricingRules.map((pr) => [pr.vehicleType, pr.adminFeePercentage]));

  let platformCommission = 0;
  let driverEarnings = 0;

  for (const ride of rides) {
    const fare = ride.finalFare ? Number(ride.finalFare) : 0;
    const vType = ride.driverProfile?.vehicle?.vehicleType;
    const feePercent = vType ? (feeMap.get(vType) ?? 20.0) : 20.0; // Default 20%

    const commission = fare * (feePercent / 100);
    platformCommission += commission;
    driverEarnings += fare - commission;
  }

  return {
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    platformCommission: parseFloat(platformCommission.toFixed(2)),
    driverEarnings: parseFloat(driverEarnings.toFixed(2)),
    totalCompletedRides,
  };
};

export const FinanceService = {
  getFinancialLedger,
};
