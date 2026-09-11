/**
 * Casino aggregator bootstrap'ı (T3).
 *
 * Kayıt defterini kurar, mevcutsa Palace adaptörünü kaydeder ve
 * CASINO_AGGREGATOR env'ine göre aktif aggregator'ı döndürür. Yeni bir
 * aggregator eklemek — Evolution, Pragmatic, genel bir GGR aggregator —
 * burada yeni bir adaptör kaydetmekten ibarettir; routes katmanı
 * değişmez.
 *
 * Palace adaptörü/servisi AYRI (ücretli) bir pakettir, bu kurulumda hiç
 * bulunmayabilir — bu yüzden statik değil, opsiyonel dinamik import ile
 * yükleniyor. Paket yoksa registry boş kalır, `getActiveCasinoAggregator()`
 * yalnızca gerçekten ÇAĞRILDIĞINDA (ve hiçbir aggregator kayıtlı değilken)
 * anlamlı bir hata fırlatır — import zamanında değil.
 */

import { createAggregatorRegistry, resolveActiveAggregator } from './registry.js';

let _cached = null;

async function tryRegisterPalace(registry) {
  try {
    const [{ createPalaceAggregator }, palaceCasinoService] = await Promise.all([
      import('./palaceAdapter.js'),
      import('../palaceCasinoService.js'),
    ]);
    registry.register(createPalaceAggregator(palaceCasinoService));
  } catch {
    // Palace entegrasyonu bu kurulumda mevcut değil (ayrı/ücretli modül).
  }
}

/** Aktif aggregator'ı verir; sonuç process ömrü boyunca önbelleklenir. */
export async function getActiveCasinoAggregator(env = process.env) {
  if (_cached) return _cached;
  const registry = createAggregatorRegistry();
  await tryRegisterPalace(registry);
  // Gelecek aggregator'lar (Evolution, Pragmatic, genel GGR aggregator) burada kaydolur.
  _cached = resolveActiveAggregator(registry, env);
  return _cached;
}

/** Yalnız test amaçlı: önbelleği sıfırlar. */
export function _resetCasinoAggregatorCache() { _cached = null; }
