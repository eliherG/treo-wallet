/** Safe additive mount of T-18 on an existing T-15/T-16 server. */
import {readFileSync,writeFileSync} from 'node:fs';
const path='api/src/server.ts';
let source=readFileSync(path,'utf8');
const anchorImport="import { createTransfersRouter } from './modules/transfers/transfers.routes.js';";
const importLine="import { createMovementsRouter } from './modules/movements/movements.routes.js';";
const anchorMount='    api.use(createTransfersRouter(db, tokens));';
const mountLine='    api.use(createMovementsRouter(db, tokens));';
if(!source.includes(anchorImport)||!source.includes(anchorMount)) throw Error('T18 mount blocked: server.ts unexpected; no files changed');
if(!source.includes(importLine))source=source.replace(anchorImport,`${anchorImport}\n${importLine}`);
if(!source.includes(mountLine))source=source.replace(anchorMount,`${anchorMount}\n${mountLine}`);
writeFileSync(path,source);
console.log('T-18: movements router mounted');
