import { z } from 'zod';

export const gameActivitySchema = z.object({
  gameId: z.string().min(1).max(200),
  kind:   z.enum(['igames', 'inhouse']),
});

export const updatePreferencesSchema = z.object({
  avatarColor: z.string().max(20).optional(),
  favoriteSports: z.array(z.string().max(30)).max(10).optional(),
  accentColor: z.string().max(20).optional(),
  oddsFormat: z.enum(['decimal', 'fractional', 'american']).optional(),
  language: z.string().min(2).max(5).optional(),
  notifyLive: z.boolean().optional(),
  notifyOddsChange: z.boolean().optional(),
  defaultStake: z.number().min(0).optional(),
});

export const updateLimitsSchema = z.object({
  depositDaily: z.number().min(0).optional(),
  depositWeekly: z.number().min(0).optional(),
  depositMonthly: z.number().min(0).optional(),
  sessionTimeoutMin: z.number().min(0).optional(),
  selfExclusionUntil: z.string().datetime().optional().nullable(),
});
