import { z } from 'zod';

export const createJobSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['transaction', 'bet', 'deposit', 'withdrawal', 'balance', 'custom', 'cryptoDeposit']),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  filters: z.record(z.any()).optional(),
});

export const resolveItemSchema = z.object({
  status: z.enum(['resolved', 'dismissed', 'escalated']),
  notes: z.string().max(500).optional(),
});
