/**
 * E-posta sağlayıcı ön ayarları (`emailProviderLogic.js`) — node:test.
 * Panel iki yerde görünür (Modules kartı + İletişim → Provider); sağlayıcı
 * çıkarımı ve preset eşlemesi kaydırma olmadan burada doğrulanır.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  EMAIL_PROVIDERS,
  EMAIL_PROVIDER_PRESETS,
  inferEmailProvider,
  applyProviderPreset,
} from './emailProviderLogic.js';

describe('inferEmailProvider', () => {
  test('kayıtlı provider alanı geçerlidir ve host\'u ezer', () => {
    assert.strictEqual(inferEmailProvider('smtp.mailgun.org', 'postmark'), 'postmark');
    assert.strictEqual(inferEmailProvider('anything', 'custom'), 'custom');
    // Geçersiz kayıt (elle yazılmış) host\'tan yeniden çıkarılır
    assert.strictEqual(inferEmailProvider('smtp.mailgun.org', 'bogus'), 'mailgun');
  });

  test('üretim host\'u mailgun olarak tanınır (panel ilk açılışta doğru)', () => {
    assert.strictEqual(inferEmailProvider('smtp.mailgun.org'), 'mailgun');
    assert.strictEqual(inferEmailProvider('SMTP.MAILGUN.ORG'), 'mailgun');
    assert.strictEqual(inferEmailProvider('eu.mailgun.org'), 'mailgun');
    assert.strictEqual(inferEmailProvider('email-smtp.us-east-1.amazonaws.com'), 'ses');
    assert.strictEqual(inferEmailProvider('smtp.postmarkapp.com'), 'postmark');
  });

  test('bilinmeyen/boş host → custom', () => {
    assert.strictEqual(inferEmailProvider('smtp.example.com'), 'custom');
    assert.strictEqual(inferEmailProvider(''), 'custom');
    assert.strictEqual(inferEmailProvider(undefined, undefined), 'custom');
  });

  test('mailtrap: hosttan tanınır; host yoksa token kaydı mailtrap seçilir', () => {
    assert.strictEqual(inferEmailProvider('live.smtp.mailtrap.io'), 'mailtrap');
    // API kurulumunda host alanı BOŞ kalır — token tanımlıysa panel boşuna
    // "Özel SMTP" gösterip SMTP bağlantı alanları istemesin.
    assert.strictEqual(inferEmailProvider('', undefined, { tokenConfigured: true }), 'mailtrap');
    assert.strictEqual(inferEmailProvider(undefined, undefined, { tokenConfigured: false }), 'custom');
    // Kayıtlı provider her zaman kazanır
    assert.strictEqual(inferEmailProvider('smtp.mailgun.org', 'mailtrap', { tokenConfigured: false }), 'mailtrap');
  });
});

describe('applyProviderPreset', () => {
  test('hazırlı sağlayıcı host/port/secure + provider alanını forma yazar', () => {
    const form = applyProviderPreset('mailgun', { from: 'a@b.c' });
    assert.deepStrictEqual(form, {
      from: 'a@b.c',
      provider: 'mailgun',
      host: 'smtp.mailgun.org',
      port: '587',
      secure: false,
    });
    assert.strictEqual(applyProviderPreset('ses').host, EMAIL_PROVIDER_PRESETS.ses.host);
    assert.strictEqual(applyProviderPreset('postmark').port, '587');
  });

  test('custom mevcut bağlantı alanlarına DOKUNMAZ, yalnız provider seçimi yazılır', () => {
    const form = applyProviderPreset('custom', {
      host: 'smtp.mailgun.org', port: '465', secure: true, from: 'a@b.c',
    });
    assert.deepStrictEqual(form, {
      host: 'smtp.mailgun.org', port: '465', secure: true, from: 'a@b.c', provider: 'custom',
    });
    // Bilinmeyen değer → formsuz (state bozulmaz)
    assert.deepStrictEqual(applyProviderPreset('nope', { x: 1 }), { x: 1 });
  });

  test('mevcut formu kopyalayarak değiştirir (immer yok, referans ezmez)', () => {
    const original = { from: 'a@b.c' };
    const next = applyProviderPreset('postmark', original);
    assert.notStrictEqual(next, original);
    assert.deepStrictEqual(original, { from: 'a@b.c' });
  });

  test('her sağlayıcının bir preset\'i vardır; host-only SMTP sağlayıcıları için', () => {
    // Host'suz sağlayıcılar: custom (elle doldurulur) ve mailtrap (API ile gönderir).
    const HOSTLESS = ['custom', 'mailtrap'];
    for (const p of EMAIL_PROVIDERS) {
      assert.ok(p in EMAIL_PROVIDER_PRESETS, `preset eksik: ${p}`);
      if (HOSTLESS.includes(p)) assert.deepStrictEqual(EMAIL_PROVIDER_PRESETS[p], {}, `host beklenmiyordu: ${p}`);
      else assert.ok(EMAIL_PROVIDER_PRESETS[p].host, `host eksik: ${p}`);
    }
    assert.deepStrictEqual(Object.keys(EMAIL_PROVIDER_PRESETS).sort(), [...EMAIL_PROVIDERS].sort());
  });

  test('mailtrap preset\'i formu bozmaz: bağlantı alanları olduğu gibi kalır', () => {
    const form = applyProviderPreset('mailtrap', { host: 'smtp.mailgun.org', port: '587', from: 'a@b.c' });
    assert.deepStrictEqual(form, { host: 'smtp.mailgun.org', port: '587', from: 'a@b.c', provider: 'mailtrap' });
  });
});
