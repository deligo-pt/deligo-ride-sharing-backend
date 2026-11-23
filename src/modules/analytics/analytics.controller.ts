import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { AnalyticsService } from './analytics.service';
import { ExportReportQuery, GetTrendsQuery } from './analytics.validation';

/** GET /api/v1/admin/analytics/dashboard */
const getDashboard = catchAsync(async (_req, res) => {
  const summary = await AnalyticsService.getDashboardSummary();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Dashboard summary retrieved successfully',
    data: summary,
  });
});

/** GET /api/v1/admin/analytics/trends */
const getTrends = catchAsync(async (req, res) => {
  const trends = await AnalyticsService.getTrends(req.query as unknown as GetTrendsQuery);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Trends retrieved successfully',
    data: trends,
  });
});

/** GET /api/v1/admin/analytics/export — streams a CSV attachment (not a JSON envelope). */
const exportReport = catchAsync(async (req, res) => {
  const reportType = (req.query.reportType as string) || 'REVENUE';

  const csvString = await AnalyticsService.generateCsvReport(
    req.query as unknown as ExportReportQuery,
  );

  // Unescape the raw newlines to actual newlines for proper CSV formatting
  const rawCsv = csvString.replace(/\\n/g, '\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=report-${reportType.toLowerCase()}.csv`,
  );

  res.status(200).send(rawCsv);
});

export const AnalyticsController = {
  getDashboard,
  getTrends,
  exportReport,
};
