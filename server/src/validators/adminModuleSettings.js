import { z } from 'zod';

export const oddsProviderTokenSchema = z.object({
  token: z.string().min(16),
});
