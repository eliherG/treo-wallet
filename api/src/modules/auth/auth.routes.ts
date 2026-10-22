import { Router } from 'express';
import { validateBody } from '../../http/middlewares/validate-body.js';
import { AuthService } from './auth.service.js';
import { REFRESH_COOKIE_NAME, REFRESH_TTL_DAYS } from './jwt.js';
import { createAuthRateLimit } from './middlewares/auth-rate-limit.js';
import { loginSchema, registerSchema } from './schemas.js';

export function createAuthRouter(auth: AuthService): Router {
  const router = Router();
  const registrationLimiter = createAuthRateLimit();
  const loginLimiter = createAuthRateLimit();

  router.post('/auth/register', validateBody(registerSchema), registrationLimiter,
    async (req, res) => {
      const result = await auth.register(registerSchema.parse(req.body));
      res.status(201).json(result);
    });

  router.post('/auth/login', validateBody(loginSchema), loginLimiter,
    async (req, res) => {
      const input = loginSchema.parse(req.body);
      const result = await auth.login(input);
      if (input.client === 'WEB') {
        res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/api/v1/auth',
          maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
        });
      }
      res.status(200).json({
        accessToken: result.accessToken,
        accessExpiresInSeconds: result.accessExpiresInSeconds,
        user: result.user,
        ...(input.client === 'MOBILE' ? { refreshToken: result.refreshToken } : {}),
      });
    });

  return router;
}
