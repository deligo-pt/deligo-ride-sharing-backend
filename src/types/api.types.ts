import { TMeta } from '../utils/sendResponse';

// ─────────────────────────────────────────────────────────────────────────────
// Unified API error shape. Shares `{ success, statusCode, message }` with the
// success envelope produced by `sendResponse`.
//
//   {
//     success: false,
//     statusCode: 422,
//     message: 'Validation failed',
//     code: 'VALIDATION_ERROR',                        // machine-readable code
//     errorSources: [{ path: 'email', message: '…' }],  // field-level problems
//     details: { … },                                   // extra structured info
//     stack: '…'                                        // development only
//   }
// ─────────────────────────────────────────────────────────────────────────────

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
