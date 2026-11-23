import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { FinanceService } from './finance.service';

/** GET /api/v1/finances/ledger */
const getLedger = catchAsync(async (req, res) => {
  const ledger = await FinanceService.getFinancialLedger(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Financial ledger retrieved successfully',
    data: ledger,
  });
});

export const FinanceController = {
  getLedger,
};
