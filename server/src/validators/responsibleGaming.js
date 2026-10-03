import { z } from 'zod';

export const setLimitSchema = z.object({
  amount: z.number().min(0),
  limitType: z.enum(['daily', 'weekly', 'monthly']).optional(),
});

export const setSessionLimitSchema = z.object({
  minutes: z.number().int().min(0),
});

export const activateCoolOffSchema = z.object({
  duration: z.number().int().min(1),
  reason: z.string().max(200).optional(),
});

export const activateSelfExclusionSchema = z.object({
  until: z.string().datetime(),
  reason: z.string().max(200).optional(),
});

export const restrictAccountSchema = z.object({
  reason: z.string().min(1).max(500),
});
