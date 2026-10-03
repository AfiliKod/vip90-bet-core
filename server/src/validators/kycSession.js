import { z } from 'zod';

export const initSessionSchema = z.object({
  country: z.string().length(2).optional(),
});
