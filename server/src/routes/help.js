import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { answerQuestion, ESCALATION_MESSAGE } from '../services/chatbot.js';
import { getKnowledgeChunks, getCurrentVersion } from '../services/chatbotIndex.js';

const r = Router();

const BASE_URL = process.env.AI_HELP_BASE_URL || 'https://openrouter.ai/api/v1';
const API_KEY  = process.env.AI_HELP_API_KEY  || '';
const MODEL    = process.env.AI_HELP_MODEL    || 'meta-llama/llama-3.1-8b-instruct:free';

/** D3: OpenRouter'a giden gerçek ağ çağrısı — answerQuestion'a enjekte edilir. */
async function callLLM(systemPrompt, query) {
  if (!API_KEY) {
    return 'Destek asistanı şu an bakımda. Lütfen destek talebi (ticket) açın.';
  }
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost',
      'X-Title': 'VIP90.bet Destek Asistanı',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      max_tokens: 512,
      temperature: 0.3, // köklenmiş cevap — düşük sıcaklık, halüsinasyonu azaltır
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    console.warn('[Chatbot] AI API hatası:', response.status, err.slice(0, 200));
    return 'Şu an yanıt veremiyorum. Lütfen kısa süre sonra tekrar deneyin.';
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || ESCALATION_MESSAGE;
}

r.post('/chat', requireAuth, async (req, res, next) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'messages gerekli' });
    }

    // Son kullanıcı mesajı — köklenmiş arama bunun üzerinden yapılır.
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user' && typeof m.content === 'string');
    if (!lastUserMessage) {
      return res.status(400).json({ error: 'user mesajı gerekli' });
    }

    const result = await answerQuestion({
      query: lastUserMessage.content,
      allChunks: getKnowledgeChunks(),
      version: getCurrentVersion(),
      callLLM,
    });

    res.json({ reply: result.reply, escalated: result.escalated });
  } catch (e) {
    if (e.name === 'TimeoutError') {
      return res.json({ reply: 'Yanıt zaman aşımına uğradı. Lütfen tekrar deneyin.', escalated: false });
    }
    next(e);
  }
});

export default r;
