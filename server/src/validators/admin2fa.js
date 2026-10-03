import { z } from 'zod';

export const setup2faSchema = z.object({
  password: z.string().min(1),
});

export const verify2faSchema = z.object({
  token: z.union([z.string().length(6), z.string().length(8)]),
});

export const disable2faSchema = z.object({
  password: z.string().min(1),
  token: z.string().length(6),
});
