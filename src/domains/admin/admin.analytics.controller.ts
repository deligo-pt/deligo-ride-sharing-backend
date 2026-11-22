import { Request, Response, NextFunction } from 'express';
import { sendResponse } from '../../utils/sendResponse';
import { assertAdmin } from './admin.utils';
import { getDashboardSummary, getTrends, generateCsvReport } from './admin.analytics.service';

export const getDashboardHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const summary = await getDashboardSummary();
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Dashboard summary retrieved successfully',
      data: summary,
    });
  } catch (err) {
    next(err);
  }
};

export const getTrendsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const trends = await getTrends(req.query as never);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Trends retrieved successfully',
      data: trends,
    });
  } catch (err) {
    next(err);
  }
};

export const exportReportHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const reportType = (req.query.reportType as string) || 'REVENUE';

    const csvString = await generateCsvReport(req.query as never);

    // Unescape the raw newlines to actual newlines for proper CSV formatting
    const rawCsv = csvString.replace(/\\n/g, '\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=report-${reportType.toLowerCase()}.csv`,
    );

    res.status(200).send(rawCsv);
  } catch (err) {
    next(err);
  }
};
