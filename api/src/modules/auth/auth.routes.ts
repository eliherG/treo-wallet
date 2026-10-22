import { Router, type Request, type Response } from 'express';
import { HttpProblem } from '../../http/http-problem.js';
import { currentRequestId } from '../../http/middlewares/request-id.js';
import { validateBody } from '../../http/middlewares/validate-body.js';
import { AuthService } from './auth.service.js';
import { REFRESH_COOKIE_NAME, REFRESH_TTL_DAYS } from './jwt.js';
import { createAuthRateLimit } from './middlewares/auth-rate-limit.js';
import type { RefreshSessionService } from './refresh-session.service.js';
import { loginSchema, refreshRequestSchema, registerSchema,
  type RefreshRequestInput } from './schemas.js';

interface RouterOptions { webOrigin?: string }

function cookieSettings() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/v1/auth',
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...cookieSettings(), maxAge: REFRESH_TTL_DAYS * 86_400_000,
  });
}

function cookieToken(req: Request): string | null {
  // Reject duplicate cookie names instead of choosing an attacker-controlled value.
  const matches = (req.get('Cookie') ?? '').split(';').map((piece) => piece.trim())
    .filter((piece) => piece.indexOf('=') > 0
      && piece.slice(0, piece.indexOf('=')) === REFRESH_COOKIE_NAME);
  if (matches.length !== 1) return null;
  const value = matches[0]!.slice(REFRESH_COOKIE_NAME.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

function requestRefresh(req: Request, input: RefreshRequestInput,
  expectedWebOrigin: string): string | null {
  if (input.client === 'WEB') {
    // Do not accept body tokens for WEB. Require a real browser Origin for cookie operations.
    if (input.refreshToken !== undefined) {
      throw new HttpProblem(400, 'INVALID_REQUEST', 'Solicitud inválida',
        'La solicitud de sesión no tiene un formato válido.');
    }
    if (req.get('Origin') !== expectedWebOrigin) {
      throw new HttpProblem(403, 'ORIGIN_FORBIDDEN', 'Origen no permitido',
        'No se permite utilizar la sesión desde este origen.');
    }
    return cookieToken(req);
  }
  if (input.refreshToken === undefined) {
    throw new HttpProblem(400, 'INVALID_REQUEST', 'Solicitud inválida',
      'La solicitud de sesión no tiene un formato válido.');
  }
  return input.refreshToken;
}

export function createAuthRouter(
  auth: AuthService, sessions?: RefreshSessionService, options: RouterOptions = {},
): Router {
  const router = Router();
  const registrationLimiter = createAuthRateLimit();
  const loginLimiter = createAuthRateLimit();
  const webOrigin = options.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173';

  router.post('/auth/register', validateBody(registerSchema), registrationLimiter,
    async (req, res) => {
      const result = await auth.register(registerSchema.parse(req.body));
      res.status(201).json(result);
    });

  router.post('/auth/login', validateBody(loginSchema), loginLimiter,
    async (req, res) => {
      const input = loginSchema.parse(req.body);
      const result = await auth.login(input);
      if (input.client === 'WEB') setRefreshCookie(res, result.refreshToken);
      res.status(200).json({
        accessToken: result.accessToken,
        accessExpiresInSeconds: result.accessExpiresInSeconds,
        user: result.user,
        ...(input.client === 'MOBILE' ? { refreshToken: result.refreshToken } : {}),
      });
    });

  if (sessions) {
    router.post('/auth/refresh', validateBody(refreshRequestSchema), async (req, res) => {
      const input = refreshRequestSchema.parse(req.body);
      const opaque = requestRefresh(req, input, webOrigin);
      if (!opaque) {
        throw new HttpProblem(401, 'INVALID_SESSION', 'Sesión inválida',
          'La sesión no es válida o ha expirado. Inicia sesión nuevamente.');
      }
      const rotated = await sessions.refresh(opaque, currentRequestId(res));
      if (input.client === 'WEB') setRefreshCookie(res, rotated.refreshToken);
      res.status(200).json({
        accessToken: rotated.accessToken,
        accessExpiresInSeconds: rotated.accessExpiresInSeconds,
        user: rotated.user,
        ...(input.client === 'MOBILE' ? { refreshToken: rotated.refreshToken } : {}),
      });
    });

    router.post('/auth/logout', validateBody(refreshRequestSchema), async (req, res) => {
      const input = refreshRequestSchema.parse(req.body);
      const opaque = requestRefresh(req, input, webOrigin);
      await sessions.logout(opaque, currentRequestId(res));
      if (input.client === 'WEB') {
        res.clearCookie(REFRESH_COOKIE_NAME, cookieSettings());
      }
      res.status(200).json({ success: true });
    });
  }

  return router;
}
