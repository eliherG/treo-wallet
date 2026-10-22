import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { HttpProblem } from '../http-problem.js';
import { currentRequestId } from './request-id.js';

function exposedProblem(error: unknown): HttpProblem {
  if (error instanceof HttpProblem) return error;
  if (error && typeof error === 'object' && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      return new HttpProblem(400, 'INVALID_JSON', 'JSON inválido', 'El cuerpo JSON no es válido.');
    }
    if (error.type === 'entity.too.large') {
      return new HttpProblem(413, 'PAYLOAD_TOO_LARGE', 'Solicitud demasiado grande',
        'El cuerpo de la solicitud excede el tamaño permitido.');
    }
  }
  return new HttpProblem(500, 'INTERNAL_ERROR', 'Error interno',
    'Ocurrió un error interno. Intenta nuevamente más tarde.');
}

/** Nunca se coloca error.message, stack, SQL ni payloads en la respuesta o el log. */
export function errorHandler(logger: Pick<Logger, 'error'>): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    const problem = exposedProblem(error);
    const requestId = currentRequestId(res);
    if (problem.status >= 500) {
      logger.error({ event: 'http.error', requestId, code: problem.code, status: problem.status },
        'Unexpected HTTP error');
    }
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(problem.status).type('application/problem+json').json({
      type: 'about:blank',
      title: problem.title,
      status: problem.status,
      detail: problem.publicDetail,
      // No reflejar URL ni parámetros arbitrarios que pudieran contener secretos.
      instance: req.baseUrl || '/api/v1',
      requestId,
      code: problem.code,
    });
  };
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpProblem(404, 'NOT_FOUND', 'Recurso no encontrado',
    'El recurso solicitado no existe.'));
};
