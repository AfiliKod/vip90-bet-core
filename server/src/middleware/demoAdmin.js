/**
 * V1 — Sınırlı demo yönetici kapısı.
 *
 * Demo admin, role=admin olan ama `isDemoAdmin: true` bayrağı taşıyan
 * hesaptır (User şemasına yeni rol değeri EKLENMEDİ — en az değişiklik).
 * Bayraklı hesap panelden inceleyebilir ama yıkıcı işlemleri yapamaz;
 * yıkıcı route'lara tek tek eklenir.
 *
 * Sorgu patlarsa geçer: yıkıcı işlem zaten DB ister; DB kapalıyken demo
 * admin'in engellenmesi ayrı bir anlam taşımaz (fail-open, bilinçli).
 */
import { createError } from './error.js';

export function createDemoAdminBlock({ getUserById }) {
  return async function blockDemoAdmin(req, res, next) {
    try {
      const user = await getUserById(req.user?.id);
      if (user?.isDemoAdmin) {
        return next(createError(403, 'DEMO_ADMIN_READONLY',
          'Demo yönetici hesabı salt-okunurdur; yıkıcı işlem yapamaz.'));
      }
      next();
    } catch {
      next();
    }
  };
}
