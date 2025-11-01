// utils-es/rate-limiter.js
export function createRateLimiter() {
  const requests = new Map();
  const MAX_REQUESTS = parseInt(process.env.API_RATE_LIMIT || '3');
  const TIME_WINDOW = parseInt(process.env.API_RATE_WINDOW || '3600000'); // 1 hour in ms
  const isEnabled = process.env.ENABLE_RATE_LIMIT !== 'false';

  return {
    MAX_REQUESTS,
    TIME_WINDOW,

    check(ip) {
      if (!isEnabled) return true;

      const now = Date.now();
      const ipRequests = requests.get(ip) || [];
      
      // Remove old requests outside the time window
      const validRequests = ipRequests.filter(timestamp => now - timestamp < TIME_WINDOW);
      
      if (validRequests.length >= MAX_REQUESTS) {
        return false;
      }
      
      validRequests.push(now);
      requests.set(ip, validRequests);
      return true;
    },

    getRemainingRequests(ip) {
      if (!isEnabled) return MAX_REQUESTS;

      const now = Date.now();
      const ipRequests = requests.get(ip) || [];
      const validRequests = ipRequests.filter(timestamp => now - timestamp < TIME_WINDOW);
      return Math.max(0, MAX_REQUESTS - validRequests.length);
    },

    getResetTime(ip) {
      if (!isEnabled) return Date.now() + TIME_WINDOW;

      const ipRequests = requests.get(ip) || [];
      if (ipRequests.length === 0) {
        return Date.now() + TIME_WINDOW;
      }

      // The reset time is the oldest request time plus the time window
      const oldestRequest = Math.min(...ipRequests);
      return oldestRequest + TIME_WINDOW;
    },

    cleanup() {
      const now = Date.now();
      for (const [ip, timestamps] of requests.entries()) {
        const validTimestamps = timestamps.filter(timestamp => now - timestamp < TIME_WINDOW);
        if (validTimestamps.length === 0) {
          requests.delete(ip);
        } else {
          requests.set(ip, validTimestamps);
        }
      }
    }
  };
}