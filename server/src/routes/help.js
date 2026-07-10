import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

const SYSTEM_PROMPT = `Sen VIP90.bet müşteri destek asistanısın. Spor bahisleri, casino oyunları, hesap yönetimi, para yatırma/çekme işlemleri, kampanyalar ve teknik konularda yardımcı olursun.

VIP90.bet hakkında bilgiler:
- Spor bahisleri: Futbol, basketbol, tenis, voleybol, beyzbol ve daha fazlası
- Casino: BGaming ve diğer sağlayıcılardan 100+ slot oyunu
- Canlı bahis ve yaklaşan maçlarda bahis imkânı
- 7/24 destek
- Para yatırma: Minimum ₺100
- Para çekme: 24 saat içinde işlem

Kurallar:
- Türkçe konuş, kısa ve net yanıtlar ver (maks 3-4 cümle)
- Kesin bilmediğin konularda "destek ekibimizle iletişime geçin" de
- Hesap, bakiye ve kişisel bilgilere erişimin olmadığını belirt
- Sorumlu oyun konusunda duyarlı ol, sorun yaşayan kullanıcıları yönlendir
- Görüşme özeti istendiğinde madde madde, net bir özet yap`;

const BASE_URL = process.env.AI_HELP_BASE_URL || 'https://openrouter.ai/api/v1';
const API_KEY  = process.env.AI_HELP_API_KEY  || '';
const MODEL    = process.env.AI_HELP_MODEL    || 'meta-llama/llama-3.1-8b-instruct:free';

r.post('/chat', requireAuth, async (req, res, next) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || !messages.length)
      return res.status(400).json({ error: 'messages gerekli' });

    // Sadece user/assistant mesajlarını kabul et
    const clean = messages
      .filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-20); // Son 20 mesaj — token taşmasını önle

    if (!API_KEY) {
      return res.json({
        reply: 'Destek asistanı şu an bakımda. Lütfen daha sonra tekrar deneyin veya destek ekibimizle iletişime geçin.',
      });
    }

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        // OpenRouter isteğe bağlı — site adı + URL için
        'HTTP-Referer': 'https://vip90.bet',
        'X-Title': 'VIP90.bet',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...clean,
        ],
        max_tokens: 512,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      console.warn('[LiveHelp] AI API hatası:', response.status, err.slice(0, 200));
      return res.json({
        reply: 'Şu an yanıt veremiyorum. Lütfen kısa süre sonra tekrar deneyin.',
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim()
      || 'Üzgünüm, bir sorun oluştu. Lütfen tekrar deneyin.';

    res.json({ reply });
  } catch (e) {
    if (e.name === 'TimeoutError') {
      return res.json({ reply: 'Yanıt zaman aşımına uğradı. Lütfen tekrar deneyin.' });
    }
    next(e);
  }
});

export default r;
