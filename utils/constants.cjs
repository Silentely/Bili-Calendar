// utils/constants.cjs
// Centralized constants to avoid magic numbers and improve maintainability

module.exports = {
  // Cache related constants
  CACHE_MAX_AGE_SECONDS: 300, // 5 minutes for API responses
  CACHE_MAX_AGE_ICS_SECONDS: 3600, // 1 hour for ICS files

  // Rate limiting constants
  DEFAULT_RATE_LIMIT: 3, // requests per window
  DEFAULT_RATE_WINDOW_MS: 60 * 60 * 1000, // 1 hour in milliseconds

  // HTTP client constants
  DEFAULT_TIMEOUT_MS: 10000, // 10 seconds
  MAX_RETRY_ATTEMPTS: 2,
  RETRY_BASE_DELAY_MS: 300,

  // Status codes
  HTTP_STATUS_OK: 200,
  HTTP_STATUS_NOT_MODIFIED: 304,
  HTTP_STATUS_BAD_REQUEST: 400,
  HTTP_STATUS_FORBIDDEN: 403,
  HTTP_STATUS_NOT_FOUND: 404,
  HTTP_STATUS_TOO_MANY_REQUESTS: 429,
  HTTP_STATUS_INTERNAL_ERROR: 500,

  // Bilibili API specific
  BILIBILI_API_SUCCESS_CODE: 0,
  BILIBILI_PRIVACY_ERROR_CODE: 53013,
  BILIBILI_API_BASE_URL: 'https://api.bilibili.com',

  // Memory and storage limits
  MAX_CACHE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  MAX_HISTORY_ITEMS: 20,

  // Cleanup intervals
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour

  // Regular expressions
  UID_PATTERN: /^\d+$/,

  // Security headers
  SECURITY_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  },

  // CORS headers
  CORS_HEADERS: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  },
};
