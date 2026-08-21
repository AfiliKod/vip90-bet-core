/**
 * V1 — Demo vitrini: "modül gerektirir" rozetinin veri katmanı.
 *
 * Her vitrin kalemi bağlı olduğu modülün isModuleUsable() (M4 — admin
 * toggle + lisans çift kapısı) sonucuna göre requiresModule bayrağı taşır.
 * Kırık sayfa/500 asla dönmez — okuma patlarsa tüm modüllü içerik
 * "gerektirir" sayılır (fail-closed gösterim).
 *
 * moduleId:null kalemler çekirdek platformdur (M1 sözleşmesi) — her zaman açık.
 */
import { Router } from 'express';
import { isModuleUsable } from '../services/licensing/index.js';

export const SHOWCASE_ITEMS = [
  { key: 'sportsbook', title: 'Spor & Canlı Bahis', description: 'Odds akışı, kupon, sonuçlandırma.', moduleId: 'betting' },
  { key: 'casino', title: 'Casino Oyunları', description: 'Slot ve masa oyunları, aggregator üzerinden.', moduleId: 'casino-content' },
  { key: 'live-casino', title: 'Canlı Casino', description: 'Gerçek krupiyeli masa ve video oyunları.', moduleId: 'live-casino' },
  { key: 'inhouse', title: 'In-house Oyunlar', description: 'Crash, Mines, Plinko ve diğerleri — çekirdek platform.', moduleId: null },
];

export function createShowcaseHandler({ isModuleUsable: isUsable }) {
  return async function demoShowcase(req, res) {
    res.set('Cache-Control', 'no-store');
    const items = [];
    for (const item of SHOWCASE_ITEMS) {
      let available = true;
      if (item.moduleId !== null) {
        try {
          available = await isUsable(item.moduleId);
        } catch {
          available = false; // durum bilinemiyor → rozetli göster
        }
      }
      items.push({
        ...item,
        available,
        requiresModule: !available,
      });
    }
    return res.json({ items });
  };
}

const r = Router();
r.get('/showcase', createShowcaseHandler({ isModuleUsable }));

export default r;
