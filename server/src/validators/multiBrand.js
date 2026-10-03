import { z } from 'zod';

export const createBrandSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
  domains: z.array(z.string().max(200)).max(10).optional(),
  themeOverrides: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const updateBrandSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  domains: z.array(z.string().max(200)).max(10).optional(),
  themeOverrides: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const addDomainSchema = z.object({
  domain: z.string().min(1).max(200),
});
