import { z } from 'zod';

export const createJurisdictionSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().min(2).max(10),
  allowedGames: z.array(z.string()).optional(),
  restrictedGames: z.array(z.string()).optional(),
  complianceRules: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

export const updateJurisdictionSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  allowedGames: z.array(z.string()).optional(),
  restrictedGames: z.array(z.string()).optional(),
  complianceRules: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
});

export const checkEligibilitySchema = z.object({
  player: z.string().min(1),
  action: z.string().min(1),
  context: z.record(z.any()).optional(),
});
