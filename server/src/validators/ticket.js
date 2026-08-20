import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
});

export const replySchema = z.object({
  message: z.string().min(1).max(4000),
});

export const setStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});
