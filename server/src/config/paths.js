import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

export const SERVER_ROOT = fileURLToPath(new URL('../..', import.meta.url));
// Çağrı anında process.env okunur (taşıma betiği .env'i import'tan sonra yükler).
export function kycUploadDir() {
  return process.env.KYC_UPLOAD_DIR || join(SERVER_ROOT, 'storage', 'kyc');
}
// Geriye dönük uyumluluk: import anında çözülür; yeni kod kycUploadDir() kullanmalı.
export const KYC_UPLOAD_DIR = kycUploadDir();

// V3 öncesi KYC yükleme konumları (salt okunur geri dönüş + taşıma betiği kaynağı).
// Eski upload.js cwd-göreli yazıyordu; bu yüzden ikisi de aranır.
export function legacyKycDirs() {
  return [...new Set([join(SERVER_ROOT, 'uploads', 'kyc'), resolve('uploads/kyc')])];
}
