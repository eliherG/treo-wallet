import { z } from 'zod';
import { isValidClabe } from './clabe.js';

/** OpenAPI CreateBeneficiaryRequest: strict object and server-side checksum. */
export const createBeneficiarySchema = z.object({
  name: z.string().trim().min(1).max(100),
  alias: z.string().trim().min(1).max(80),
  clabe: z.string().regex(/^[0-9]{18}$/).refine(isValidClabe),
}).strict();

export type CreateBeneficiaryInput = z.infer<typeof createBeneficiarySchema>;
