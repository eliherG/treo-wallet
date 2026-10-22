import type { RequestHandler, Response } from 'express';
import type { DataSource } from 'typeorm';
import { HttpProblem } from '../../../http/http-problem.js';
import { UserEntity } from '../entities/user.entity.js';
import { AccessTokens } from '../jwt.js';

export function requireAccess(db: DataSource, tokens: AccessTokens): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('Authorization') ?? '';
    const match = /^Bearer ([^\s]+)$/.exec(header);
    const userId = match ? await tokens.verify(match[1]!) : null;
    if (!userId || !await db.getRepository(UserEntity).existsBy({ id: userId })) {
      next(new HttpProblem(401, 'UNAUTHORIZED', 'No autorizado',
        'Se requiere una sesión válida.'));
      return;
    }
    res.locals.authUserId = userId;
    next();
  };
}

/** Never read user ownership from client-provided identifiers. */
export function authenticatedUserId(response: Response): string {
  const id: unknown = response.locals.authUserId;
  if (typeof id !== 'string') throw new Error('Authentication middleware not installed');
  return id;
}
