import { z } from 'zod';

export const createAgentSchema = z.object({
  userId: z.string().min(1),
  commissionRate: z.number().min(0).max(50).optional(),
  notes: z.string().max(500).optional(),
});

export const assignPlayerSchema = z.object({
  playerId: z.string().min(1),
});

export const transferFundsSchema = z.object({
  playerId: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().max(500).optional(),
});

export const updateAgentSchema = z.object({
  commissionRate: z.number().min(0).max(50).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});
