// utils-es/rate-limiter.js
const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_TIME_WINDOW = 60 * 60 * 1000;

function parseIntEnv(name, def, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  const parsed = Number.parseInt(String(raw), 10);
  if (Number.isNaN(parsed)) return def;
  return Math.min(Math.max(parsed, min), max);
}

export function createRateLimiter() {
  const store = new Map();
  const MAX_REQUESTS = parseIntEnv('API_RATE_LIMIT', DEFAULT_MAX_REQUESTS, 1, 1000);
  const TIME_WINDOW = parseIntEnv('API_RATE_WINDOW', DEFAULT_TIME_WINDOW, 1000, 24 * 60 * 60 * 1000);
  const ENABLED = process.env.ENABLE_RATE_LIMIT !== 'false';

  return {
    MAX_REQUESTS,
    TIME_WINDOW,
    ENABLED,

    check(ip) {
      if (!ENABLED) return true;

      const now = Date.now();
      const entry = store.get(ip);

      if (!entry || now > entry.resetTime) {
        store.set(ip, { count: 1, resetTime: now + TIME_WINDOW });
        return true;
      }

      if (entry.count >= MAX_REQUESTS) {
        return false;
      }

      entry.count += 1;
      return true;
    },

    getRemainingRequests(ip) {
      if (!ENABLED) return MAX_REQUESTS;

      const now = Date.now();
      const entry = store.get(ip);
      if (!entry || now > entry.resetTime) {
        return MAX_REQUESTS;
      }
      return Math.max(0, MAX_REQUESTS - entry.count);
    },

    getResetTime(ip) {
      const now = Date.now();
      const entry = store.get(ip);
      if (!entry || now > entry.resetTime) {
        return now + TIME_WINDOW;
      }
      return entry.resetTime;
    },

    cleanup(now = Date.now()) {
      for (const [ip, entry] of store.entries()) {
        if (now > entry.resetTime) {
          store.delete(ip);
        }
      }
    },
  };
}
