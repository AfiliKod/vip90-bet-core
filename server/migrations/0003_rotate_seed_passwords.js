/**
 * 0003 — Demo veri (isSeed) hesaplarının parolalarını döndürür (2026-10-03).
 *
 * Eski üretici tüm seed kullanıcılara kaynakta açık duran tek bir sabit
 * parola veriyordu. Yeni kod bu hesapları login/refresh/requireAuth'ta zaten
 * reddediyor; bu migration ek olarak mevcut hash'leri hiç bilinmeyen rastgele
 * bir parolanın hash'iyle değiştirir ve açık oturumları (tokenVersion) düşürür.
 * İdempotent: tekrar koşması zararsızdır.
 */
import mongoose from 'mongoose';
import { makeUnusablePasswordHash } from '../src/services/demoData/userSeed.js';

export default {
  version: '0.3.1',
  description: 'Demo veri hesaplarının parolasını rastgeleleştirir, oturumlarını düşürür',
  async up() {
    const users = mongoose.connection.db.collection('users');
    const count = await users.countDocuments({ isSeed: true });
    if (count === 0) return;
    const password = await makeUnusablePasswordHash();
    const r = await users.updateMany({ isSeed: true }, { $set: { password }, $inc: { tokenVersion: 1 } });
    console.log(`[migration 0003] ${r.modifiedCount} demo hesabının parolası döndürüldü`);
  },
};
