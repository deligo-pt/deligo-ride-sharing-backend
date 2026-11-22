import axios from 'axios';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// BulkGate SMS Gateway Utility
//
// Wraps the BulkGate Simple Transactional SMS API:
//   POST https://portal.bulkgate.com/api/1.0/simple/transactional
//
// Authentication: application_id + application_token in the request body.
//
// Docs: https://help.bulkgate.com/docs/en/simple-transactional-sms-api
// Portal: https://portal.bulkgate.com → Administration → Applications
// ─────────────────────────────────────────────────────────────────────────────

const BULKGATE_API_URL =
  'https://portal.bulkgate.com/api/1.0/simple/transactional';

/** Shape of the request body accepted by the BulkGate Simple API */
interface BulkGatePayload {
  application_id: string;
  application_token: string;
  /** Recipient phone number in international format, e.g. "447000000000" */
  number: string;
  /** SMS text content */
  text: string;
  /** Optional ISO-3166 alpha-2 country code hint, e.g. "gb", "us" */
  country?: string;
}

/** Partial shape of a successful BulkGate API response */
interface BulkGateSuccessResponse {
  status: string; // 'accepted' on success
  sms_id?: string;
  part_id?: string;
}

/** Partial shape of a BulkGate API error response */
interface BulkGateErrorResponse {
  status: string; // 'error' on failure
  error?: string;
  message?: string;
}

/**
 * Send a single transactional SMS via the BulkGate Simple API.
 *
 * @param phone   International phone number string (e.g. "+447000000000" or "447000000000").
 *                Leading "+" is stripped automatically.
 * @param message SMS body text (max 160 chars per segment).
 *
 * Behaviour:
 *  - Falls back to `console.log` when BULKGATE_APPLICATION_ID or
 *    BULKGATE_APPLICATION_TOKEN env vars are not set (safe for local dev).
 *  - Logs success/failure without rethrowing so callers never crash due to
 *    a downstream SMS failure.
 */
export async function sendBulkGateSms(
  phone: string,
  message: string,
): Promise<void> {
  const { applicationId, applicationToken } = config.bulkgate;

  // ── Graceful degradation in environments without credentials ───────────────
  if (!applicationId || !applicationToken) {
    console.log(`[SMS FALLBACK – BulkGate] → ${phone} | ${message}`);
    return;
  }

  // Normalise number: strip leading "+" (BulkGate expects digits only)
  const normalisedNumber = phone.replace(/^\+/, '');

  const payload: BulkGatePayload = {
    application_id: applicationId,
    application_token: applicationToken,
    number: normalisedNumber,
    text: message,
  };

  try {
    const response = await axios.post<
      BulkGateSuccessResponse | BulkGateErrorResponse
    >(BULKGATE_API_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      // 10-second timeout so a slow BulkGate response never hangs the process
      timeout: 10_000,
    });

    const data = response.data;

    if (data.status === 'accepted') {
      const successData = data as BulkGateSuccessResponse;
      console.info(
        `[SMS] ✅ Sent via BulkGate | sms_id=${successData.sms_id ?? 'n/a'} | to=${phone}`,
      );
    } else {
      const errorData = data as BulkGateErrorResponse;
      console.error(
        `[SMS] ❌ BulkGate rejected message | status=${data.status} | error=${errorData.error ?? errorData.message ?? 'unknown'} | to=${phone}`,
      );
    }
  } catch (err: unknown) {
    // Network/timeout errors — log and swallow so callers keep running
    if (axios.isAxiosError(err)) {
      console.error(
        `[SMS] ❌ BulkGate HTTP error | status=${err.response?.status ?? 'no-response'} | to=${phone}`,
        err.response?.data,
      );
    } else {
      console.error(`[SMS] ❌ BulkGate unexpected error | to=${phone}:`, err);
    }
  }
}
