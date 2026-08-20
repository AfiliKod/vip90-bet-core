import { test, describe } from 'node:test';
import assert from 'node:assert';
import { assertValidManifest, isNewerVersion } from '../src/agent/updatePackage.js';

describe('assertValidManifest', () => {
  test('geçerli manifesti kabul eder', () => {
    assert.doesNotThrow(() => assertValidManifest([{ file: 'server/src/x.js', checksum: 'abc123' }]));
  });

  test('boş manifesti reddeder', () => {
    assert.throws(() => assertValidManifest([]), /boş olamaz/);
  });

  test('dizi olmayan manifesti reddeder', () => {
    assert.throws(() => assertValidManifest(null), /boş olamaz/);
  });

  test('file veya checksum eksik girdiyi reddeder', () => {
    assert.throws(() => assertValidManifest([{ file: 'x.js' }]), /geçersiz/);
    assert.throws(() => assertValidManifest([{ checksum: 'abc' }]), /geçersiz/);
  });
});

describe('isNewerVersion', () => {
  test('major/minor/patch artışını doğru karşılaştırır', () => {
    assert.strictEqual(isNewerVersion('1.2.0', '1.1.9'), true);
    assert.strictEqual(isNewerVersion('2.0.0', '1.9.9'), true);
    assert.strictEqual(isNewerVersion('1.1.1', '1.1.0'), true);
  });

  test('eski veya eşit sürümü reddeder', () => {
    assert.strictEqual(isNewerVersion('1.0.0', '1.0.0'), false);
    assert.strictEqual(isNewerVersion('1.0.0', '1.1.0'), false);
    assert.strictEqual(isNewerVersion('0.9.0', '1.0.0'), false);
  });
});
