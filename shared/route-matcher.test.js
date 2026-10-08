import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compilePattern, compileRoutes, matchRoute } from './route-matcher.js';

const ROUTES = compileRoutes([
  '/', '/bahis', '/canli', '/events/:id', '/igames/:gameId',
  '/games/crash', '/admin', '/admin/users', '/admin/analytics', '/legal/terms',
]);

const has = pathname => matchRoute(ROUTES, pathname);

describe('compilePattern', () => {
  test('statik segmentler regex kaçışlı', () => {
    assert.ok(compilePattern('/legal/bonus-terms').test('/legal/bonus-terms'));
    assert.ok(!compilePattern('/legal/bonus-terms').test('/legal/bonusXterms'));
  });

  test('param segmenti tek boşluksuz bloğa denk gelir', () => {
    const re = compilePattern('/events/:id');
    assert.ok(re.test('/events/123'));
    assert.ok(re.test('/events/abc-def_1'));
    assert.ok(!re.test('/events/'));
    assert.ok(!re.test('/events/1/2'));
  });

  test('özel karakterler joker olarak yorumlanmaz', () => {
    const re = compilePattern('/games/a.b');
    assert.ok(re.test('/games/a.b'));
    assert.ok(!re.test('/games/axb'));
  });
});

describe('matchRoute', () => {
  test('trailing slash eşleşmeyi bozmaz', () => {
    for (const p of ['/', '/bahis', '/admin', '/legal/terms']) {
      assert.ok(has(p), p);
      assert.ok(has(`${p}/`), `${p}/`);
    }
  });

  test('tam yol (query/hash dışarıda) eşleşir', () => {
    assert.ok(has('/events/123'));
    assert.ok(has('/igames/abc'));
    assert.ok(has('/games/crash'));
    assert.ok(has('/admin/users'));
    assert.ok(has('/admin/analytics'));
    assert.ok(has('/legal/terms'));
  });

  test('yok olmayan yollar eşleşmez', () => {
    for (const p of ['/olmayansayfa', '/admin/yok-boyle', '/events/1/2', '/legal/yok', '/bahis/ek']) {
      assert.equal(has(p), false, p);
    }
  });

  test('manifest dışı /admin/* düşmez (tam liste kullanılır)', () => {
    assert.ok(has('/admin/users'));
    assert.equal(has('/admin/users/123'), false);
    assert.equal(has('/admin/panel'), false);
  });

  test('derlenmemiş veya boş tablo hiçbir şeyi eşleştirmez', () => {
    assert.equal(matchRoute(null, '/'), false);
    assert.equal(matchRoute([], '/'), false);
    assert.equal(matchRoute(compileRoutes('bozuk'), '/'), false);
  });

  test('bozuk girdiler atlanır, geçerli olanlar kalır', () => {
    const c = compileRoutes([null, 42, {}, '/bahis', 'bahis']);
    assert.equal(c.length, 1);
    assert.ok(matchRoute(c, '/bahis'));
  });
});
