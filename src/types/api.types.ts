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
  errorSources: ErrorSource[];
  stack?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface ErrorResponseOptions {
  errorSources?: ErrorSource[];
  stack?: string;
}

export function errorResponse(
  statusCode: number,
  message: string,
  code: string,
  options: ErrorResponseOptions = {},
): ApiErrorResponse {
  const { errorSources, stack } = options;
  return {
    success: false,
    statusCode,
    message,
    code,
    errorSources: errorSources && errorSources.length > 0 ? errorSources : [{ path: '', message }],
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
