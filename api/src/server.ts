import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pino from 'pino';
import { createApp } from './app.js';
import { createDataSource } from './database/data-source.js';
import { AuthService } from './modules/auth/auth.service.js';
import { createAccountsRouter } from './modules/accounts/accounts.routes.js';
import { createBeneficiariesRouter } from './modules/beneficiaries/beneficiaries.routes.js';
import { createTransfersRouter } from './modules/transfers/transfers.routes.js';
import { createMovementsRouter } from './modules/movements/movements.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { AccessTokens } from './modules/auth/jwt.js';
import { RefreshSessionService } from './modules/auth/refresh-session.service.js';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un puerto TCP válido');
  }
  const host = process.env.API_HOST ?? '127.0.0.1';
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('Missing environment variable: JWT_ACCESS_SECRET');
  const tokens = new AccessTokens(secret);
  const db = createDataSource('app');
  await db.initialize();
  const auth = new AuthService(db, tokens);
  const logger = pino({ base: null });
  const sessions = new RefreshSessionService(db, tokens, (event) => {
    logger.info(event, 'Authentication session event');
  });
  const router = createAuthRouter(auth, sessions);
  const app = createApp({ logger, registerRoutes: (api) => {
    api.use(router);
    api.use(createAccountsRouter(db, tokens));
    api.use(createBeneficiariesRouter(db, tokens));
    api.use(createTransfersRouter(db, tokens));
    api.use(createMovementsRouter(db, tokens));
  } });
  const server = app.listen(port, host, () => {
    console.log(JSON.stringify({ event: 'http.listening', host, port }));
  });
  const shutdown = async () => {
    await new Promise<void>((done, reject) => server.close((err) => err ? reject(err) : done()));
    await db.destroy();
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void shutdown().then(() => { process.exitCode = 0; })
      .catch(() => { process.exitCode = 1; }); });
  }
}

main().catch(() => {
  // Do not print connection errors: they may embed credentials or connection strings.
  console.error(JSON.stringify({ event: 'api.startup_failed' }));
  process.exitCode = 1;
});
