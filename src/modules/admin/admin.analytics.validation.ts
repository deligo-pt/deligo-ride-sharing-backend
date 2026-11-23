import { z } from 'zod';

const GetTrendsQuerySchema = z.object({
  interval: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  startDate: z.string().datetime({ message: "startDate must be a valid ISO datetime string" }),
  endDate: z.string().datetime({ message: "endDate must be a valid ISO datetime string" }),
});
export type GetTrendsQuery = z.infer<typeof GetTrendsQuerySchema>;

const ExportReportQuerySchema = z.object({
  reportType: z.enum(['REVENUE', 'RIDES', 'DRIVERS']),
});
export type ExportReportQuery = z.infer<typeof ExportReportQuerySchema>;

// ── Grouped validation (consumed by validateRequest in admin.route.ts) ─────────

export const AdminAnalyticsValidation = {
  trends: { query: GetTrendsQuerySchema },
  exportReport: { query: ExportReportQuerySchema },
};
