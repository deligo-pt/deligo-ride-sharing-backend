import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhoneE164(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s\-()]/g, '');
  if (!cleaned.startsWith('+')) return null;

  const parsed = parsePhoneNumberFromString(cleaned);
  return parsed && parsed.isValid() ? parsed.number : null;
}
