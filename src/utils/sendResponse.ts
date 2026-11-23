import { Response } from 'express';

export interface TMeta {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
}

export interface TResponse<T> {
  statusCode: number;
  success: boolean;
  message?: string;
  meta?: TMeta;
  data?: T | null;
}

export const sendResponse = <T>(res: Response, payload: TResponse<T>): void => {
  const responseBody: Record<string, unknown> = {
    success: payload.success,
    statusCode: payload.statusCode,
    message: payload.message || 'Operation successful',
  };

  if (payload.meta !== undefined) {
    responseBody.meta = payload.meta;
  }

  if (payload.data !== undefined) {
    responseBody.data = payload.data;
  }

  res.status(payload.statusCode).json(responseBody);
};
