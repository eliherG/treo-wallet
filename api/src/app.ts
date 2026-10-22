import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express, type Router } from 'express';
import pino, { type Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import { errorHandler, notFoundHandler } from './http/middlewares/error-handler.js';
import { httpLogger } from './http/middlewares/http-logger.js';
import { requestIdMiddleware } from './http/middlewares/request-id.js';

export interface AppOptions {
  logger?: Logger;
  /** Registrar rutas de dominio; usado en tests T-08 y posteriormente por módulos reales. */
  registerRoutes?: (router: Router) => void;
  webOrigin?: string;
}

function approvedOpenApi(): Record<string, unknown> {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../specs/openapi.json');
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid OpenAPI document: expected a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const logger = options.logger ?? pino({ base: null });
  const webOrigin = options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173';

  app.disable('x-powered-by');
  // Proxy de confianza desactivado hasta configurar explícitamente el despliegue.
  app.set('trust proxy', false);
  app.use(requestIdMiddleware);
  app.use(httpLogger(logger));
  app.use(cors({ origin: webOrigin, credentials: true, exposedHeaders: ['X-Request-ID'] }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  const openapi = approvedOpenApi();
  app.get('/api-docs/openapi.json', (_req, res) => res.json(openapi));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi));

  const apiRouter = express.Router();
  options.registerRoutes?.(apiRouter);
  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
