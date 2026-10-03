import { z } from 'zod';

export const createSegmentSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  rules: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

export const updateSegmentSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
  rules: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

export const computeSegmentSchema = z.object({
  limit: z.number().int().min(1).max(10000).optional(),
});
