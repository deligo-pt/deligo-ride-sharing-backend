import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { redact, redactUrl } from './redact';

export function shouldPersistError(statusCode: number): boolean {
  return statusCode >= 500;
}

const MAX_PAYLOAD_CHARS = 10_000;
const MAX_STACK_CHARS = 20_000;
const MAX_MESSAGE_CHARS = 2_000;

export interface ErrorLogInput {
  statusCode: number;
  code?: string;
  message: string;
  errorSources?: { path: string; message: string }[];
  stack?: string;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object' && Object.keys(value).length === 0) return undefined;

  const cleaned = redact(value);
  const serialised = JSON.stringify(cleaned);
  if (serialised.length > MAX_PAYLOAD_CHARS) {
    return { _truncated: true, _originalChars: serialised.length };
  }
  return cleaned as Prisma.InputJsonValue;
}

const clip = (text: string | undefined, max: number): string | undefined =>
  text === undefined ? undefined : text.slice(0, max);

export function persistErrorLog(req: Request, input: ErrorLogInput): void {
  try {
    const path = redactUrl(req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';

    void prisma.errorLog
      .create({
        data: {
          statusCode: input.statusCode,
          code: input.code,
          message: clip(input.message, MAX_MESSAGE_CHARS) ?? '',
          path: clip(path, 500) ?? '',
          method: req.method,
          userId: req.user?.id,
          ip: req.ip,
          userAgent: clip(req.get('user-agent'), 500),
          requestBody: toJson(req.body),
          requestQuery: toJson(req.query),
          errorSources: toJson(input.errorSources),
          stack: clip(input.stack, MAX_STACK_CHARS),
        },
      })
      .catch((logErr: unknown) => {
        console.error('[ErrorLog] Failed to persist error log:', (logErr as Error)?.message);
      });
  } catch (logErr) {
    console.error('[ErrorLog] Failed to build error log:', (logErr as Error)?.message);
  }
}
