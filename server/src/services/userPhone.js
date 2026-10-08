import User from '../models/User.js';
import { createError } from '../middleware/error.js';
import { normalizePhone } from './smsGateway.js';

// Kayıt formundaki PhoneInput'un varsayılan ülkesi TR; "+"/"00" önekisiz
// gelen ulusal biçim ("0532 ...") bu kodla E.164'e çevrilir.
const DEFAULT_COUNTRY_CODE = '90';

/**
 * Kullanıcı telefonunu E.164'e normalize eder ve başka bir hesapta
 * kullanılmadığını doğrular. Aynı numara farklı biçimde yazılıp ("+90 532..."
 * vs "0532...") benzersizlik kontrolünü atlatmasın diye karşılaştırma
 * normalize edilmiş değer üzerinden yapılır; DB'deki unique index son güvencedir.
 *
 * @returns {Promise<string|null>} Kaydedilecek E.164 numara ya da null (boş)
 */
export async function resolveUniquePhone(raw, { excludeUserId = null } = {}) {
  if (raw == null || String(raw).trim() === '') return null;
  const phone = normalizePhone(raw, DEFAULT_COUNTRY_CODE);
  if (!phone) throw createError(400, 'INVALID_PHONE', 'Geçersiz telefon numarası');

  const filter = { phone };
  if (excludeUserId) filter._id = { $ne: excludeUserId };
  if (await User.exists(filter)) {
    throw createError(409, 'PHONE_EXISTS', 'Bu telefon numarası zaten kullanımda');
  }
  return phone;
}

/** Eşzamanlı iki kayıtta unique index'e takılan ikinciyi 409'a çevirir. */
export function isDuplicatePhoneError(err) {
  return err?.code === 11000 && Boolean(err?.keyPattern?.phone);
}

export const phoneExistsError = () =>
  createError(409, 'PHONE_EXISTS', 'Bu telefon numarası zaten kullanımda');
