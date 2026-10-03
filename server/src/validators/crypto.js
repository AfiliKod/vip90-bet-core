import { z } from 'zod';

export const withdrawRequestSchema = z.object({
  address: z.string().min(10).max(100),
  usdtAmount: z.number().positive(),
  confirmForfeit: z.boolean().optional().default(false),
});
