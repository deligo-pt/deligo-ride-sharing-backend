import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../types/api.types';
import { registerUser, getWallet } from './customers.service';
import { CreateUserSchema } from './customers.validation';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/customers/register  (public — no auth required)
// ─────────────────────────────────────────────────────────────────────────────

export const registerUserHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const dto = CreateUserSchema.parse(req.body);
    const user = await registerUser(dto);
    res.status(201).json(successResponse(user));
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/customers/me/wallet
// Role: CUSTOMER
// ─────────────────────────────────────────────────────────────────────────────

export const getWalletHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const wallet = await getWallet(userId);
    res.status(200).json(successResponse(wallet));
  } catch (err) {
    next(err);
  }
};

