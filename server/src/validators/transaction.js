import { z } from 'zod';

// Phase B16 — TR IBAN validation (mod-97 checksum)
function isValidIBAN(iban) {
  if (!iban || typeof iban !== 'string') return false;
  const cleaned = iban.replace(/\s+/g, '').toUpperCase();
  // TR IBAN: TR + 24 digit = 26 karakter
  if (!/^TR\d{24}$/.test(cleaned)) return false;
  // IBAN mod-97 checksum: move first 4 chars to end, convert letters to numbers, mod 97
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  let numeric = '';
  for (const ch of rearranged) {
    if (/[A-Z]/.test(ch)) {
      numeric += (ch.charCodeAt(0) - 55).toString();
    } else {
      numeric += ch;
    }
  }
  // BigInt mod 97
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
  }
  return remainder === 1;
}

export const depositSchema = z.object({
  amount: z.number().min(10).max(50000),
  // Banka deposit'te IBAN kullanıcıya gönderilen, alıcı IBAN opsiyonel
});

export const withdrawSchema = z.object({
  amount: z.number().min(20).max(50000),
  iban: z.string()
    .transform(s => s.replace(/\s+/g, '').toUpperCase())
    .refine(isValidIBAN, { message: 'Geçersiz IBAN (TR + 24 hane, mod-97 checksum)' }),
  fullName: z.string().min(3).max(100),
  confirmForfeit: z.boolean().optional().default(false),
});