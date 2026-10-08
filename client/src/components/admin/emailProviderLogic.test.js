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

  test('her sağlayıcının bir preset\'i vardır (yalnız custom boş)', () => {
    for (const p of EMAIL_PROVIDERS) {
      assert.ok(p in EMAIL_PROVIDER_PRESETS, `preset eksik: ${p}`);
      if (p === 'custom') assert.deepStrictEqual(EMAIL_PROVIDER_PRESETS.custom, {});
      else assert.ok(EMAIL_PROVIDER_PRESETS[p].host, `host eksik: ${p}`);
    }
    assert.deepStrictEqual(Object.keys(EMAIL_PROVIDER_PRESETS).sort(), [...EMAIL_PROVIDERS].sort());
  });
});
