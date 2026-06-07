// @ts-nocheck
// utils-es/rate-limiter.js
import { parseIntEnv } from './env.js';

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_TIME_WINDOW = 60 * 60 * 1000;

export function createRateLimiter() {
  return {
    store: Object.create(null),
    MAX_REQUESTS: parseIntEnv('API_RATE_LIMIT', DEFAULT_MAX_REQUESTS, 1, 1000),
    TIME_WINDOW: parseIntEnv('API_RATE_WINDOW', DEFAULT_TIME_WINDOW, 1000, 24 * 60 * 60 * 1000),
    ENABLED: process.env.ENABLE_RATE_LIMIT !== 'false',

    check(ip) {
      if (!this.ENABLED) return true;

      const now = Date.now();
      const entry = this.store[ip];

      if (!entry || now > entry.resetTime) {
        this.store[ip] = { count: 1, resetTime: now + this.TIME_WINDOW };
        return true;
      }

      if (entry.count >= this.MAX_REQUESTS) {
        return false;
      }

      entry.count += 1;
      return true;
    },

    getRemainingRequests(ip) {
      if (!this.ENABLED) return this.MAX_REQUESTS;

      const now = Date.now();
      const entry = this.store[ip];
      if (!entry || now > entry.resetTime) {
        return this.MAX_REQUESTS;
      }
      return Math.max(0, this.MAX_REQUESTS - entry.count);
    },

    getResetTime(ip) {
      const now = Date.now();
      const entry = this.store[ip];
      if (!entry || now > entry.resetTime) {
        return now + this.TIME_WINDOW;
      }
      return entry.resetTime;
    },

    cleanup(now = Date.now()) {
      Object.keys(this.store).forEach((ip) => {
        if (now > this.store[ip].resetTime) {
          delete this.store[ip];
        }
      });
    },
  };
}
