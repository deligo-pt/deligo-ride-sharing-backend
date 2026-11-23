import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const PORTUGUESE_PHONE_MESSAGE =
  'Contact number must be a valid Portuguese (+351) phone number';

export function normalizePortuguesePhone(raw: string): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), 'PT');
  return parsed?.isValid() && parsed.country === 'PT' ? parsed.number : null;
}
