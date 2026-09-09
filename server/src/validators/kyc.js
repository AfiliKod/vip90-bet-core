import { z } from 'zod';

const DOC_TYPES = ['identity_card', 'passport', 'drivers_license', 'utility_bill', 'bank_statement', 'selfie_with_id'];

export const submitKycDocumentsSchema = z.object({
  documentType: z.enum(DOC_TYPES),
  metadata: z.object({
    country: z.string().optional(),
    documentNumber: z.string().optional(),
  }).optional(),
});

export const adminRejectKycSchema = z.object({
  reason: z.string().min(1, 'Red sebebi gerekli').max(500),
});

export const adminKycSettingsSchema = z.object({
  settings: z.object({
    KYC_ENABLED: z.enum(['true', 'false']).optional(),
    KYC_PROVIDER: z.enum(['manual', 'sumsub']).optional(),
    SUMSUB_APP_TOKEN: z.string().optional(),
    SUMSUB_SECRET_KEY: z.string().optional(),
    SUMSUB_LEVEL_NAME: z.string().optional(),
    SUMSUB_WEBHOOK_SECRET: z.string().optional(),
  }),
});
