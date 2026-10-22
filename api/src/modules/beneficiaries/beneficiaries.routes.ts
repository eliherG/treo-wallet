import { Router } from 'express';
import type { DataSource } from 'typeorm';
import { validateBody } from '../../http/middlewares/validate-body.js';
import { authenticatedUserId, requireAccess } from '../auth/middlewares/require-access.js';
import type { AccessTokens } from '../auth/jwt.js';
import { BeneficiariesService } from './beneficiaries.service.js';
import { createBeneficiarySchema } from './schemas.js';

/** Mount at /api/v1. Never accept the owner ID from body, path or query. */
export function createBeneficiariesRouter(db: DataSource, tokens: AccessTokens): Router {
  const router = Router();
  const service = new BeneficiariesService(db);
  const authenticated = requireAccess(db, tokens);

  router.get('/beneficiaries', authenticated, async (_req, res) => {
    res.status(200).json(await service.listOwn(authenticatedUserId(res)));
  });

  router.post('/beneficiaries', authenticated, validateBody(createBeneficiarySchema), async (req, res) => {
    const input = createBeneficiarySchema.parse(req.body);
    res.status(201).json(await service.create(authenticatedUserId(res), input));
  });

  return router;
}
