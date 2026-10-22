import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSessionMaxMinutes,
  isSessionExpired,
  resolveSessionLimitMinutes,
  beginInhouseSession,
  touchInhouseSession,
  closeInhouseSession,
} from '../src/services/inhouseSession.js';

/** Bellek içi sahte model — Mongo bağımlılığı olmadan servis mantığı test edilir. */
function fakeModel(initial = []) {
  const docs = initial.map((d, i) => ({ _id: d._id ?? `d${i + 1}`, ...d }));
  let seq = docs.length;
  return {
    docs,
    // mongoose sorgu zinciri: findOne().sort().lean()
    findOne: ({ status }) => ({
      sort: () => ({
        lean: async () => {
          const hit = docs.filter((d) => d.status === status)
            .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0];
          return hit ? { ...hit } : null;
        },
      }),
    }),
    create: async (d) => { const doc = { status: 'active', startedAt: new Date(), ...d }; docs.push(doc); return doc; },
    updateOne: async (q, u) => {
      const hit = docs.find((d) => (q._id ? String(d._id) === String(q._id) : d.userId === q.userId && d.status === q.status));
      if (!hit) return { modifiedCount: 0 };
      if (u.$set) Object.assign(hit, u.$set);
      if (u.$inc) for (const [k, v] of Object.entries(u.$inc)) hit[k] = (hit[k] || 0) + v;
      return { modifiedCount: 1 };
    },
    updateMany: async (q, u) => {
      const hits = docs.filter((d) => d.userId === q.userId && d.status === q.status);
      hits.forEach((d) => Object.assign(d, u.$set));
      return { modifiedCount: hits.length };
    },
    count: () => docs.length,
    _nextId: () => { seq += 1; return `s${seq}`; },
  };
}

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

describe('resolveSessionLimitMinutes', () => {
  it('oyuncu limiti varsa oyuncu kazanır', () => {
    assert.equal(resolveSessionLimitMinutes(45, 120), 45);
  });

  it('oyuncu limiti yoksa platform varsayılanı', () => {
    assert.equal(resolveSessionLimitMinutes(null, 120), 120);
    assert.equal(resolveSessionLimitMinutes(0, 90), 90);
  });

  it('çakışıklı değerler aralığa kırpılır', () => {
    assert.equal(resolveSessionLimitMinutes(1, 120), 5);       // çok kısa
    assert.equal(resolveSessionLimitMinutes(99999, 120), 1440); // çok uzun
  });
});

describe('defaultSessionMaxMinutes', () => {
  it('env yoksa 120', () => {
    assert.equal(defaultSessionMaxMinutes({}), 120);
  });

  it('env geçerliyse onu kullanır', () => {
    assert.equal(defaultSessionMaxMinutes({ INHOUSE_SESSION_MAX_MINUTES: '45' }), 45);
  });

  it('env geçersizse varsayılana döner', () => {
    assert.equal(defaultSessionMaxMinutes({ INHOUSE_SESSION_MAX_MINUTES: 'abc' }), 120);
    assert.equal(defaultSessionMaxMinutes({ INHOUSE_SESSION_MAX_MINUTES: '0' }), 120);
  });
});

describe('isSessionExpired', () => {
  it('tavan aşıldıysa true', () => {
    assert.equal(isSessionExpired({ startedAt: daysAgo(0.05) }, 1), true); // 72 dk > 60 dk
  });

  it('tavan içindeyse false', () => {
    assert.equal(isSessionExpired({ startedAt: daysAgo(0.01) }, 60), false);
  });

  it('oturum/startedAt yoksa false (ölmüş oturum tavanı tetiklemez)', () => {
    assert.equal(isSessionExpired(null, 60), false);
    assert.equal(isSessionExpired({}, 60), false);
  });
});

describe('beginInhouseSession', () => {
  it('ilk açılışta oturum açar, restarted=false', async () => {
    const model = fakeModel();
    const r = await beginInhouseSession({ userId: 'u1', gameId: 'crash', limitMinutes: 120, model });
    assert.equal(r.restarted, false);
    assert.equal(model.docs.length, 1);
    assert.equal(model.docs[0].status, 'active');
  });

  it('tavan içindeki aktif oturumu DEVAM ettirir (yeni oturum açmaz)', async () => {
    const model = fakeModel([{ userId: 'u1', gameId: 'crash', status: 'active', startedAt: daysAgo(0.02) }]);
    const r = await beginInhouseSession({ userId: 'u1', gameId: 'crash', limitMinutes: 120, model });
    assert.equal(r.restarted, false);
    assert.equal(model.docs.length, 1);
  });

  it('tavan aşılınca eski oturumu kapatır ve yenisini açar (restarted=true)', async () => {
    const model = fakeModel([{ userId: 'u1', gameId: 'crash', status: 'active', startedAt: daysAgo(0.2) }]);
    const r = await beginInhouseSession({ userId: 'u1', gameId: 'mines', limitMinutes: 60, model });
    assert.equal(r.restarted, true);
    const closed = model.docs.filter((d) => d.status === 'closed');
    assert.equal(closed.length, 1);
    assert.equal(closed[0].closeReason, 'max_duration');
    const active = model.docs.filter((d) => d.status === 'active');
    assert.equal(active.length, 1);
    assert.equal(active[0].gameId, 'mines');
  });

  it('oyun değiştiyse açık oturumun oyununu günceller', async () => {
    const model = fakeModel([{ userId: 'u1', gameId: 'crash', status: 'active', startedAt: new Date() }]);
    await beginInhouseSession({ userId: 'u1', gameId: 'roulette', limitMinutes: 120, model });
    assert.equal(model.docs[0].gameId, 'roulette');
    assert.equal(model.docs.length, 1);
  });

  it('DB hatasında fail-open döner (oyun akışı durmaz)', async () => {
    const broken = { findOne() { throw new Error('mongo down'); } };
    const r = await beginInhouseSession({ userId: 'u1', gameId: 'crash', limitMinutes: 120, model: broken });
    assert.equal(r.session, null);
    assert.equal(r.restarted, false);
  });
});

describe('touchInhouseSession', () => {
  it('tur sayacını ve toplam bahsi artırır', async () => {
    const model = fakeModel([{ userId: 'u1', gameId: 'crash', status: 'active', startedAt: new Date(), rounds: 0, totalBet: 0 }]);
    await touchInhouseSession({ userId: 'u1', bet: 25, model });
    await touchInhouseSession({ userId: 'u1', bet: 10, model });
    assert.equal(model.docs[0].rounds, 2);
    assert.equal(model.docs[0].totalBet, 35);
  });
});

describe('closeInhouseSession', () => {
  it('tüm açık oturumları kapatır ve nedeni yazar', async () => {
    const model = fakeModel([
      { userId: 'u1', gameId: 'crash', status: 'active', startedAt: new Date() },
      { userId: 'u1', gameId: 'mines', status: 'active', startedAt: new Date() },
    ]);
    await closeInhouseSession({ userId: 'u1', reason: 'max_duration', model });
    assert.equal(model.docs.filter((d) => d.status === 'active').length, 0);
    assert.ok(model.docs.every((d) => d.closeReason === 'max_duration'));
  });
});