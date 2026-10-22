import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type MovementFilters = {
  accountId: string | null;
  type: 'DEBIT' | 'CREDIT' | null;
  from: string | null;
  to: string | null;
  limit: number;
};
export type MovementBoundary = { createdAt: string; id: string };
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A cursor is bound to user and *all* filters, including page size. */
export function filterFingerprint(actor: string, filters: MovementFilters): string {
  return createHash('sha256').update(JSON.stringify({v:1,actor:actor.toLowerCase(),
    accountId:filters.accountId?.toLowerCase() ?? null,type:filters.type,
    from:filters.from,to:filters.to,limit:filters.limit})).digest('hex');
}
function sign(body: string, secret: string): Buffer {
  return createHmac('sha256',secret).update('treo:movement-cursor:v1:').update(body).digest();
}
export function encodeMovementCursor(boundary:MovementBoundary,actor:string,filters:MovementFilters,secret:string):string {
  if(!secret || secret.length<32 || !UUID.test(boundary.id) || !ISO_INSTANT.test(boundary.createdAt))
    throw new Error('Invalid movement cursor parameters');
  const body=Buffer.from(JSON.stringify({v:1,fp:filterFingerprint(actor,filters),
    at:boundary.createdAt,id:boundary.id.toLowerCase()})).toString('base64url');
  return `${body}.${sign(body,secret).toString('base64url')}`;
}
export function decodeMovementCursor(value:string,actor:string,filters:MovementFilters,secret:string):MovementBoundary {
  if(typeof value !== 'string' || value.length>4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) || !secret || secret.length<32)
    throw new RangeError('Invalid cursor');
  const [body,signature] = value.split('.');
  if(!body || !signature) throw new RangeError('Invalid cursor');
  const supplied=Buffer.from(signature,'base64url');
  const expected=sign(body,secret);
  if(supplied.length!==expected.length || !timingSafeEqual(expected,supplied)) throw new RangeError('Cursor tampered');
  let decoded:unknown;
  try { decoded=JSON.parse(Buffer.from(body,'base64url').toString('utf8')); }
  catch { throw new RangeError('Malformed cursor'); }
  if(!decoded || typeof decoded!=='object' || Array.isArray(decoded)) throw new RangeError('Malformed cursor');
  const obj=decoded as Record<string,unknown>;
  if(obj.v!==1 || obj.fp!==filterFingerprint(actor,filters) || typeof obj.at!=='string'
    || !ISO_INSTANT.test(obj.at) || Number.isNaN(Date.parse(obj.at))
    || typeof obj.id!=='string' || !UUID.test(obj.id)) throw new RangeError('Cursor scope mismatch');
  return {createdAt:obj.at,id:obj.id.toLowerCase()};
}
