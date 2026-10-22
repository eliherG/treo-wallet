/** Idempotent non-destructive addition to server.ts; refuses unexpected files. */
import { readFileSync, writeFileSync } from 'node:fs';
const filename = 'api/src/server.ts';
let content = readFileSync(filename, 'utf8');
const anchor = "import { createMovementsRouter } from './modules/movements/movements.routes.js';";
const addedImport = "import { createTransferStatusRouter } from './modules/transfers/transfer-status.routes.js';";
const mountAnchor = '    api.use(createMovementsRouter(db, tokens));';
const addedMount = '    api.use(createTransferStatusRouter(db, tokens));';
if (!content.includes(anchor) || !content.includes(mountAnchor)) {
  throw new Error('T-17: unexpected server.ts layout, no changes made');
}
if (!content.includes(addedImport)) content = content.replace(anchor, `${anchor}\n${addedImport}`);
if (!content.includes(addedMount)) content = content.replace(mountAnchor, `${mountAnchor}\n${addedMount}`);
writeFileSync(filename, content);
console.log('T-17: GET transfer status router mounted');
