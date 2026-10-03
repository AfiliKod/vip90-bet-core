import { z } from 'zod';

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'in', 'nin', 'contains', 'between']),
  value: z.union([z.number(), z.string(), z.array(z.union([z.number(), z.string()]))]),
});

export const evaluateSchema = z.object({
  event: z.string().min(1).max(100),
  context: z.record(z.unknown()).optional(),
});

export const overrideSchema = z.object({
  status: z.enum(['CLEAR', 'REVIEW', 'RESTRICTED', 'BLOCKED']),
  reason: z.string().min(3).max(500),
});

export const resolveFindingSchema = z.object({
  resolution: z.string().min(1).max(500),
});

export const dismissFindingSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const reviewFindingSchema = z.object({
  note: z.string().min(1).max(500),
});

export const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.enum(['account', 'authentication', 'deposit', 'withdrawal', 'financial', 'kyc', 'custom']),
  conditions: z.array(conditionSchema).min(1),
  conditionLogic: z.enum(['and', 'or']).optional().default('and'),
  action: z.enum(['ALLOW', 'REVIEW', 'RESTRICT', 'BLOCK']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  reasonCode: z.string().min(1).max(100),
  brandScope: z.array(z.string()).optional().default([]),
  jurisdictionScope: z.array(z.string()).optional().default([]),
  priority: z.number().int().min(0).max(1000).optional().default(50),
});

export const updateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  category: z.enum(['account', 'authentication', 'deposit', 'withdrawal', 'financial', 'kyc', 'custom']).optional(),
  conditions: z.array(conditionSchema).min(1).optional(),
  conditionLogic: z.enum(['and', 'or']).optional(),
  action: z.enum(['ALLOW', 'REVIEW', 'RESTRICT', 'BLOCK']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  reasonCode: z.string().min(1).max(100).optional(),
  brandScope: z.array(z.string()).optional(),
  jurisdictionScope: z.array(z.string()).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

export const toggleRuleSchema = z.object({
  enabled: z.boolean(),
});
