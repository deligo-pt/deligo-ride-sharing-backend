import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../types/api.types';
import { assertAdmin } from './admin.utils';
import { getFinancialLedger } from './admin.finances.service';

export const getLedgerHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const ledger = await getFinancialLedger(req.query as never);
    res.status(200).json(successResponse(ledger));
  } catch (err) {
    next(err);
  }
};
