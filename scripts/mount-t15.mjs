/** Safe, idempotent mount of T-15 router onto existing T-12+ server.ts. */
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'api/src/server.ts';
let source = readFileSync(path, 'utf8');
const importLine = "import { createTransfersRouter } from './modules/transfers/transfers.routes.js';";
const anchorImport = "import { createBeneficiariesRouter } from './modules/beneficiaries/beneficiaries.routes.js';";
const mountLine = '    api.use(createTransfersRouter(db, tokens));';
const anchorMount = '    api.use(createBeneficiariesRouter(db, tokens));';
if (!source.includes(anchorImport) || !source.includes(anchorMount)) {
  throw new Error('T15 mount blocked: server.ts does not match expected T-12 app wiring; no changes written.');
}
if (!source.includes(importLine)) source = source.replace(anchorImport, `${anchorImport}\n${importLine}`);
if (!source.includes(mountLine)) source = source.replace(anchorMount, `${anchorMount}\n${mountLine}`);
writeFileSync(path, source);
console.log('T-15: transfer router mounted; no other server.ts lines changed.');
