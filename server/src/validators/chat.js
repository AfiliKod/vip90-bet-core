import { z } from 'zod';

export const createRoomSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  isPublic: z.boolean().optional(),
  minLevel: z.number().int().min(0).optional(),
  maxUsers: z.number().int().min(0).optional(),
  slowMode: z.number().int().min(0).max(300).optional(),
  rainSettings: z.object({
    enabled: z.boolean().optional(),
    minAmount: z.number().min(0).optional(),
    maxAmount: z.number().min(0).optional(),
    cooldown: z.number().int().min(0).optional(),
    minUsers: z.number().int().min(1).optional(),
  }).optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(300).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
  minLevel: z.number().int().min(0).optional(),
  maxUsers: z.number().int().min(0).optional(),
  slowMode: z.number().int().min(0).max(300).optional(),
  rainEnabled: z.boolean().optional(),
  rainMinAmount: z.number().min(0).optional(),
  rainMaxAmount: z.number().min(0).optional(),
  rainCooldown: z.number().int().min(0).optional(),
  rainMinUsers: z.number().int().min(1).optional(),
});

export const banUserSchema = z.object({
  userId: z.string().min(1),
});

export const muteUserSchema = z.object({
  userId: z.string().min(1),
  duration: z.number().int().min(1).max(86400), // saniye, en fazla 24 saat
  reason: z.string().max(200).optional(),
});

export const deleteMessageSchema = z.object({
  reason: z.string().max(200).optional(),
});
