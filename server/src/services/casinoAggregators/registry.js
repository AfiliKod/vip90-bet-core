/**
 * Casino aggregator kayıt defteri (T3 — Faz 0 sözleşmesi).
 *
 * Palace şu an tek aggregator; ikinci bir sağlayıcı (Evolution, Pragmatic,
 * genel bir GGR aggregator) eklemek bu kontrata uyan yeni bir adaptör
 * yazmaktan ibaret olmalı. Zorunlu yüzey, platformun bel kemiği olan
 * uçlarla sınırlı — idari/raporlama uçları (bonus call, RTP, transactions)
 * aggregator'a özgü olabilir ve bu kontratın parçası değildir.
 *
 *   {
 *     name: string,
 *     getAllGames(lang?)                          : Promise<Game[]>,
 *     getGameUrl(params)                           : Promise<{ url }>,
 *     createUser(username)                         : Promise<User>,
 *     depositUser(userCode, amount)                : Promise<Result>,
 *     withdrawUser(userCode, amount)                : Promise<Result>,
 *     verifyCallback(token)                        : boolean,
 *     healthCheck()                                : Promise<Status>,
 *   }
 */

export const DEFAULT_AGGREGATOR = 'palace';

const REQUIRED_METHODS = [
  'getAllGames', 'getGameUrl', 'createUser',
  'depositUser', 'withdrawUser', 'verifyCallback', 'healthCheck',
];

function assertValidAggregator(agg) {
  if (!agg || typeof agg !== 'object') {
    throw new Error('Casino aggregator bir nesne olmalı');
  }
  if (typeof agg.name !== 'string' || agg.name.trim() === '') {
    throw new Error('Casino aggregator bir "name" taşımalı');
  }
  for (const m of REQUIRED_METHODS) {
    if (typeof agg[m] !== 'function') {
      throw new Error(`Casino aggregator "${agg.name}" kontratı ihlal ediyor: ${m}() eksik`);
    }
  }
}

export function createAggregatorRegistry() {
  const aggregators = new Map();

  return {
    register(agg) {
      assertValidAggregator(agg);
      if (aggregators.has(agg.name)) {
        throw new Error(`Casino aggregator "${agg.name}" zaten kayıtlı`);
      }
      aggregators.set(agg.name, agg);
      return agg;
    },

    resolve(name) {
      const a = aggregators.get(name);
      if (!a) {
        const available = [...aggregators.keys()].join(', ') || '(hiç)';
        throw new Error(`Bilinmeyen casino aggregator "${name}". Mevcut: ${available}`);
      }
      return a;
    },

    names() {
      return [...aggregators.keys()];
    },
  };
}

/** Aktif aggregator'ı env üzerinden seçer; tanımsızsa varsayılana düşer. */
export function resolveActiveAggregator(registry, env = process.env) {
  const name = env.CASINO_AGGREGATOR || DEFAULT_AGGREGATOR;
  return registry.resolve(name);
}
