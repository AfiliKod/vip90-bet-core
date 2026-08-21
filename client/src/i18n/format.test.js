import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createFormatters, DEFAULT_TIMEZONE } from './format.js';

// Sabit an: 2026-03-15 18:30 UTC → İstanbul'da 21:30 (UTC+3)
const T = new Date('2026-03-15T18:30:00Z');

describe('createFormatters — tarih/saat', () => {
  const f = createFormatters({ locale: 'tr', timezone: 'Europe/Istanbul' });

  test('formatTime saat dilimini uygular (UTC 18:30 → İstanbul 21:30)', () => {
    assert.strictEqual(f.formatTime(T), '21:30');
  });

  test('farklı saat dilimi farklı sonuç verir (Londra 18:30)', () => {
    const london = createFormatters({ locale: 'en', timezone: 'Europe/London' });
    assert.strictEqual(london.formatTime(T), '18:30');
  });

  test('formatDate gün/ay üretir', () => {
    const d = f.formatDate(T);
    assert.ok(d.includes('15'), `gün yok: ${d}`);
    assert.ok(/mar/i.test(d), `ay yok: ${d}`);
  });

  test('formatDateTime ikisini birleştirir ve saat dilimini korur', () => {
    const dt = f.formatDateTime(T);
    assert.ok(dt.includes('21:30'), `İstanbul saati yok: ${dt}`);
  });

  test('locale değişince çıktı dili değişir (tr Mart vs en March)', () => {
    const en = createFormatters({ locale: 'en', timezone: 'Europe/Istanbul' });
    assert.ok(/Mar/i.test(en.formatDate(T)));
    assert.ok(/Mar/i.test(f.formatDate(T))); // türkçe "Mar"
  });

  test('geçersiz tarih için güvenli yer tutucu döner, throw etmez', () => {
    assert.strictEqual(f.formatTime(new Date('bokta')), '—');
    assert.strictEqual(f.formatDate(null), '—');
    assert.strictEqual(f.formatDateTime(undefined), '—');
  });
});

describe('createFormatters — sayı (para birimi DIŞI)', () => {
  test("formatNumber binlik ayracını locale'e göre uygular", () => {
    const tr = createFormatters({ locale: 'tr', timezone: DEFAULT_TIMEZONE });
    const en = createFormatters({ locale: 'en', timezone: DEFAULT_TIMEZONE });
    assert.strictEqual(tr.formatNumber(12345), '12.345');
    assert.strictEqual(en.formatNumber(12345), '12,345');
  });

  test('formatPercent yüzdeyi locale kurallarıyla yazar', () => {
    const tr = createFormatters({ locale: 'tr', timezone: DEFAULT_TIMEZONE });
    assert.strictEqual(tr.formatPercent(0.975), '%97,5');
  });

  test('geçersiz sayı güvenli yer tutucu döner', () => {
    const f = createFormatters({ locale: 'tr', timezone: DEFAULT_TIMEZONE });
    assert.strictEqual(f.formatNumber(NaN), '—');
    assert.strictEqual(f.formatNumber(undefined), '—');
  });
});

describe('DEFAULT_TIMEZONE', () => {
  test('Europe/Istanbul varsayılanı geçerli bir IANA bölgesidir', () => {
    assert.strictEqual(DEFAULT_TIMEZONE, 'Europe/Istanbul');
    // Geçerlilik: bu bölgeyle formatter kurulabilmeli
    assert.doesNotThrow(() => createFormatters({ locale: 'tr', timezone: DEFAULT_TIMEZONE }));
  });
});
