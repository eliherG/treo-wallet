import { Router } from 'express';
import type { DataSource } from 'typeorm';
import { authenticatedUserId, requireAccess } from '../auth/middlewares/require-access.js';
import type { AccessTokens } from '../auth/jwt.js';
import { AccountsService } from './accounts.service.js';

/** Mount under /api/v1; no account/user identifier is accepted from the client. */
export function createAccountsRouter(db: DataSource, tokens: AccessTokens): Router {
  const router = Router();
  const service = new AccountsService(db);

  router.get('/accounts', requireAccess(db, tokens), async (_req, res) => {
    const userId = authenticatedUserId(res);
    res.status(200).json(await service.listOwnAccounts(userId));
  });

  return router;
}
