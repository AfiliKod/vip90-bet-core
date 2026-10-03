import { z } from 'zod';
import { SMS_TEMPLATE_TYPES, SMS_TEMPLATE_CATEGORIES } from '../models/SmsTemplate.js';
import { SMS_AUDIENCE_TYPES, SMS_LOG_STATUSES } from '../models/SmsLog.js';
import { SMS_PROVIDERS, SMS_ACCOUNT_TYPES } from '../services/smsSettings.js';
import {
  SMS_SENDER_CAPABILITIES,
  SMS_REGISTRATION_TYPES,
  SMS_APPROVAL_STATUSES,
} from '../models/SmsSender.js';

const content = z.string().trim().min(1).max(1000);
const eventKey = z.string().trim().min(1).max(60).nullable().optional();

/**
 * type='action' (sistem mesajı) bir olaya bağlanmak ZORUNDA — aksi hâlde
 * şablonu tetikleyen hiçbir kod olmaz ve panelde "gönderilemez" diye
 * görünür ama asla çalışmaz. `scheduled` tipinde olay opsiyoneldir.
 */
export const createSmsTemplateSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-zA-Z0-9]{1,59}$/, 'key camelCase olmalı').optional(),
  title: z.string().trim().min(1).max(120),
  type: z.enum(SMS_TEMPLATE_TYPES),
  eventKey,
  category: z.enum(SMS_TEMPLATE_CATEGORIES).optional(),
  content,
  isActive: z.boolean().optional(),
}).superRefine((val, ctx) => {
  if (val.type === 'action' && !val.eventKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventKey'], message: 'Sistem mesajı için olay seçilmeli' });
  }
});

export const updateSmsTemplateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  // Tip ve olay ikisi de verilmedikçe çapraz doğrulama yapılmaz; asıl denetim
  // servis katmanında (güncel kayıtla birlikte) yapılır.
  type: z.enum(SMS_TEMPLATE_TYPES).optional(),
  eventKey,
  category: z.enum(SMS_TEMPLATE_CATEGORIES).optional(),
  content: content.optional(),
  isActive: z.boolean().optional(),
});

export const sendSmsSchema = z.object({
  audienceType: z.enum(SMS_AUDIENCE_TYPES),
  segmentId: z.string().trim().min(1).optional(),
  userIds: z.array(z.string().trim().min(1)).max(500).optional(),
  variables: z.record(z.string()).optional(),
});

export const updateSmsSettingsSchema = z.object({
  provider: z.enum(SMS_PROVIDERS).optional(),
  accountSid: z.string().trim().min(1).max(64).optional(),
  authToken: z.string().trim().min(1).max(128).optional(),
  fromNumber: z.string().trim().min(1).max(32).optional(),
  messagingServiceSid: z.string().trim().min(1).max(64).optional(),
  defaultCountryCode: z.string().trim().regex(/^\d{1,4}$/, 'ülke kodu rakam olmalı (örn. 90)').optional(),
  accountType: z.enum(SMS_ACCOUNT_TYPES).optional(),
  trialSignUpCountry: z.string().trim().regex(/^[A-Za-z]{2}$/, 'ISO-3166 alpha-2 (örn. TR)').optional(),
});

const isoCountry = z.string().trim().regex(/^[A-Za-z]{2}$/, 'ISO-3166 alpha-2 (örn. TR)');
const senderBase = {
  label: z.string().trim().min(1).max(80),
  senderNumber: z.string().trim().max(32).optional(),
  messagingServiceSid: z.string().trim().max(64).optional(),
  senderCountry: isoCountry,
  capability: z.enum(SMS_SENDER_CAPABILITIES),
  registrationType: z.enum(SMS_REGISTRATION_TYPES),
  approvalStatus: z.enum(SMS_APPROVAL_STATUSES),
  registrationId: z.string().trim().max(80).optional(),
  brandName: z.string().trim().max(120).optional(),
  useCase: z.string().trim().max(120).optional(),
  destinationCountries: z.array(isoCountry).max(200).optional(),
  dailyLimit: z.coerce.number().int().min(0).max(1_000_000).optional(),
  // Twilio trial sınırı 5 doğrulanmış numara; şema da bunu sınırlar ki
  // operatör limiti panelde öğrenip sonra hatayla öğrenmesin.
  trialVerifiedNumbers: z.array(z.string().trim().max(32)).max(5).optional(),
  trialExpiresAt: z.string().trim().datetime().or(z.string().trim().max(40)).optional(),
  notes: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
  // Panelin E.164 çevirisi için gereklidir (0/90 gibi ülke kodu beyanı).
  defaultCountryCode: z.string().trim().regex(/^\d{1,4}$/).optional(),
};

export const createSmsSenderSchema = z.object(senderBase);

export const updateSmsSenderSchema = z.object(senderBase).partial();

export const smsLogQuerySchema = z.object({
  status: z.enum(SMS_LOG_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});