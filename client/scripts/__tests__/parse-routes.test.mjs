/**
 * Rota manifest parser'ının birim testleri. Doğruluk burada garanti edilir:
 * manifest elle tutulmadığı için "App.jsx ile senkron mu?" diye CI gate'i yok —
 * parser'ı değiştirirsen BURASI kırılır (istenen davranış).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoutes, parseTag, scanTags, buildManifest } from '../emit-route-manifest.mjs';

const wrap = inner => `import { Routes, Route } from 'react-router-dom';\nexport default function App() {\n  return (\n    <Routes>\n${inner}\n    </Routes>\n  );\n}\n`;

const parse = inner => parseRoutes(wrap(inner));

describe('parseTag', () => {
  test('öznitelikler, tırnaklar ve kapanış konumu', () => {
    const src = '<Route path="/a" element={<X />} />';
    const t = parseTag(src, 0);
    assert.equal(t.name, 'Route');
    assert.equal(t.attrs.path, '/a');
    assert.equal(t.selfClosing, true);
    assert.equal(src.slice(t.end), '');
  });

  test('süslü parantez içindeki `>` etiketi bitirmez', () => {
    const src = '<Route path="/a" element={<Navigate to="/admin/wallet?tab=bank" replace />} />';
    const t = parseTag(src, 0);
    assert.equal(t.attrs.path, '/a');
    assert.equal(t.selfClosing, true);
  });

  test('ok fonksiyonu içindeki JSX etiketi sonlanmayı bozmaz', () => {
    const src = '<Route path="/a" element={<List render={() => <div className="x">{1}</div>} />} />';
    const t = parseTag(src, 0);
    assert.equal(t.attrs.path, '/a');
    assert.equal(t.selfClosing, true);
  });

  test('çok satırlı öznitelikler ve süslü parantezli değer', () => {
    const src = '<Route\n  path={"/b"}\n  element={\n    <X />\n  }\n/>';
    const t = parseTag(src, 0);
    assert.equal(t.attrs.path, '/b');
    assert.equal(t.selfClosing, true);
  });

  test('kapanış etiketi', () => {
    const t = parseTag('</Route>', 0);
    assert.equal(t.closing, true);
    assert.equal(t.name, 'Route');
  });

  test('etiket olmayan `<` ve yorumlar', () => {
    assert.equal(parseTag('<div>', 0).name, 'div');
    assert.equal(scanTags('a < b and 3<4').length, 0);
  });
});

describe('parseRoutes', () => {
  test('statik rotalar kaynak sırasıyla çıkar', () => {
    assert.deepEqual(parse(`
      <Route path="/" element={<Home />} />
      <Route path="/bahis" element={<Bahis />} />
      <Route path="/login" element={<Login />} />
    `), ['/', '/bahis', '/login']);
  });

  test('paramlı segmentler korunur', () => {
    assert.deepEqual(parse(`
      <Route path="/events/:id" element={<E />} />
      <Route path="/igames/:gameId" element={<I />} />
    `), ['/events/:id', '/igames/:gameId']);
  });

  test('parent + self-closing çocuk rotalar birleşir (derinlik takibi)', () => {
    assert.deepEqual(parse(`
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dash />} />
        <Route path="users" element={<Users />} />
        <Route path="crypto" element={<Navigate to="/admin/wallet?tab=crypto" replace />} />
      </Route>
    `), ['/admin', '/admin/users', '/admin/crypto']);
  });

  test('parent kapanınca sonraki kardeşler kök rota olur', () => {
    assert.deepEqual(parse(`
      <Route path="/admin" element={<A />}>
        <Route path="a" element={<A />} />
      </Route>
      <Route path="/about" element={<About />} />
    `), ['/admin', '/admin/a', '/about']);
  });

  test('`index` rotası eklemez, `*` jokeri manifeste GİRMEZ', () => {
    const patterns = parse(`
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
      <Route path="ghost/*" element={<G />} />
    `);
    assert.deepEqual(patterns, ['/']);
  });

  test('JSX yorumları içindeki sahte rotalar sayılmaz', () => {
    assert.deepEqual(parse(`
      {/* <Route path="/yorum-rotasi" element={<X />} /> */}
      <Route path="/gercek" element={<X />} />
    `), ['/gercek']);
  });

  test('aynı desen iki kez geçse tek yazılır', () => {
    const patterns = parse(`
      <Route path="/x" element={<A />} />
      <Route path="/x" element={<B />} />
    `);
    assert.deepEqual(patterns, ['/x']);
  });

  test('Routes bloğu yoksa hata verir (sessiz boş tablo üretilmez)', () => {
    assert.throws(() => parseRoutes('export default function App() { return null; }'), /<Routes>/);
    assert.throws(() => parse('<Routes>\n      {/* yalnızca yorum */}\n    </Routes>'), /hiç rota/);
  });

  test('GERÇEK App.jsx tablosu boş değil ve joker yok', async () => {
    const { readFileSync } = await import('node:fs');
    const { APP_JSX } = await import('../emit-route-manifest.mjs');
    const patterns = parseRoutes(readFileSync(APP_JSX, 'utf8'));
    assert.ok(patterns.length > 50, `beklenenden az rota: ${patterns.length}`);
    assert.ok(patterns.includes('/'));
    assert.ok(patterns.includes('/admin'));
    assert.ok(patterns.includes('/admin/analytics'));
    assert.ok(patterns.includes('/events/:id'));
    assert.equal(patterns.some(p => p.includes('*')), false);
    assert.equal(new Set(patterns).size, patterns.length);
  });
});

describe('buildManifest', () => {
  test('gövde: generatedAt + count + patterns', () => {
    const out = JSON.parse(buildManifest(['/', '/bahis'], '2026-10-08T00:00:00.000Z'));
    assert.deepEqual(out, { generatedAt: '2026-10-08T00:00:00.000Z', count: 2, patterns: ['/', '/bahis'] });
  });
});
