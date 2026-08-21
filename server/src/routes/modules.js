/**
 * M4 — İstemci menü/yönlendirme için HERKESE AÇIK modül durumu.
 *
 * Yalnızca sunum katmanının ihtiyaç duyduğu alanları verir (id, title,
 * description, available); lisans kaynak/sebep detayı sızmaz. Bir modülün
 * "available" olması = panel anahtarı açık VE lisans geçerli.
 */
import { Router } from 'express';
import { listModules } from '../modules/index.js';
import { isModuleUsable } from '../services/licensing/index.js';

export function createPublicModulesHandler({ listModules: list, isModuleUsable: usable }) {
  return async function publicModules(req, res) {
    res.set('Cache-Control', 'public, max-age=30');
    try {
      const modules = await list();
      const out = [];
      for (const m of modules) {
        out.push({
          id: m.id,
          title: m.title,
          description: m.description ?? '',
          available: await usable(m.id),
        });
      }
      return res.json({ modules: out });
    } catch {
      // Durum bilinemiyorsa boş liste: istemci varsayılan (hepsi açık) davranır,
      // asıl zorlama gate'lerin 503'ünde yaşar.
      return res.json({ modules: [] });
    }
  };
}

const r = Router();
r.get('/', createPublicModulesHandler({ listModules, isModuleUsable }));

export default r;
