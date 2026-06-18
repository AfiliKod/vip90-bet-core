import { z } from 'zod';
export const depositSchema = z.object({ amount: z.number().min(10).max(50000) });
export const withdrawSchema = z.object({ amount: z.number().min(20).max(50000) });
