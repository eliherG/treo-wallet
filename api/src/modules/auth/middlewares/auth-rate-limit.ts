import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpProblem } from '../../../http/http-problem.js';

interface Bucket { count: number; expires: number }

/** Local MVP limiter. In multi-instance production this state must be shared (e.g. Redis). */
export function createAuthRateLimit(maxAttempts = 5, windowMs = 15 * 60 * 1000): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (req, _res, next) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const fingerprint = createHash('sha256').update(email).digest('hex');
    // trust proxy=false: ignore untrusted X-Forwarded-For headers.
    const key = `${req.ip ?? req.socket.remoteAddress ?? 'unknown'}:${fingerprint}`;
    const now = Date.now();
    const record = buckets.get(key);
    if (record && record.expires > now && record.count >= maxAttempts) {
      next(new HttpProblem(429, 'RATE_LIMITED', 'Demasiadas solicitudes',
        'Intenta de nuevo más tarde.'));
      return;
    }
    // Bound memory use in long-running local development processes.
    if (buckets.size > 10_000) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.expires <= now) buckets.delete(bucketKey);
      }
      if (buckets.size > 10_000) buckets.delete(buckets.keys().next().value!);
    }
    buckets.set(key, { count: record && record.expires > now ? record.count + 1 : 1,
      expires: record && record.expires > now ? record.expires : now + windowMs });
    next();
  };
}
