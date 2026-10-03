import { z } from 'zod';

export const spinSchema = z.object({
  bet: z.number().positive(),
  gameId: z.string().min(1).max(200).optional(),
  gameTitle: z.string().max(200).optional(),
  provider: z.string().max(100).optional(),
});
