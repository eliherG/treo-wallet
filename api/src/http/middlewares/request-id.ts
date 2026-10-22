import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Nunca se confía en un identificador de solicitud arbitrario del cliente. */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const candidate = req.get('X-Request-ID');
  const requestId = candidate && UUID_PATTERN.test(candidate) ? candidate : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

export function currentRequestId(res: { locals: Record<string, unknown> }): string {
  const candidate = res.locals.requestId;
  return typeof candidate === 'string' ? candidate : randomUUID();
}
