import { Router } from 'express';
import { z } from 'zod';
import type { DataSource } from 'typeorm';
import { HttpProblem } from '../../http/http-problem.js';
import { currentRequestId } from '../../http/middlewares/request-id.js';
import { validateBody } from '../../http/middlewares/validate-body.js';
import { requireAccess, authenticatedUserId } from '../auth/middlewares/require-access.js';
import type { AccessTokens } from '../auth/jwt.js';
import { AtomicTransferService } from './atomic-transfer.service.js';
import { createTransferSchema } from './schemas.js';

/** Mounted under /api/v1. Authenticated JSON endpoint, no client-supplied owner. */
export function createTransfersRouter(db: DataSource, tokens: AccessTokens): Router {
  const router = Router();
  const service = new AtomicTransferService(db);
  router.post('/transfers', requireAccess(db, tokens), validateBody(createTransferSchema),
    async (req, res) => {
      const idempotencyKey = req.get('Idempotency-Key');
      if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !idempotencyKey.trim()) {
        throw new HttpProblem(400, 'INVALID_IDEMPOTENCY_KEY', 'Llave inválida',
          'Idempotency-Key debe contener entre 8 y 128 caracteres.');
      }
      const result = await service.submit({
        authenticatedUserId: authenticatedUserId(res),
        idempotencyKey,
        payload: req.body,
        requestId: currentRequestId(res),
      });
      if (result.outcome === 'ERROR') throw result.problem;
      res.status(result.outcome === 'PENDING_CONFIRMATION' ? 202 : 201).json({ transfer: result.transfer });
    });
  router.post('/transfers/:transferId/confirm', requireAccess(db,tokens),
    validateBody(z.object({otp:z.string().regex(/^[0-9]{6}$/)}).strict()),async(req,res)=>{
      const transferId=z.string().uuid().safeParse(req.params.transferId);
      if(!transferId.success) throw new HttpProblem(400,'INVALID_TRANSFER_ID',
        'Identificador inválido','La transferencia indicada no es válida.');
      const result=await service.confirm({authenticatedUserId:authenticatedUserId(res),
        transferId:transferId.data,otp:req.body.otp as string,
        requestId:currentRequestId(res)});
      if(result.outcome==='ERROR') throw result.problem;
      res.status(result.outcome==='PENDING_CONFIRMATION' ? 202 : 200).json({transfer:result.transfer});
    });
  return router;
}
