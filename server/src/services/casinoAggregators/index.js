/**
 * Casino aggregator bootstrap'ı (T3).
 *
 * Kayıt defterini kurar, Palace'ı mevcut servis modülüyle kaydeder ve
 * CASINO_AGGREGATOR env'ine göre aktif aggregator'ı döndürür. Yeni bir
 * aggregator eklemek — Evolution, Pragmatic, genel bir GGR aggregator —
 * burada yeni bir adaptör kaydetmekten ibarettir; routes katmanı
 * değişmez.
 */

import { createAggregatorRegistry, resolveActiveAggregator } from './registry.js';
import { createPalaceAggregator } from './palaceAdapter.js';
import * as palaceCasinoService from '../palaceCasinoService.js';

let _cached = null;

/** Aktif aggregator'ı verir; sonuç process ömrü boyunca önbelleklenir. */
export function getActiveCasinoAggregator(env = process.env) {
  if (_cached) return _cached;
  const registry = createAggregatorRegistry();
  registry.register(createPalaceAggregator(palaceCasinoService));
  // Gelecek aggregator'lar (Evolution, Pragmatic, genel GGR aggregator) burada kaydolur.
  _cached = resolveActiveAggregator(registry, env);
  return _cached;
}

/** Yalnız test amaçlı: önbelleği sıfırlar. */
export function _resetCasinoAggregatorCache() { _cached = null; }
