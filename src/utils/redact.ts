export const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'password',
  'newpassword',
  'oldpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'otp',
  'secret',
  'clientsecret',
  'apikey',
  'authorization',
  'cookie',
  'setcookie',
]);

const SENSITIVE_SUFFIXES = ['password', 'token', 'secret'] as const;

const MAX_DEPTH = 8;

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_\s]/g, '');

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? value.toString() : value;
  }
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(val, depth + 1, seen);
  }
  return out;
}

export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;

  const hashStart = url.indexOf('#', queryStart);
  const query = url.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  const suffix = hashStart === -1 ? '' : url.slice(hashStart);

  const cleaned = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      let key = pair.slice(0, eq);
      try {
        key = decodeURIComponent(key);
      } catch {
        /* keep raw key */
      }
      return isSensitiveKey(key) ? `${pair.slice(0, eq)}=${REDACTED}` : pair;
    })
    .join('&');

  return `${url.slice(0, queryStart)}?${cleaned}${suffix}`;
}
