// Market tipi → odds'ların kaçlı gruplandığı (her satır kaç seçenek)
const MULTI_LINE_STEP = {
  // Canonical tipler (oddsSourceUpcomingSync.js TYPE_TITLE_MAP çıktıları)
  'handikap': 2,
  'alt_üst': 2,
  'alt_üst_ev': 2,
  'alt_üst_deplasman': 2,
  'beraberlikte_iade': 2,
  'korner_handikap': 2,
  'toplam_korner': 2,
  // İngilizce fallback normalize sonuçları
  'asian_handicap': 2,
  'over/under': 2,
  'over/under_home_team': 2,
  'over/under_away_team': 2,
  'corner_handicap': 2,
  'total_corners': 2,
  'total_corners_home_team': 2,
  'total_corners_away_team': 2,
  'draw_no_bet': 2,
  'beraberlikte_i̇ade': 2,   // eski kayıtlar için
  'yellow_card_asian_handicap': 2,
  'yellow_card_over/under': 2,
  'yellow_card_over/under_home_team': 2,
  'yellow_card_over/under_away_team': 2,
  // Türkçe normalize fallback (eski DB verisi veya TR cookie)
  'asya_handikapı': 2,
  'üstü/altı': 2,
  'üst/alt_ev_sahibi': 2,
  'üst/alt_deplasman': 2,
  // 3'lü marketler
  'çifte_şans': 3,
  'korner_maç': 3,
  'ilk_yarı_maç': 9,
  'double_chance': 3,
  'corner_double_chance': 3,
  'corner_matchbet': 3,
  'first_team_to_score': 3,
  'last_team_to_score': 3,
  'highest_scoring_period': 3,
  'corner_highest_scoring_period': 3,
};

export function groupOddsIntoLines(market) {
  const odds = market.odds?.filter(o => o.isActive !== false) ?? [];

  if (market.type === 'maç_sonucu' || market.type === 'match_bet' || market.type === 'match_odds') {
    const seen = new Set();
    return [odds.filter(o => !seen.has(o.label) && seen.add(o.label))];
  }

  const step = MULTI_LINE_STEP[market.type];
  if (step) {
    const lines = [];
    for (let i = 0; i + step <= odds.length; i += step) lines.push(odds.slice(i, i + step));
    if (odds.length % step !== 0) lines.push(odds.slice(Math.floor(odds.length / step) * step));
    return lines.filter(l => l.length > 0);
  }

  // 4'ten fazla odds → 2'li grupla (correct_score, number_of_goals vb.)
  if (odds.length > 4) {
    const lines = [];
    for (let i = 0; i < odds.length; i += 2) lines.push(odds.slice(i, i + 2));
    return lines;
  }
  return [odds];
}

/**
 * Çok-hatlı bir market (alt_üst, handikap, alt_üst_ev vb.) için "ana hat"tı seçer:
 * iki oranın birbirine en yakın (en dengeli, ~50/50) olduğu hat. Kaynak sitenin maç
 * kartında öne çıkardığı hat budur. Kompakt görünümlerde ilk hattı (ör. Üst/Alt 1.5,
 * Handikap -0.25) göstermek yanlış — o en uçtaki hat, kaynağınkiyle uyuşmaz.
 * [over/home, under/away] çiftini döner veya null.
 */
export function pickMainLine(market) {
  if (!market) return null;
  const lines = groupOddsIntoLines(market).filter(l => l.length === 2);
  if (!lines.length) return null;
  let best = null, bestDiff = Infinity;
  for (const l of lines) {
    const a = l[0]?.value, b = l[1]?.value;
    if (!(a > 1) || !(b > 1)) continue;           // geçerli oranlar
    const diff = Math.abs(a - b);
    if (diff < bestDiff) { bestDiff = diff; best = l; }
  }
  // Hiçbir hat geçerli değilse ortadaki hattı ver (ilk/uç hat yerine).
  return best ?? lines[Math.floor(lines.length / 2)];
}

// Label dizisinden ortak önek çıkar, sondaki noktalama/boşluk temizle
function commonLabelBase(labels) {
  if (!labels.length) return '';
  if (labels.every(l => l === labels[0])) return labels[0]; // hepsi aynı
  let prefix = labels[0];
  for (const l of labels.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < l.length && prefix[i] === l[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix.replace(/[\s\-+]+$/, '').trim();
}

/**
 * Çok hatlı market için tablo konfigürasyonu döner.
 * lines.length > 1 ve tüm satırlar aynı sayıda sütun içermeli.
 * { headers: string[], rowValues: string[] } döner veya null (tablo uygun değilse).
 */
export function getTableConfig(lines) {
  if (lines.length <= 1) return null;
  const ncols = lines[0]?.length;
  if (!ncols || ncols < 2) return null;
  if (!lines.every(l => l.length === ncols)) return null;

  const headers = [];
  let rowValues = [];

  for (let c = 0; c < ncols; c++) {
    const colLabels = lines.map(l => l[c].label);
    const base = commonLabelBase(colLabels);
    headers.push(base || colLabels[0]);
    // Sadece 1. sütundan satır değerlerini çıkar (değişen kısım)
    if (c === 0 && base && base.length < colLabels[0].length) {
      rowValues = colLabels.map(l => l.slice(base.length).trim());
    }
  }

  // En az bir sütun tutarlı temel etiket taşımalı (correct_score gibi benzersiz label'ları ele)
  const hasConsistency = headers.some((h, i) =>
    lines.map(l => l[i].label).every(lbl => lbl === h || lbl.startsWith(h))
  );
  if (!hasConsistency) return null;

  return { headers, rowValues };
}

/**
 * Bir etkinliğin gerçekten bahis yapılabilir (en az bir geçerli 1X2 oranı olan)
 * olup olmadığını söyler. MiniEventCard bu koşulu sağlamayan etkinlikleri hiç
 * render ETMEZ — bu yüzden lig/spor başlıklarındaki sayaçlar da bu fonksiyonla
 * filtrelenmiş listeden hesaplanmalı, aksi halde "1 maç" yazıp 0 kart gösteren
 * hayalet gruplar oluşur (canlı senkron bazı maçları oranı henüz gelmeden de
 * "canlı" olarak işaretleyebiliyor — market dizisi boş kalabiliyor).
 */
export function hasDisplayableOdds(event) {
  const markets = event?.markets;
  if (!markets?.length) return false;
  const main = markets.find(m => m.type === 'maç_sonucu') ?? markets[0];
  const odds = main?.odds;
  if (!odds?.length) return false;
  const odd1 = odds.find(o => o.label === '1') ?? odds[0];
  const oddX = odds.find(o => o.label === 'X') ?? odds[1];
  const odd2 = odds.find(o => o.label === '2') ?? odds[2];
  return (odd1?.value ?? 0) > 0 || (oddX?.value ?? 0) > 0 || (odd2?.value ?? 0) > 0;
}

/**
 * Oran değerini tercih edilen formatta gösterir.
 * decimal: 2.50 | fractional: 3/2 | american: +150
 */
export function formatOdd(value, format = 'decimal') {
  if (!value || value <= 1) return value?.toFixed(2) ?? '-';
  if (format === 'fractional') {
    const num = value - 1;
    const quarters = Math.round(num * 4);
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const n = quarters, d = 4;
    const g = gcd(n, d);
    return `${n/g}/${d/g}`;
  }
  if (format === 'american') {
    if (value >= 2) return `+${Math.round((value - 1) * 100)}`;
    return `${Math.round(-100 / (value - 1))}`;
  }
  return value.toFixed(2);
}
