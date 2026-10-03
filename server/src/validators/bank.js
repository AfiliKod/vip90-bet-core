import { z } from 'zod';

export const adminRejectSchema = z.object({
  note: z.string().max(500).optional(),
});
