import { z } from 'zod';

const GetLedgerQuerySchema = z.object({
  startDate: z
    .string()
    .datetime({ message: 'startDate must be a valid ISO datetime string' })
    .optional(),
  endDate: z
    .string()
    .datetime({ message: 'endDate must be a valid ISO datetime string' })
    .optional(),
});
export type GetLedgerQuery = z.infer<typeof GetLedgerQuerySchema>;

export const FinanceValidation = {
  ledger: { query: GetLedgerQuerySchema },
};
