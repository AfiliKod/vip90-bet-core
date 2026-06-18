import { z } from 'zod';

export const registerSchema = z.object({
  username:   z.string().min(3).max(30),
  email:      z.string().email(),
  password:   z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  referredBy: z.string().min(3).max(30).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
