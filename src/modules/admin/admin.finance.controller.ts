import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { AdminFinanceService } from './admin.finance.service';

/** GET /api/v1/admin/finances/ledger */
const getLedger = catchAsync(async (req, res) => {
  const ledger = await AdminFinanceService.getFinancialLedger(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Financial ledger retrieved successfully',
    data: ledger,
  });
});

export const AdminFinanceController = {
  getLedger,
};
