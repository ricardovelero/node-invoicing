import type { Request, RequestHandler } from 'express';
import { env } from '../config/env';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimiterOptions = {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
  now?: () => number;
};

const defaultKeyGenerator = (req: Request) =>
  `${req.ip ?? req.socket.remoteAddress ?? 'unknown'}:${req.method}:${req.path}`;

export const createRateLimiter = ({
  windowMs,
  maxRequests,
  keyPrefix = 'rate-limit',
  keyGenerator = defaultKeyGenerator,
  now = () => Date.now(),
}: RateLimiterOptions): RequestHandler => {
  const buckets = new Map<string, RateLimitEntry>();

  return (req, res, next) => {
    const currentTime = now();
    const key = `${keyPrefix}:${keyGenerator(req)}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= currentTime) {
      buckets.set(key, {
        count: 1,
        resetAt: currentTime + windowMs,
      });
      return next();
    }

    existing.count += 1;

    if (existing.count > maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - currentTime) / 1000),
      );

      res.set('Retry-After', String(retryAfterSeconds));
      return res
        .status(429)
        .send('Too many authentication attempts. Please try again later.');
    }

    return next();
  };
};

export const authRateLimiter = createRateLimiter({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  maxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: 'auth',
});
