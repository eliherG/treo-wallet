import { Router } from 'express';
import type { DataSource } from 'typeorm';
import { requireAccess, authenticatedUserId } from '../auth/middlewares/require-access.js';
import type { AccessTokens } from '../auth/jwt.js';
import { MovementsService } from './movements.service.js';

export function createMovementsRouter(db:DataSource,tokens:AccessTokens):Router {
  const router=Router();
  const secret=process.env.MOVEMENTS_CURSOR_SECRET ?? process.env.JWT_ACCESS_SECRET;
  if(!secret || secret.length<32) throw new Error('MOVEMENTS_CURSOR_SECRET or JWT_ACCESS_SECRET (32+ chars) required');
  const service=new MovementsService(db,secret);
  router.get('/movements',requireAccess(db,tokens),async(req,res)=>{
    const page=await service.list(authenticatedUserId(res),req.query);
    res.json(page);
  });
  return router;
}
