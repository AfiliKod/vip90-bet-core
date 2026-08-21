/**
 * Ürüne hakim chatbot mantığı (D3).
 *
 * Kabul kriteri: "Sürüm farkını bilerek cevap veriyor, bilmediğinde
 * insana yönlendiriyor." İkisi de burada yapısal olarak garanti edilir:
 * - Sürüm numarası her sistem prompt'una enjekte edilir.
 * - Alakalı hiçbir doküman parçası bulunamazsa LLM'e HİÇ gidilmez —
 *   "bilmiyorum" davranışı bir prompt talimatına değil, koda dayanır.
 *   Bu, LLM'in halüsinasyonla yanlış güvenle cevap vermesini yapısal
 *   olarak engeller.
 */
import { searchKnowledge } from './chatbotKnowledge.js';

export const ESCALATION_MESSAGE =
  'Bu konuda elimde güvenilir bir bilgi yok. Lütfen destek talebi (ticket) açın, ekibimiz size yardımcı olsun.';

export function buildGroundedSystemPrompt({ chunks, version }) {
  const context = chunks.map(c => `## ${c.heading || c.source}\n${c.text}`).join('\n\n');
  return `Sen VIP90.bet platformunun ürün destek asistanısın. Şu an çalışan sürüm: ${version}.

Yalnızca aşağıdaki doküman parçalarına dayanarak cevap ver. Buradaki
bilgiyle cevaplayamıyorsan ya da emin değilsen, tahmin etme — kullanıcıyı
destek talebi açmaya yönlendir.

--- DOKÜMAN PARÇALARI ---
${context}
--- SON ---

Türkçe, kısa ve net cevap ver.`;
}

/**
 * @param {object} params
 * @param {string} params.query
 * @param {Array} params.allChunks - tüm bilgi tabanı (chunkMarkdown çıktıları)
 * @param {string} params.version
 * @param {(systemPrompt: string, query: string) => Promise<string>} params.callLLM
 */
export async function answerQuestion({ query, allChunks, version, callLLM }) {
  const relevant = searchKnowledge(query, allChunks);
  if (!relevant.length) {
    return { reply: ESCALATION_MESSAGE, escalated: true };
  }
  const systemPrompt = buildGroundedSystemPrompt({ chunks: relevant, version });
  const reply = await callLLM(systemPrompt, query);
  return { reply, escalated: false };
}
