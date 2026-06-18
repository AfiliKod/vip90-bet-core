/**
 * fetch-game-images.mjs çıktısını casinoGames.js'e uygular.
 * Kullanım: node apply-game-images.mjs
 */

import { readFileSync, writeFileSync } from 'fs';

const RESULT_FILE = '/tmp/game_images_result.json';
const GAMES_FILE  = new URL('../../client/src/data/casinoGames.js', import.meta.url).pathname;

const results = JSON.parse(readFileSync(RESULT_FILE, 'utf8'));
let src = readFileSync(GAMES_FILE, 'utf8');

let updated = 0;
for (const [id, imageUrl] of Object.entries(results)) {
  if (!imageUrl) continue;
  // "id": "xxx" satırını bul, sonrasındaki "image": "..." satırını güncelle
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `("id":\\s*"${escaped}"[\\s\\S]*?"image":\\s*)"[^"]*"`,
    'g'
  );
  const replaced = src.replace(re, (m, prefix) => `${prefix}"${imageUrl}"`);
  if (replaced !== src) { src = replaced; updated++; }
}

writeFileSync(GAMES_FILE, src);
console.log(`Güncellendi: ${updated} oyun`);
console.log(`Toplam sonuç: ${Object.keys(results).length}`);
