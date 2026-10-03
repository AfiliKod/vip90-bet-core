import { z } from 'zod';

export const registerSchema = z.object({
  username:   z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Kullanıcı adı sadece harf, rakam ve _ içerebilir'),
  email:      z.string().email().max(100),
  password:   z.string().min(8).max(128).regex(/[A-Z]/, 'En az 1 büyük harf').regex(/[0-9]/, 'En az 1 rakam'),
  referredBy: z.string().min(3).max(30).optional(),
  // Slikair payment için opsiyonel alanlar (admin tarafından zorunlu kılınabilir)
  phone:        z.string().min(7).max(20).optional().nullable(),
  dateOfBirth:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  // KVKK + Terms consent
  acceptedTerms:  z.literal(true, { errorMap: () => ({ message: 'Kullanım koşullarını kabul etmelisiniz' }) }),
  acceptedKvkk:   z.literal(true, { errorMap: () => ({ message: 'KVKK aydınlatma metnini kabul etmelisiniz' }) }),
  consentVersion: z.string().min(1).max(20).optional(),
  // Turnstile (Phase B8)
  turnstileToken: z.string().optional(),
});

export const loginSchema = z.object({
  username:       z.string().min(1).max(100),
  password:       z.string().min(1).max(200),
  turnstileToken: z.string().optional(),
});

export const emailVerifySchema = z.object({
  token: z.string().min(10).max(200),
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export const passwordResetRequestSchema = z.object({
  email:           z.string().email(),
  turnstileToken:  z.string().optional(),
});

export const passwordResetConfirmSchema = z.object({
  token:       z.string().min(10),
  newPassword: z.string().min(8).max(128).regex(/[A-Z]/).regex(/[0-9]/),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8).max(128).regex(/[A-Z]/).regex(/[0-9]/),
});

export const changeEmailSchema = z.object({
  password: z.string().min(1),
  newEmail: z.string().email(),
});

export const dataExportRequestSchema = z.object({
  password: z.string().min(1),
});

export const accountDeletionRequestSchema = z.object({
  password:   z.string().min(1),
  confirm:    z.literal(true),
});

// P6 — Web3 cüzdan girişi
export const walletNonceSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Geçersiz Ethereum adresi'),
});

// P5 — Sosyal giriş: hesaba bağlama gövdesi (OAuth callback'leri GET
// query-param tabanlı olduğu için ayrı bir "link" şeması yeterli)
export const linkGoogleSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export const linkTelegramSchema = z.object({
  id: z.string().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.string().min(1),
  hash: z.string().min(1),
  state: z.string().min(1),
});

export const walletAuthSchema = z.object({
  address:   z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Geçersiz Ethereum adresi'),
  signature: z.string().min(1),
  message:   z.string().min(1),
  walletType: z.enum(['metamask', 'walletconnect', 'coinbase', 'injected', 'unknown']).optional(),
  chainId:   z.number().int().optional(),
});