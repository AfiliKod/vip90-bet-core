import { z } from 'zod';
export const placeBetSchema = z.object({
  selections: z.array(z.object({
    eventId: z.string().min(1),
    marketType: z.string().min(1),
    oddId: z.string().min(1),
    oddLabel: z.string().min(1),
    oddValue: z.number().min(1.01),
    eventLabel: z.string().min(1),
  })).min(1).max(10),
  type: z.enum(['single','combo']),
  stake: z.number().min(1).max(50000),
});
