import { TMeta } from '../utils/sendResponse';

export interface ErrorSource {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  code: string;
  errorSources?: ErrorSource[];
  details?: unknown;
  stack?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface ErrorResponseOptions {
  errorSources?: ErrorSource[];
  details?: unknown;
  stack?: string;
}

export function errorResponse(
  statusCode: number,
  message: string,
  code: string,
  options: ErrorResponseOptions = {},
): ApiErrorResponse {
  const { errorSources, details, stack } = options;
  return {
    success: false,
    statusCode,
    message,
    code,
    ...(errorSources !== undefined && { errorSources }),
    ...(details !== undefined && { details }),
    ...(stack !== undefined && { stack }),
  };
}

export function buildPaginationMeta(total: number, page: number, limit: number): TMeta {
  return {
    page,
    limit,
    total,
    totalPage: Math.ceil(total / limit),
  };
}
