import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatMoney, setActiveCurrency, getActiveCurrency, resetActiveCurrency, setMoneyLocale, resetMoneyLocale } from './money.js';

const TRY = { code: 'TRY', symbol: '₺', locale: 'tr-TR' };
const USD = { code: 'USD', symbol: '$', locale: 'en-US' };

describe('formatMoney', () => {
  test('para birimi verilmezse aktif (varsayılan TRY) para birimini kullanır', () => {
    resetActiveCurrency();
    const out = formatMoney(123.4);
    assert.match(out, /₺/);
  });

  test('açıkça verilen para birimini kullanır', () => {
    const out = formatMoney(123.4, USD);
    assert.match(out, /\$/);
  });

  test('iki ondalık basamağa yuvarlar', () => {
    const out = formatMoney(10, TRY);
    assert.match(out, /10[.,]00/);
  });

  test('negatif tutarları da biçimlendirir', () => {
    const out = formatMoney(-5.5, TRY);
    assert.match(out, /-/);
  });

  test('geçersiz/eksik tutarı 0 olarak ele alır, throw etmez', () => {
    assert.doesNotThrow(() => formatMoney(undefined, TRY));
    assert.doesNotThrow(() => formatMoney(null, TRY));
    assert.doesNotThrow(() => formatMoney(NaN, TRY));
  });
});

describe('aktif para birimi (uygulama genelinde önbelleklenen tek durum)', () => {
  test('setActiveCurrency ile değiştirilebilir, getActiveCurrency onu yansıtır', () => {
    resetActiveCurrency();
    setActiveCurrency(USD);
    assert.strictEqual(getActiveCurrency().code, 'USD');
    resetActiveCurrency();
  });

  test('setActiveCurrency sonrası formatMoney varsayılan olarak yeni para birimini kullanır', () => {
    resetActiveCurrency();
    setActiveCurrency(USD);
    assert.match(formatMoney(1), /\$/);
    resetActiveCurrency();
  });

  test('resetActiveCurrency varsayılana (TRY) döner', () => {
    setActiveCurrency(USD);
    resetActiveCurrency();
    assert.strictEqual(getActiveCurrency().code, 'TRY');
  });
});

describe('setMoneyLocale (arayüz diline göre sayı biçimi)', () => {
  test('setMoneyLocale verilmezse currency.locale kullanılır (tr-TR biçimi)', () => {
    resetMoneyLocale();
    const out = formatMoney(1000, TRY);
    assert.match(out, /1\.000,00/);
  });

  test('setMoneyLocale sonrası para birimi kodu/sembolü korunur ama sayı biçimi arayüz diline göre değişir', () => {
    resetMoneyLocale();
    setMoneyLocale('en');
    const out = formatMoney(1000, TRY);
    assert.match(out, /₺/);
    assert.match(out, /1,000\.00/);
    resetMoneyLocale();
  });

  test('resetMoneyLocale eski davranışa (currency.locale) döner', () => {
    setMoneyLocale('en');
    resetMoneyLocale();
    const out = formatMoney(1000, TRY);
    assert.match(out, /1\.000,00/);
  });
});
