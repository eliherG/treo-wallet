import { z } from 'zod';

// OpenAPI v0.1.0: request runtime validation remains server-side.
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string(),
  client: z.enum(['WEB', 'MOBILE']),
}).strict();

// The OpenAPI contract makes refreshToken optional because WEB uses HttpOnly cookies.
// Client-specific rules are enforced in the route (the token is never logged).
export const refreshRequestSchema = z.object({
  client: z.enum(['WEB', 'MOBILE']),
  refreshToken: z.string().optional(),
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshRequestInput = z.infer<typeof refreshRequestSchema>;
