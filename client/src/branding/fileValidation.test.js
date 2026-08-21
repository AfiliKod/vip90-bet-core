import assert from 'node:assert/strict';
import { validateBrandingFile } from './fileValidation.js';

const imageDef = { id: 'logo', type: 'image', maxBytes: 200_000 };
const fontDef = { id: 'fontFile', type: 'font', maxBytes: 400_000 };

assert.deepEqual(
  validateBrandingFile(null, imageDef),
  { ok: false, error: 'Dosya seçilmedi' },
);

assert.deepEqual(
  validateBrandingFile({ type: 'image/png', size: 1000 }, imageDef),
  { ok: true },
  'küçük geçerli görsel kabul edilir',
);

assert.equal(
  validateBrandingFile({ type: 'application/pdf', size: 1000 }, imageDef).ok,
  false,
  'görsel olmayan mime reddedilir',
);

assert.equal(
  validateBrandingFile({ type: 'image/png', size: 500_000 }, imageDef).ok,
  false,
  'maxBytes aşan görsel reddedilir',
);

assert.deepEqual(
  validateBrandingFile({ type: 'font/woff2', size: 1000, name: 'x.woff2' }, fontDef),
  { ok: true },
  'font mime tipi kabul edilir',
);

assert.deepEqual(
  validateBrandingFile({ type: '', size: 1000, name: 'MyFont.woff2' }, fontDef),
  { ok: true },
  'mime boşsa dosya adı uzantısından font tanınır',
);

assert.equal(
  validateBrandingFile({ type: 'image/png', size: 1000, name: 'logo.png' }, fontDef).ok,
  false,
  'font alanına görsel dosyası reddedilir',
);

console.log('fileValidation.test.js: tüm assertion\'lar geçti');
