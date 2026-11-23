import axios from 'axios';
import { config } from '../config';

const BULKGATE_API_URL = 'https://portal.bulkgate.com/api/1.0/simple/transactional';

interface BulkGatePayload {
  application_id: string;
  application_token: string;
  number: string;
  text: string;
  country?: string;
}

interface BulkGateSuccessResponse {
  status: string;
  sms_id?: string;
  part_id?: string;
}

interface BulkGateErrorResponse {
  status: string;
  error?: string;
  message?: string;
}

export async function sendBulkGateSms(phone: string, message: string): Promise<void> {
  const { applicationId, applicationToken } = config.bulkgate;

  if (!applicationId || !applicationToken) {
    console.log(`[SMS FALLBACK – BulkGate] → ${phone} | ${message}`);
    return;
  }

  const normalisedNumber = phone.replace(/^\+/, '');

  const payload: BulkGatePayload = {
    application_id: applicationId,
    application_token: applicationToken,
    number: normalisedNumber,
    text: message,
  };

  try {
    const response = await axios.post<BulkGateSuccessResponse | BulkGateErrorResponse>(
      BULKGATE_API_URL,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10_000,
      },
    );

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
