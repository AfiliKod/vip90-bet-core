// Player pages load a subset of the Material Symbols font (index.css). A
// glyph used in the code but missing from the subset renders as its name in
// plain text, so every icon name written in the client must be on the list.
// Fix a failure with: node client/scripts/icon-subset.mjs add <name>
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const subset = new Set(JSON.parse(readFileSync(join(clientDir, 'public/fonts/material-symbols-outlined-subset.json'), 'utf8')));

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'dictionaries' && name !== 'admin') yield* walk(p); }
    else if (/\.(jsx?|mjs)$/.test(name) && !/\.test\./.test(name)) yield p;
  }
}

// Forms that always carry a glyph name on player-facing code.
const PATTERNS = [
  /<Icon\s+name=["']([a-z0-9_]+)["']/g,
  /material-symbols-outlined[^"'`>]*["'`][^>]*>\s*([a-z][a-z0-9_]+)\s*</g,
  /\bicon:\s*["']([a-z][a-z0-9_]+)["']/g,
  /\bicon=["']([a-z][a-z0-9_]+)["']/g,
];

// SweetAlert2's own icon types (`Swal.fire({ icon: 'success' })`), not glyphs.
const NOT_GLYPHS = new Set(['success', 'error', 'warning', 'info', 'question']);

test('every icon name in player-facing code is in the icon font subset', () => {
  const missing = [];
  for (const file of walk(join(clientDir, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const re of PATTERNS) {
      for (const m of src.matchAll(re)) {
        if (!subset.has(m[1]) && !NOT_GLYPHS.has(m[1])) missing.push(`${m[1]} (${file.slice(clientDir.length + 1)})`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('the subset font file exists and is small', () => {
  const size = statSync(join(clientDir, 'public/fonts/material-symbols-outlined-subset.woff2')).size;
  assert.ok(size > 10_000 && size < 400_000, `unexpected size ${size}`);
});
