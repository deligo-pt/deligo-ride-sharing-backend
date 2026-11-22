import { Request, Response, NextFunction } from 'express';
import { sendResponse } from '../../utils/sendResponse';
import { assertAdmin } from './admin.util';
import { getFinancialLedger } from './admin.finance.service';

export const getLedgerHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const ledger = await getFinancialLedger(req.query);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Financial ledger retrieved successfully',
      data: ledger,
    });
  } catch (err) {
    next(err);
  }
};
