import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createI18nCore, assertValidKey } from './core.js';

const dictionaries = {
  tr: { 'auth.username': 'Kullanıcı adı', 'auth.password': 'Şifre', 'welcome.user': 'Merhaba {name}' },
  en: { 'auth.username': 'Username', 'auth.password': 'Password' },
};

describe('assertValidKey', () => {
  test('nokta ayraçlı küçük harf anahtarları kabul eder', () => {
    assert.doesNotThrow(() => assertValidKey('auth.username'));
    assert.doesNotThrow(() => assertValidKey('auth.login.title'));
  });

  test('camelCase son segmenti kabul eder', () => {
    assert.doesNotThrow(() => assertValidKey('auth.referralOptional'));
  });

  test('büyük harfle başlayan segmenti reddeder', () => {
    assert.throws(() => assertValidKey('Auth.username'), /anahtar/);
  });

  test('boşluk içeren anahtarı reddeder', () => {
    assert.throws(() => assertValidKey('auth username'), /anahtar/);
  });

  test('tek segmentli (nokta içermeyen) anahtarı reddeder — ad alanı zorunlu', () => {
    assert.throws(() => assertValidKey('username'), /ad alanı/);
  });
});

describe('createI18nCore', () => {
  test('aktif dilde çeviriyi döndürür', () => {
    const i18n = createI18nCore({ dictionaries, defaultLocale: 'tr' });
    assert.strictEqual(i18n.t('auth.username'), 'Kullanıcı adı');
  });

  test('dil değişince çeviri değişir', () => {
    const i18n = createI18nCore({ dictionaries, defaultLocale: 'en' });
    assert.strictEqual(i18n.t('auth.password'), 'Password');
  });

  test('{param} interpolasyonu yapar', () => {
    const i18n = createI18nCore({ dictionaries, defaultLocale: 'tr' });
    assert.strictEqual(i18n.t('welcome.user', { name: 'Efe' }), 'Merhaba Efe');
  });

  test('aktif dilde anahtar yoksa fallbackLocale’a düşer', () => {
    const i18n = createI18nCore({ dictionaries, defaultLocale: 'en', fallbackLocale: 'tr' });
    assert.strictEqual(i18n.t('welcome.user', { name: 'Efe' }), 'Merhaba Efe');
  });

  test('hiçbir dilde yoksa anahtarın kendisini döner (sessizce boş göstermez)', () => {
    const i18n = createI18nCore({ dictionaries, defaultLocale: 'tr' });
    assert.strictEqual(i18n.t('nonexistent.key'), 'nonexistent.key');
  });

  test('geçersiz anahtar formatında t() da fırlatır — sessiz hata yok', () => {
    const i18n = createI18nCore({ dictionaries, defaultLocale: 'tr' });
    assert.throws(() => i18n.t('Bad Key'), /anahtar/);
  });

  test('locales() sözlüğü tanımlı dilleri listeler', () => {
    const i18n = createI18nCore({ dictionaries, defaultLocale: 'tr' });
    assert.deepStrictEqual(i18n.locales().sort(), ['en', 'tr']);
  });

  test('withLocale() aynı sözlüklerle farklı aktif dilde yeni bir örnek verir', () => {
    const i18n = createI18nCore({ dictionaries, defaultLocale: 'tr' });
    const en = i18n.withLocale('en');
    assert.strictEqual(en.t('auth.username'), 'Username');
    assert.strictEqual(i18n.t('auth.username'), 'Kullanıcı adı'); // orijinal değişmedi
  });

  test('tanımsız dile withLocale çağrısı hata fırlatır', () => {
    const i18n = createI18nCore({ dictionaries, defaultLocale: 'tr' });
    assert.throws(() => i18n.withLocale('de'), /de/);
  });
});
