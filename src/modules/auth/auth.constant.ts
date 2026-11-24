export const DEFAULT_LANGUAGE = 'EN' as const;
export const DUMMY_HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK8.';
export const EXTERNAL_API_TIMEOUT_MS = 5000;
export const MAX_OTP_ATTEMPTS = 5;
export const MAX_OTP_RESENDS = 3;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const INVITE_TOKEN_TTL_SECONDS = 86400;

export const DEFAULT_SESSION_DAYS = 1;
export const REMEMBER_ME_SESSION_DAYS = 30;
export const ACCESS_TOKEN_TTL_SECONDS = 900;

export const REFRESH_COOKIE_NAME = 'refreshToken';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const MOBILE_PLATFORMS = new Set(['mobile', 'android', 'ios']);

export const NATIVE_APP_USER_AGENT = /\b(okhttp|dart|cfnetwork|expo|reactnative)\b/i;
