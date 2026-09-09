import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const KYC_ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf',
]);

const KYC_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, path.resolve('uploads/kyc'));
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  },
});

function kycFileFilter(_req, file, cb) {
  if (KYC_ALLOWED.has(file.mimetype)) cb(null, true);
  else cb(new Error('Desteklenmeyen dosya türü. Yalnızca JPEG, PNG, WebP, HEIC ve PDF yüklenebilir.'));
}

export const uploadKycDocs = multer({
  storage,
  limits: { fileSize: KYC_MAX_SIZE, files: 6 },
  fileFilter: kycFileFilter,
});
