import { z } from 'zod';
import { MAIL_EVENTS } from '../services/mailTemplates.js';

const eventKeys = Object.keys(MAIL_EVENTS);

export const audienceSchema = z.object({
  type: z.enum(['all', 'segments', 'users', 'inactive']),
  segmentIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).max(50).optional(),
  userIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).max(500).optional(),
  inactiveDays: z.number().int().min(1).max(720).optional(),
}).strict();

export const scheduleSchema = z.object({
  enabled: z.boolean(),
  intervalHours: z.number().int().min(1).max(24 * 365),
}).strict();

const contentFields = {
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(300),
  preheader: z.string().max(300).optional(),
  body: z.string().min(1).max(20000),
  ctaLabel: z.string().max(80).optional(),
  ctaUrl: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  audience: audienceSchema.optional(),
  schedule: scheduleSchema.optional(),
};

export const createMailTemplateSchema = z.object({
  event: z.enum(eventKeys),
  ...contentFields,
}).strict();

// Olay değiştirilemez: koddaki tetikleyici ile şablon arasındaki bağ sabittir.
export const updateMailTemplateSchema = z.object(contentFields).partial().strict();

export const sendMailTemplateSchema = z.object({
  audience: audienceSchema.optional(),
}).strict();

export const previewMailSchema = z.object({
  event: z.enum(eventKeys).optional(),
  subject: z.string().min(1).max(300),
  preheader: z.string().max(300).optional(),
  body: z.string().min(1).max(20000),
  ctaLabel: z.string().max(80).optional(),
  ctaUrl: z.string().max(500).optional(),
  vars: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
}).strict();
