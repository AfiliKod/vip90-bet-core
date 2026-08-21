/**
 * K3 — İlk çalıştırma tohumlaması çekirdeği.
 *
 * Demo/başlangıç verisi: varsayılan site ayarları. Güvenlik gereği
 * varsayılan admin parolasıyla otomatik kullanıcı AÇILMAZ — admin yalnızca
 * arayanın açıkça sağladığı kimlik bilgileriyle oluşturulur (K2 sihirbazının
 * yaptığı gibi); zayıf parola reddedilir.
 */
import { randomBytes } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function seedFirstRun({ settingModel, userModel, admin }) {
  const seeded = [];
  const skipped = [];

  // 1. Varsayılan site ayarları — mevcutsa dokunma (idempotent)
  for (const [key, value] of [
    ['site.name', 'VIP90.bet'],
    ['site.currency', 'TRY'],
  ]) {
    const existing = await settingModel.findOne({ key });
    if (existing) {
      skipped.push(key);
      continue;
    }
    await settingModel.updateOne({ key }, { $set: { value } }, { upsert: true });
    seeded.push(key);
  }

  // 2. Admin — yalnızca açıkça istenirse
  if (admin) {
    const errors = [];
    if (String(admin.username ?? '').trim().length < 3) errors.push('username');
    if (!EMAIL_RE.test(String(admin.email ?? ''))) errors.push('email');
    if (String(admin.password ?? '').length < 8) errors.push('password');
    if (errors.length) {
      const err = new Error(`[VALIDATION] Geçersiz alanlar: ${errors.join(', ')}`);
      err.code = 'VALIDATION';
      err.fields = errors;
      throw err;
    }

    const existingAdmin = await userModel.findOne({ role: 'admin' });
    if (existingAdmin) {
      skipped.push('admin');
    } else {
      // Gerçek User modelinde pre-save hook parolayı bcrypt'ler
      await userModel.create({
        username: String(admin.username).trim(),
        email: String(admin.email).trim().toLowerCase(),
        password: admin.password,
        role: 'admin',
        isActive: true,
      });
      seeded.push('admin');
    }
  }

  return { seeded, skipped };
}

/** CLI çıktısında ilk giriş için rastgele parola üreticisi (yalnız gösterimlik). */
export function generateOneTimePassword() {
  return randomBytes(12).toString('base64url');
}
