import { test, describe } from 'node:test';
import assert from 'node:assert';
import { validateSeo, extractVerificationCode, normalizeTwitterHandle } from './validate.js';

describe('validateSeo', () => {
  test('boş form geçerli', () => assert.deepStrictEqual(validateSeo({}), {}));
  test('geçerli kimlikler', () => {
    assert.deepStrictEqual(validateSeo({ ga4Id: 'g-abcd1234', gtmId: 'GTM-ABC123', pixelId: '123456789' }), {});
  });
  test('geçersiz kimlikler', () => {
    const e = validateSeo({ ga4Id: 'UA-1', gtmId: 'G-ABCD1234', pixelId: 'abc' });
    assert.ok(e.ga4Id && e.gtmId && e.pixelId);
  });
  test('şablon yer tutucu içermeli', () => assert.ok(validateSeo({ titleTemplate: 'sabit' }).titleTemplate));
  test('javascript: görsel/URL reddedilir', () => {
    const e = validateSeo({ ogImage: 'javascript:alert(1)', canonicalBase: 'ftp://x.com' });
    assert.ok(e.ogImage && e.canonicalBase);
  });
  test('site-içi görsel yolu geçerli', () => assert.deepStrictEqual(validateSeo({ ogImage: '/og.png' }), {}));
});

describe('normalizasyon', () => {
  test('meta etiketinden content ayıklanır', () => {
    assert.strictEqual(extractVerificationCode('<meta name="google-site-verification" content="abcdEFGH1234" />'), 'abcdEFGH1234');
    assert.strictEqual(extractVerificationCode('  abc  '), 'abc');
  });
  test('twitter kullanıcı adı', () => {
    assert.strictEqual(normalizeTwitterHandle('@vip90'), 'vip90');
    assert.strictEqual(normalizeTwitterHandle('https://x.com/vip90?s=1'), 'vip90');
  });
});
