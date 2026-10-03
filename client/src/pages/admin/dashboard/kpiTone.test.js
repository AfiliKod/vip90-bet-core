import { test, describe } from 'node:test';
import assert from 'node:assert';
import { KPI_TONE_COLORS, hexToRgb, kpiTone, deltaTone } from './kpiTone.js';

describe('kpiTone — sayının işareti', () => {
  test('pozitif sayı up (yeşil) tonu alır', () => {
    assert.strictEqual(kpiTone(48200), 'up');
    assert.strictEqual(kpiTone(0.01), 'up');
  });

  test('negatif sayı down (kırmızı) tonu alır', () => {
    assert.strictEqual(kpiTone(-48200), 'down');
    assert.strictEqual(kpiTone(-0.01), 'down');
  });

  test('sıfır nötr — yön yokken yön uydurmak yanıltıcı', () => {
    assert.strictEqual(kpiTone(0), 'neutral');
  });

  test('sayı olmayan değer nötr', () => {
    assert.strictEqual(kpiTone(null), 'neutral');
    assert.strictEqual(kpiTone(undefined), 'neutral');
    assert.strictEqual(kpiTone('—'), 'neutral');
    assert.strictEqual(kpiTone(NaN), 'neutral');
  });
});

describe('deltaTone — kart ile aynı kural', () => {
  test('artış up, düşüş down', () => {
    assert.strictEqual(deltaTone(12.4), 'up');
    assert.strictEqual(deltaTone(-3.1), 'down');
  });

  test('sıfır ve null nötr', () => {
    assert.strictEqual(deltaTone(0), 'neutral');
    assert.strictEqual(deltaTone(null), 'neutral');
  });
});

describe('SAYI / RENK / OK ÇELİŞMEZ — asıl kural', () => {
  // Kartın oku doğrudan `kpiTone` çıktısından türetilir; renk de aynı
  // sözlükten. Bu test, ikisinin birbirinden ayrışmasını yakalar.
  const icon = tone => (tone === 'neutral' ? 'metrik' : (tone === 'up' ? 'trending_up' : 'trending_down'));
  const hex = tone => KPI_TONE_COLORS[tone];

  test('up: yeşil + yukarı ok (kazanç bullish)', () => {
    const t = kpiTone(1000);
    assert.strictEqual(icon(t), 'trending_up');
    assert.strictEqual(hex(t), '#10b981');
  });

  test('down: kırmızı + aşağı ok (zarar bearish)', () => {
    const t = kpiTone(-1000);
    assert.strictEqual(icon(t), 'trending_down');
    assert.strictEqual(hex(t), '#ef4444');
  });

  test('zarar kart asla bullish hava vermez', () => {
    for (const v of [-1, -999, -1000, -48200, -1e9]) {
      const t = kpiTone(v);
      assert.strictEqual(hex(t), '#ef4444', `${v} kırmızı olmalı`);
      assert.notStrictEqual(icon(t), 'trending_up', `${v} yukarı ok göstermemeli`);
    }
  });

  test('kazanç kart asla bearish hava vermez', () => {
    for (const v of [1, 999, 1000, 48200, 1e9]) {
      const t = kpiTone(v);
      assert.strictEqual(hex(t), '#10b981', `${v} yeşil olmalı`);
      assert.notStrictEqual(icon(t), 'trending_down', `${v} aşağı ok göstermemeli`);
    }
  });

  test('neutral: renk yok, metrik ikonu', () => {
    const t = kpiTone(0);
    assert.strictEqual(hex(t), null);
    assert.strictEqual(icon(t), 'metrik');
  });
});

describe('hexToRgb', () => {
  test('6 haneli hex rgb tripletine çevrilir', () => {
    assert.strictEqual(hexToRgb('#10b981'), '16 185 129');
    assert.strictEqual(hexToRgb('#ef4444'), '239 68 68');
  });

  test('3 haneli hex genişletilir', () => {
    assert.strictEqual(hexToRgb('#0f8'), '0 255 136');
  });

  test('büyük harf ve boşluk kabul edilir', () => {
    assert.strictEqual(hexToRgb('  #10B981 '), '16 185 129');
  });

  test('geçersiz değer null', () => {
    assert.strictEqual(hexToRgb('#12'), null);
    assert.strictEqual(hexToRgb('red'), null);
    assert.strictEqual(hexToRgb(null), null);
  });
});

describe('KPI_TONE_COLORS', () => {
  test('up yeşil, down kırmızı, neutral renksiz', () => {
    assert.strictEqual(KPI_TONE_COLORS.up, '#10b981');
    assert.strictEqual(KPI_TONE_COLORS.down, '#ef4444');
    assert.strictEqual(KPI_TONE_COLORS.neutral, null);
  });

  test('her ton geçerli hex üretir (CSS değişkeni boşa düşmez)', () => {
    for (const tone of ['up', 'down']) {
      assert.match(KPI_TONE_COLORS[tone], /^#[0-9a-f]{6}$/);
      assert.ok(hexToRgb(KPI_TONE_COLORS[tone]), `${tone} çevrilemedi`);
    }
  });
});
