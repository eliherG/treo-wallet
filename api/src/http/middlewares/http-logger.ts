import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { currentRequestId } from './request-id.js';

/** Lista positiva: ningún objeto req/res, header, query, body ni ruta libre es registrado. */
export function httpLogger(logger: Pick<Logger, 'info'>): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.once('finish', () => {
      logger.info({
        event: 'http.response',
        requestId: currentRequestId(res),
        method: req.method,
        status: res.statusCode,
        durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000),
      }, 'HTTP request completed');
    });
    next();
  };
}
