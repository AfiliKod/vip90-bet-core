/**
 * V1 — Sınırlı demo yönetici kapısı.
 *
 * Demo admin, role=admin olan ama `isDemoAdmin: true` bayrağı taşıyan
 * hesaptır (User şemasına yeni rol değeri EKLENMEDİ — en az değişiklik).
 * Bayraklı hesap panelden inceleyebilir ama yıkıcı işlemleri yapamaz;
 * yıkıcı route'lara tek tek eklenir.
 *
 * SECURITY FIX (H6): Fail-closed — DB error blocks the request instead of
 * bypassing the demo admin check.
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
      // SECURITY FIX (H6): Fail-closed — block request on DB error
      return next(createError(500, 'DEMO_CHECK_FAILED', 'Demo admin doğrulama başarısız'));
    }
  };
}
