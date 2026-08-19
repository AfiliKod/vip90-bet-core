import { test, describe } from 'node:test';
import assert from 'node:assert';
import { expandOrigins, canonicalHostRedirect } from '../src/utils/origins.js';

describe('expandOrigins', () => {
  test('apex origin verildiğinde www varyantını da ekler', () => {
    assert.deepStrictEqual(
      expandOrigins(['https://vip90.bet']),
      ['https://vip90.bet', 'https://www.vip90.bet'],
    );
  });

  test('www origin verildiğinde apex varyantını da ekler', () => {
    assert.deepStrictEqual(
      expandOrigins(['https://www.vip90.bet']),
      ['https://www.vip90.bet', 'https://vip90.bet'],
    );
  });

  test('her iki varyant zaten varsa tekrar eklemez', () => {
    assert.deepStrictEqual(
      expandOrigins(['https://vip90.bet', 'https://www.vip90.bet']),
      ['https://vip90.bet', 'https://www.vip90.bet'],
    );
  });

  test('localhost için www varyantı üretmez', () => {
    assert.deepStrictEqual(
      expandOrigins(['http://localhost:5173']),
      ['http://localhost:5173'],
    );
  });

  test('IP adresi için www varyantı üretmez', () => {
    assert.deepStrictEqual(
      expandOrigins(['http://192.168.1.101:5174']),
      ['http://192.168.1.101:5174'],
    );
  });

  test('joker (*) girdisini olduğu gibi korur', () => {
    assert.deepStrictEqual(expandOrigins(['*']), ['*']);
  });
});

describe('canonicalHostRedirect', () => {
  test('www hostu apex hosta indirger', () => {
    assert.strictEqual(canonicalHostRedirect('www.vip90.bet'), 'vip90.bet');
  });

  test('apex host için yönlendirme gerekmez', () => {
    assert.strictEqual(canonicalHostRedirect('vip90.bet'), null);
  });

  test('port bilgisi korunur', () => {
    assert.strictEqual(canonicalHostRedirect('www.vip90.bet:3000'), 'vip90.bet:3000');
  });

  test('host yoksa null döner', () => {
    assert.strictEqual(canonicalHostRedirect(undefined), null);
  });
});
