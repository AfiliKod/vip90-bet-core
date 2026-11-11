import { Router } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import KycDocument from '../models/KycDocument.js';
import { kycUploadDir, legacyKycDirs } from '../config/paths.js';
import { requireAuth } from '../middleware/auth.js';
import { adminIpAllowed } from '../middleware/adminIpAllowlist.js';
import { userHasPermission } from '../services/permissions.js';
import { createError } from '../middleware/error.js';

const r = Router();

// Admin yolu: role=admin + izinli IP + admin:kyc:read. Saf kontrol (middleware
// hata durumunda yanıtı kendisi yazdığı için burada promise'e sarılamaz).
async function assertAdminKycAccess(req) {
  if (req.user?.role !== 'admin') {
    throw createError(403, 'FORBIDDEN', 'Bu belgeye erişim yetkiniz yok');
  }
  if (!adminIpAllowed(req)) {
    throw createError(403, 'ADMIN_IP_NOT_ALLOWED', 'Bu IP adresinden yönetim paneline erişilemez');
  }
  if (!(await userHasPermission(req.user.id, 'admin:kyc:read'))) {
    throw createError(403, 'FORBIDDEN', 'Bu belgeye erişim yetkiniz yok');
  }
}

r.get('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) {
      throw createError(400, 'INVALID_DOCUMENT_ID', 'Geçersiz belge kimliği');
    }
    const doc = await KycDocument.findById(req.params.id).lean();

    // Sahip değilse önce yetki: yetkisiz çağıran, belge var/yok ayrımını göremez.
    const isOwner = !!doc && String(doc.userId) === String(req.user.id);
    if (!isOwner) await assertAdminKycAccess(req);
    if (!doc) throw createError(404, 'NOT_FOUND', 'Belge bulunamadı');

    const key = basename(doc.storageKey || doc.fileUrl || '');
    if (!key || key.startsWith('.')) throw createError(404, 'NOT_FOUND', 'Belge dosyası yok');
    // Önce KYC_UPLOAD_DIR; taşıma betiği çalışana kadar eski konumlarda salt okunur arama.
    let filePath = null;
    for (const dir of [kycUploadDir(), ...legacyKycDirs()]) {
      const root = resolve(dir);
      const candidate = resolve(join(root, key));
      if (candidate.startsWith(root + sep) && existsSync(candidate)) { filePath = candidate; break; }
    }
    if (!filePath) throw createError(404, 'NOT_FOUND', 'Belge dosyası bulunamadı');
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    const stream = createReadStream(filePath);
    stream.on('error', next);
    stream.pipe(res);
  } catch (e) { next(e); }
});

export default r;
