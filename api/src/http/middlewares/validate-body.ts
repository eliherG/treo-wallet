import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { HttpProblem } from '../http-problem.js';

/** La validación de runtime es independiente de los tipos OpenAPI generados. */
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new HttpProblem(400, 'INVALID_REQUEST', 'Solicitud inválida',
        'El cuerpo de la solicitud no cumple con el esquema esperado.'));
      return;
    }
    req.body = result.data;
    next();
  };
}
