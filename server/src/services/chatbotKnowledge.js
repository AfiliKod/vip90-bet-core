/**
 * Chatbot bilgi tabanı: dokümanları parçalara ayırma + basit terim
 * örtüşmesine dayalı arama (D3).
 *
 * Gerçek bir embedding/vektör arama altyapısı yok — bu bilinçli bir
 * kapsam kararı: küçük bir doküman kümesinde (docs/product/ + changelog)
 * terim örtüşmesi yeterli sinyal verir ve harici bir servise/maliyete
 * ihtiyaç duymaz. Skor sıfırsa (hiçbir terim örtüşmüyorsa) boş dizi
 * döner — bu, çağıran kodun "bilmiyorum, insana yönlendir" kararını
 * vereceği sinyaldir.
 */

/** Markdown'ı `## Başlık` sınırlarına göre parçalara ayırır. */
export function chunkMarkdown(markdown, source) {
  if (!markdown?.trim()) return [];
  const lines = markdown.split('\n');
  const chunks = [];
  let currentHeading = null;
  let buffer = [];

  function flush() {
    const text = buffer.join('\n').trim();
    if (text) chunks.push({ heading: currentHeading, text, source });
    buffer = [];
  }

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      flush();
      currentHeading = h2[1].trim();
    } else if (!line.match(/^#\s+/)) {
      buffer.push(line);
    }
  }
  flush();

  return chunks;
}

const STOPWORDS = new Set(['ve', 'ile', 'bir', 'bu', 'için', 'nasıl', 'mi', 'mı', 'mu', 'mü', 'ne', 'nedir', 'var', 'yok']);

function terms(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\wçğıöşü\s]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/** Terim örtüşmesine göre en alakalı parçaları döner; hiç örtüşme yoksa []. */
export function searchKnowledge(query, chunks, { topN = 3 } = {}) {
  const queryTerms = terms(query);
  if (!queryTerms.length) return [];

  const scored = chunks
    .map(chunk => {
      const chunkTerms = new Set(terms(`${chunk.heading || ''} ${chunk.text}`));
      const score = queryTerms.filter(t => chunkTerms.has(t)).length;
      return { ...chunk, score };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}
