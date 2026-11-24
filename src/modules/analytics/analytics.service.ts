import prisma from '../../config/db';
import { GetTrendsQuery, ExportReportQuery } from './analytics.validation';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';

const getDashboardSummary = async () => {
  const rideCounts = await prisma.ride.groupBy({
    by: ['status'],
    _count: { id: true },
    where: {
      status: { in: ['COMPLETED', 'CANCELLED', 'EMERGENCY'] },
    },
  });

  const volumes = {
    COMPLETED: 0,
    CANCELLED: 0,
    EMERGENCY: 0,
  };
  rideCounts.forEach((r) => {
    volumes[r.status as keyof typeof volumes] = r._count.id;
  });

  const financialAgg = await prisma.ride.aggregate({
    where: { status: 'COMPLETED' },
    _sum: { finalFare: true },
    _count: { id: true },
  });

  const totalRevenue = financialAgg._sum.finalFare ? Number(financialAgg._sum.finalFare) : 0;
  const completedRides = financialAgg._count.id;
  const platformCommission = totalRevenue * 0.2;
  const averageRideValue = completedRides > 0 ? totalRevenue / completedRides : 0;

  const totalCustomers = await prisma.user.count({ where: { role: 'CUSTOMER' } });

  const totalActiveDrivers = await prisma.driverProfile.count({
    where: {
      kycStatus: 'APPROVED',
      isAvailable: true,
    },
  });

  return {
    rideVolumes: volumes,
    financials: {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      platformCommission: Number(platformCommission.toFixed(2)),
      averageRideValue: Number(averageRideValue.toFixed(2)),
    },
    ecosystem: {
      totalCustomers,
      totalActiveDrivers,
    },
  };
};

const getTrends = async (query: GetTrendsQuery) => {
  const { interval, startDate, endDate } = query;

  const rides = await prisma.ride.findMany({
    where: {
      status: 'COMPLETED',
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
    select: { createdAt: true, finalFare: true },
  });

  const trendMap = new Map<string, { revenue: number; count: number }>();

  rides.forEach((ride) => {
    let dateKey = '';
    const date = ride.createdAt;

    if (interval === 'DAILY') {
      dateKey = format(startOfDay(date), 'yyyy-MM-dd');
    } else if (interval === 'WEEKLY') {
      dateKey = format(startOfWeek(date), 'yyyy-MM-dd');
    } else if (interval === 'MONTHLY') {
      dateKey = format(startOfMonth(date), 'yyyy-MM');
    }

    const fare = ride.finalFare ? Number(ride.finalFare) : 0;
    const existing = trendMap.get(dateKey) || { revenue: 0, count: 0 };
    existing.revenue += fare;
    existing.count += 1;
    trendMap.set(dateKey, existing);
  });

  const trends = Array.from(trendMap.entries()).map(([period, data]) => ({
    period,
    revenue: Number(data.revenue.toFixed(2)),
    rides: data.count,
  }));

  trends.sort((a, b) => a.period.localeCompare(b.period));

  return trends;
};

const generateCsvReport = async (query: ExportReportQuery): Promise<string> => {
  const { reportType } = query;

  if (reportType === 'REVENUE' || reportType === 'RIDES') {
    const rides = await prisma.ride.findMany({
      where: { status: 'COMPLETED' },
      select: { id: true, createdAt: true, finalFare: true, distanceKm: true, status: true },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Ride ID', 'Date', 'Status', 'Distance (km)', 'Final Fare (USD)'];
    const rows = rides.map((r) => [
      r.id,
      r.createdAt.toISOString(),
      r.status,
      r.distanceKm ? Number(r.distanceKm).toFixed(2) : '0',
      r.finalFare ? Number(r.finalFare).toFixed(2) : '0',
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\\n');
  }

  if (reportType === 'DRIVERS') {
    const drivers = await prisma.driverProfile.findMany({
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Driver ID', 'Name', 'Email', 'KYC Status', 'Total Rides', 'Avg Rating'];
    const rows = drivers.map((d) => [
      d.id,
      `${d.user?.firstName || ''} ${d.user?.lastName || ''}`.trim() || 'Unknown',
      d.user?.email || 'N/A',
      d.kycStatus,
      d.totalRides.toString(),
      d.averageRating.toString(),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\\n');
  }

  return 'No Data\\n';
};

export const AnalyticsService = {
  getDashboardSummary,
  getTrends,
  generateCsvReport,
};
