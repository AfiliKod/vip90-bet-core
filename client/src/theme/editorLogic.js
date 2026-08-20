/**
 * Tema editörü saf mantığı (A2 — pages/admin/Theme'in ince React sargısı bunu
 * kullanır). Framework'ten bağımsız, DOM/React olmadan test edilir — aynı
 * ayrım i18n/core.js'te kurulmuştu.
 */

/**
 * Taslak (kullanıcının panelde henüz kaydetmediği değerler) ile sunucudan
 * gelen güncel token listesini kıyaslar; yalnızca gerçekten değişmiş, boş
 * olmayan girdileri döner. Kaydet butonu bunları PATCH /admin/theme'e tek
 * tek gönderir.
 */
export function getChangedEntries(tokens, draft) {
  const out = [];
  for (const token of tokens) {
    if (!(token.id in draft)) continue;
    const trimmed = String(draft[token.id]).trim();
    if (!trimmed || trimmed === token.value) continue;
    out.push({ id: token.id, value: trimmed });
  }
  return out;
}

/** Canlı önizleme için id -> cssVar eşlemesi; tanımsız id'de null döner. */
export function tokenCssVar(tokens, id) {
  return tokens.find(t => t.id === id)?.cssVar ?? null;
}
