import { z } from 'zod';
export const createEventSchema = z.object({
  sport: z.string().min(1), league: z.string().min(1), leagueFlag: z.string().optional(),
  homeTeam: z.object({ name: z.string(), country: z.string() }),
  awayTeam: z.object({ name: z.string(), country: z.string() }),
  startTime: z.string().datetime(),
  markets: z.array(z.object({
    type: z.string(), label: z.string(),
    odds: z.array(z.object({ id: z.string(), label: z.string(), value: z.number() }))
  }))
});
export const settleEventSchema = z.object({
  results: z.record(z.string()),
  score: z.string().optional(),
});

export const createUserSchema = z.object({
  username:   z.string().min(3).max(30),
  email:      z.string().email(),
  password:   z.string().min(8),
  role:       z.enum(['user', 'admin']).default('user'),
  referredBy: z.string().min(3).max(30).optional(),
});

export const updateBalanceSchema = z.object({
  amount: z.number().positive(),
  type:   z.enum(['credit', 'debit']),
  note:   z.string().max(200).optional(),
});
