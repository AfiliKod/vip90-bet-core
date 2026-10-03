import { test, describe } from 'node:test';
import assert from 'node:assert';
import { pageTitleKey, formatTitle } from './titles.js';

describe('pageTitleKey', () => {
  test('ana sayfa sayfa adı taşımaz', () => assert.strictEqual(pageTitleKey('/'), null));
  test('bilinen rotalar', () => {
    assert.strictEqual(pageTitleKey('/casino'), 'nav.casino');
    assert.strictEqual(pageTitleKey('/legal/privacy/'), 'legal.privacy.title');
    assert.strictEqual(pageTitleKey('/events/abc123'), 'nav.sports');
    assert.strictEqual(pageTitleKey('/admin/platform?tab=seo'), 'nav.admin');
  });
  test('bilinmeyen rota null', () => assert.strictEqual(pageTitleKey('/nope'), null));
  test('prototip anahtarları sızmaz', () => assert.strictEqual(pageTitleKey('/constructor'), null));
});

describe('formatTitle', () => {
  test('şablon uygulanır', () => assert.strictEqual(formatTitle('{page} | {site}', 'Casino', 'VIP90'), 'Casino | VIP90'));
  test('özel şablon, ters sıra', () => assert.strictEqual(formatTitle('{site} - {page}', 'Casino', 'VIP90'), 'VIP90 - Casino'));
  test('sayfa yoksa yalnız site', () => assert.strictEqual(formatTitle('{page} | {site}', null, 'VIP90'), 'VIP90'));
  test('boş şablon varsayılana düşer', () => assert.strictEqual(formatTitle('', 'A', 'B'), 'A | B'));
  test('site boşsa varsayılan marka', () => assert.strictEqual(formatTitle('{page} | {site}', 'A', ''), 'A | VIP90.bet'));
});
