import type { DataSource, EntityManager } from 'typeorm';
import { z } from 'zod';
import { HttpProblem } from '../../http/http-problem.js';
import { decodeMovementCursor, encodeMovementCursor, type MovementFilters } from './cursor.js';

const UUID = z.string().uuid().transform(x=>x.toLowerCase());
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const parsed=new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(`${value}T`);
});
export const movementsQuerySchema = z.object({
  accountId: UUID.optional(),
  type: z.enum(['DEBIT','CREDIT']).optional(),
  from: DATE.optional(),
  to: DATE.optional(),
  cursor: z.string().min(1).max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export type MovementQuery = z.infer<typeof movementsQuerySchema>;
export type MovementItem = {
  id:string;transferId:string;accountId:string;type:'DEBIT'|'CREDIT';
  signedAmountCents:string;createdAt:string;concept:string;reference:string;
};
export type MovementPage = {items:MovementItem[];nextCursor:string|null};
type DbMovement = {
  id:string;transfer_id:string;account_id:string;type:'DEBIT'|'CREDIT';
  signed_amount_cents:string;created_at:Date;cursor_at:string;concept:string;reference:string;
};

export class MovementsService {
  constructor(private readonly db:DataSource, private readonly cursorSecret:string) {
    if(cursorSecret.length<32) throw new Error('Movements cursor secret must be at least 32 characters');
  }
  async list(actor:string,query:unknown):Promise<MovementPage> {
    return this.listInTransaction(this.db.manager,actor,query);
  }
  async listInTransaction(manager:EntityManager,actor:string,candidate:unknown):Promise<MovementPage> {
    const parsed=movementsQuerySchema.safeParse(candidate);
    if(!parsed.success) throw new HttpProblem(400,'INVALID_MOVEMENT_FILTER','Filtro inválido',
      'Los filtros del historial no cumplen el contrato.');
    const query=parsed.data;
    if(query.from && query.to && query.from>query.to) throw new HttpProblem(400,'INVALID_DATE_RANGE',
      'Fechas inválidas','La fecha inicial no puede superar la final.');
    const actorSchema=UUID.safeParse(actor);
    if(!actorSchema.success) throw new HttpProblem(401,'UNAUTHORIZED','No autorizado','Sesión inválida.');
    const userId=actorSchema.data;
    const filters:MovementFilters={accountId:query.accountId??null,type:query.type??null,
      from:query.from??null,to:query.to??null,limit:query.limit};
    // Do not leak movements of an account belonging to another user.
    if(filters.accountId) {
      const accounts=await manager.query(`SELECT id FROM accounts WHERE id=$1::uuid AND user_id=$2::uuid`,
        [filters.accountId,userId]) as Array<{id:string}>;
      if(accounts.length!==1) throw new HttpProblem(404,'ACCOUNT_NOT_FOUND',
        'Cuenta no encontrada','La cuenta no está disponible.');
    }
    let boundary:null|{createdAt:string;id:string}=null;
    if(query.cursor) {
      try { boundary=decodeMovementCursor(query.cursor,userId,filters,this.cursorSecret); }
      catch { throw new HttpProblem(400,'INVALID_CURSOR','Cursor inválido',
        'El cursor no pertenece a esta consulta o ha sido alterado.'); }
    }
    // All date casts and financial comparisons happen in PostgreSQL. No OFFSET.
    const rows=await manager.query(`
      SELECT le.id,le.transfer_id,le.account_id,le.type,le.signed_amount_cents,
             le.created_at, to_char(le.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,t.concept,t.reference
      FROM ledger_entries le
      JOIN accounts a ON a.id=le.account_id
      JOIN transfers t ON t.id=le.transfer_id
      WHERE a.user_id=$1::uuid
        AND ($2::uuid IS NULL OR le.account_id=$2::uuid)
        AND ($3::text IS NULL OR le.type=$3::text)
        AND ($4::date IS NULL OR le.created_at >= ($4::date::timestamp AT TIME ZONE 'America/Mexico_City'))
        AND ($5::date IS NULL OR le.created_at < (($5::date+1)::timestamp AT TIME ZONE 'America/Mexico_City'))
        AND ($6::timestamptz IS NULL OR (le.created_at,le.id)<($6::timestamptz,$7::uuid))
      ORDER BY le.created_at DESC,le.id DESC
      LIMIT $8::integer
    `,[userId,filters.accountId,filters.type,filters.from,filters.to,
      boundary?.createdAt??null,boundary?.id??null,filters.limit+1]) as DbMovement[];
    const more=rows.length>filters.limit;
    const page=more?rows.slice(0,filters.limit):rows;
    const items:MovementItem[]=page.map(row=>({
      id:row.id,transferId:row.transfer_id,accountId:row.account_id,type:row.type,
      signedAmountCents:row.signed_amount_cents,
      createdAt:row.created_at.toISOString(),concept:row.concept,reference:row.reference,
    }));
    const last=page[page.length-1];
    return {items,nextCursor:more && last ? encodeMovementCursor({createdAt:last.cursor_at,id:last.id},
      userId,filters,this.cursorSecret):null};
  }
}
