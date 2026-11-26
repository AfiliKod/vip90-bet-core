#!/usr/bin/env node
// Regenerates public/fonts/material-symbols-outlined-subset.woff2 from the
// glyph list in public/fonts/material-symbols-outlined-subset.json.
//
//   node client/scripts/icon-subset.mjs            # rebuild from the list
//   node client/scripts/icon-subset.mjs add foo    # add names, then rebuild
//
// The subset comes from the Google Fonts css2 API (`icon_names=`), which
// returns a woff2 holding only those ligatures. Axes match index.css:
// opsz 24, wght 100-700, FILL 0-1, GRAD 0. Only icon names are sent.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fontsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');
const listPath = join(fontsDir, 'material-symbols-outlined-subset.json');
const outPath = join(fontsDir, 'material-symbols-outlined-subset.woff2');

const names = new Set(JSON.parse(readFileSync(listPath, 'utf8')));
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'add') rest.forEach(n => names.add(n));
const sorted = [...names].sort();
writeFileSync(listPath, JSON.stringify(sorted, null, 0).replace(/,/g, ',\n') + '\n');

const url = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100..700,0..1,0'
  + `&icon_names=${sorted.join(',')}&display=block`;
// A modern browser UA makes the API answer with woff2.
const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const css = await (await fetch(url, { headers: { 'user-agent': ua } })).text();
const fontUrl = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)?.[1];
if (!fontUrl) { console.error('No font URL in the API response:\n' + css.slice(0, 500)); process.exit(1); }
const buf = Buffer.from(await (await fetch(fontUrl)).arrayBuffer());
writeFileSync(outPath, buf);
console.log(`${sorted.length} icons -> ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
