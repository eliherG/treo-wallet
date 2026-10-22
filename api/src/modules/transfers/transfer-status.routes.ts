import { Router } from 'express';
import type { DataSource } from 'typeorm';
import { authenticatedUserId, requireAccess } from '../auth/middlewares/require-access.js';
import type { AccessTokens } from '../auth/jwt.js';
import { TransferStatusService } from './transfer-status.service.js';

/** GET /api/v1/transfers/:transferId, as defined by the approved OpenAPI. */
export function createTransferStatusRouter(db: DataSource, tokens: AccessTokens): Router {
  const router = Router();
  const service = new TransferStatusService(db);
  router.get('/transfers/:transferId', requireAccess(db, tokens), async (req, res) => {
    const transfer = await service.get(authenticatedUserId(res), String(req.params.transferId));
    res.status(200).json({ transfer });
  });
  return router;
}
