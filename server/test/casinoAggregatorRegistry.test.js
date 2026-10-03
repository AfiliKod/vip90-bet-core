import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createAggregatorRegistry, resolveActiveAggregator, DEFAULT_AGGREGATOR } from '../src/services/casinoAggregators/registry.js';

const fakeAggregator = (name = 'fake') => ({
  name,
  async getAllGames() { return []; },
  async getGameUrl() { return { url: '' }; },
  async createUser() { return {}; },
  async depositUser() { return {}; },
  async withdrawUser() { return {}; },
  verifyCallback() { return true; },
  async healthCheck() { return { ok: true }; },
});

describe('createAggregatorRegistry', () => {
  test('kayıtlı aggregator’ı adıyla döndürür', () => {
    const reg = createAggregatorRegistry();
    const p = fakeAggregator('igames');
    reg.register(p);
    assert.strictEqual(reg.resolve('igames'), p);
  });

  test('bilinmeyen aggregator için mevcutları listeleyen hata fırlatır', () => {
    const reg = createAggregatorRegistry();
    reg.register(fakeAggregator('igames'));
    assert.throws(() => reg.resolve('evolution'), err => /evolution/.test(err.message) && /igames/.test(err.message));
  });

  test('zorunlu metotları taşımayan aggregator’ı reddeder', () => {
    const reg = createAggregatorRegistry();
    const broken = { name: 'x', async getAllGames() {} };
    assert.throws(() => reg.register(broken), /getGameUrl/);
  });

  test('adsız aggregator reddedilir', () => {
    const reg = createAggregatorRegistry();
    assert.throws(() => reg.register({}), /name/);
  });

  test('aynı adı iki kez kaydetmeyi reddeder', () => {
    const reg = createAggregatorRegistry();
    reg.register(fakeAggregator('igames'));
    assert.throws(() => reg.register(fakeAggregator('igames')), /zaten/i);
  });
});

describe('resolveActiveAggregator', () => {
  test('CASINO_AGGREGATOR env değişkenindeki aggregator’ı seçer', () => {
    const reg = createAggregatorRegistry();
    reg.register(fakeAggregator('igames'));
    const ev = fakeAggregator('evolution');
    reg.register(ev);
    assert.strictEqual(resolveActiveAggregator(reg, { CASINO_AGGREGATOR: 'evolution' }), ev);
  });

  test('env tanımsızsa varsayılan aggregator’a düşer', () => {
    const reg = createAggregatorRegistry();
    const p = fakeAggregator(DEFAULT_AGGREGATOR);
    reg.register(p);
    assert.strictEqual(resolveActiveAggregator(reg, {}), p);
  });
});
