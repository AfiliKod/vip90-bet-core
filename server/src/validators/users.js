import { z } from 'zod';

export const gameActivitySchema = z.object({
  gameId: z.string().min(1).max(200),
  kind:   z.enum(['palace', 'inhouse']),
});
