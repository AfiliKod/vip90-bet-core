import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enforceInhouseSessionLimit } from '../src/middleware/inhouseSessionLimit.js';

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const run = async (mw, req) => {
  const res = fakeRes();
  let nextArg; let called = false;
  await mw(req, res, (e) => { called = true; nextArg = e; });
  return { called, nextArg, res, req };
};

/** Oturum servisinin gözlemlenebilir taklitçisi. */
function fakeSessionService({ active = null, expired = false } = {}) {
  const calls = { begin: [], touch: [], close: [], limit: [] };
  return {
    calls,
    getActiveInhouseSession: async () => active,
    closeInhouseSession: async (a) => { calls.close.push(a); },
    touchInhouseSession: async (a) => { calls.touch.push(a); },
    beginInhouseSession: async (a) => { calls.begin.push(a); return { session: {}, restarted: a.restart ?? false } },
    resolveSessionLimitMinutes: (v) => { calls.limit.push(v); return v || 120; },
    isSessionExpired: () => expired,
  };
}

// /callback oturumsuz gelir; oyuncu externalPlayerId ile çözülür (DI).
const findPlayer = async (id) => (id === 'u1' ? { _id: 'u1' } : null);

const launch = (over = {}) => ({ path: '/launch', user: { id: 'u1' }, body: { gameId: 'crash' }, ...over });
const debit = (over = {}) => ({ path: '/callback', user: null, body: { type: 'debit', externalPlayerId: 'u1', amount: 50, bet: 50 }, ...over });

describe('enforceInhouseSessionLimit', () => {
  const findUser = async () => ({ responsibleLimits: { sessionTimeoutMin: null } });

  it('launch: oturum açar ve yeniden başlatma bayrağını req’e yazar', async () => {
    const ss = fakeSessionService();
    const mw = enforceInhouseSessionLimit({ findUser, findPlayer, sessionService: ss });
    const r = await run(mw, launch());
    assert.equal(r.called, true);
    assert.equal(r.req.inhouseSessionRestarted, false);
    assert.equal(ss.calls.begin.length, 1);
    assert.equal(ss.calls.begin[0].userId, 'u1');
    assert.equal(ss.calls.begin[0].gameId, 'crash');
  });

  it('launch: tavan aşıldıysa req.inhouseSessionRestarted = true', async () => {
    const ss = fakeSessionService();
    ss.beginInhouseSession = async (a) => { ss.calls.begin.push(a); return { session: {}, restarted: true }; };
    const mw = enforceInhouseSessionLimit({ findUser, findPlayer, sessionService: ss });
    const r = await run(mw, launch());
    assert.equal(r.req.inhouseSessionRestarted, true);
  });

  it('launch oturumsuz isteği geçirir (kimlik doğrulama route’un işi)', async () => {
    const ss = fakeSessionService();
    const mw = enforceInhouseSessionLimit({ findUser, findPlayer, sessionService: ss });
    const r = await run(mw, launch({ user: null }));
    assert.equal(r.called, true);
    assert.equal(ss.calls.begin.length, 0);
  });

  it('debit: sayaç güncellenir ve tur geçer', async () => {
    const ss = fakeSessionService({ active: { startedAt: new Date() } });
    const mw = enforceInhouseSessionLimit({ findUser, findPlayer, sessionService: ss });
    const r = await run(mw, debit());
    assert.equal(r.called, true);
    assert.equal(ss.calls.touch.length, 1);
    assert.equal(ss.calls.touch[0].userId, 'u1');
    assert.equal(ss.calls.touch[0].bet, 50);
  });

  it('debit: oturum tavanı aşıldıysa oturum kapanır ve bahis reddedilir', async () => {
    const ss = fakeSessionService({ active: { startedAt: new Date(Date.now() - 6 * 3600_000) }, expired: true });
    const mw = enforceInhouseSessionLimit({ findUser, findPlayer, sessionService: ss });
    const r = await run(mw, debit());
    assert.equal(r.called, false);
    assert.equal(r.res.statusCode, 403);
    assert.deepEqual(r.res.body, { approved: false, reason: 'SESSION_LIMIT_REACHED' });
    assert.equal(ss.calls.close.length, 1);
    assert.equal(ss.calls.close[0].reason, 'max_duration');
    assert.equal(ss.calls.touch.length, 0);
  });

  it('debit: oyuncunun kendi limiti platform varsayılanından kısaysa oyuncu limiti uygulanır', async () => {
    const ss = fakeSessionService({ active: { startedAt: new Date() } });
    const mw = enforceInhouseSessionLimit({
      findUser: async () => ({ responsibleLimits: { sessionTimeoutMin: 30 } }),
      findPlayer,
      sessionService: ss,
    });
    await run(mw, debit());
    assert.deepEqual(ss.calls.limit, [30]);
  });

  it('debit: oyuncu çözülemezse bu katman müdahale etmez (RB aşılır, round-limits katmanı devralır)', async () => {
    const ss = fakeSessionService({ active: { startedAt: new Date() } });
    const mw = enforceInhouseSessionLimit({ findUser, findPlayer, sessionService: ss });
    const r = await run(mw, debit({ body: { type: 'debit' } }));
    assert.equal(r.called, true);
    assert.equal(ss.calls.touch.length, 0);
  });

  it('settle gövdesi oturum denetimine girmez', async () => {
    const ss = fakeSessionService({ expired: true });
    const mw = enforceInhouseSessionLimit({ findUser, findPlayer, sessionService: ss });
    const r = await run(mw, { path: '/callback', user: null, body: { type: 'settle', externalPlayerId: 'u1', payout: 100 } });
    assert.equal(r.called, true);
    assert.equal(r.res.body, null);
  });

  it('limit çözümü DB hatasında varsayılana düşer (fail-open)', async () => {
    const ss = fakeSessionService({ active: { startedAt: new Date() } });
    const mw = enforceInhouseSessionLimit({ findUser: async () => { throw new Error('mongo down'); }, findPlayer, sessionService: ss });
    const r = await run(mw, debit());
    assert.equal(r.called, true);
    assert.deepEqual(ss.calls.limit, [null]);
  });
});