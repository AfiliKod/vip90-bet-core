import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enforceInhouseRoundLimits } from '../src/middleware/inhouseRoundLimits.js';

/** Sahte res: durum + JSON gövdesini yakalar. */
function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const debit = (over = {}) => ({
  body: { type: 'debit', txnId: 't1', roundId: 'r1', externalPlayerId: 'u1', gameId: 'crash', amount: 50, bet: 50, ...over },
});

const run = async (mw, req) => {
  const res = fakeRes();
  let nextArg; let called = false;
  await mw(req, res, (e) => { called = true; nextArg = e; });
  return { called, nextArg, res };
};

describe('enforceInhouseRoundLimits', () => {
  const mk = (eligibility, user = { _id: 'u1' }) => enforceInhouseRoundLimits({
    checkEligibility: async () => eligibility,
    findUser: async () => user,
  });

  it('ALLOW ise geçirir ve denetimi gerçekten çağırır', async () => {
    let seen;
    const mw = enforceInhouseRoundLimits({
      checkEligibility: async (id, action, ctx) => { seen = { id, action, ctx }; return 'ALLOW'; },
      findUser: async () => ({ _id: 'u1' }),
    });
    const { called, res } = await run(mw, debit());
    assert.equal(called, true);
    assert.equal(res.body, null);
    assert.deepEqual(seen, { id: 'u1', action: 'bet', ctx: { amount: 50 } });
  });

  it('BLOCK → 403 { approved:false, reason:ACCOUNT_RESTRICTED }', async () => {
    const { res } = await run(mk('BLOCK'), debit());
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { approved: false, reason: 'ACCOUNT_RESTRICTED' });
  });

  it('RESTRICT → 403 { approved:false, reason:RESPONSIBLE_GAMING_LIMIT }', async () => {
    const { res } = await run(mk('RESTRICT'), debit());
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { approved: false, reason: 'RESPONSIBLE_GAMING_LIMIT' });
  });

  it('settle gövdesini denetlemez (kabul/ödeme yolu kapanmaz)', async () => {
    let called = false;
    const mw = enforceInhouseRoundLimits({ checkEligibility: async () => { called = true; return 'BLOCK'; } });
    const { nextArg } = await run(mw, { body: { type: 'settle', externalPlayerId: 'u1', payout: 90 } });
    assert.equal(called, false);
    assert.equal(nextArg, undefined);
  });

  it('balance gövdesini denetlemez', async () => {
    let called = false;
    const mw = enforceInhouseRoundLimits({ checkEligibility: async () => { called = true; return 'BLOCK'; } });
    await run(mw, { body: { type: 'balance', externalPlayerId: 'u1' } });
    assert.equal(called, false);
  });

  it('denetim hatası → next(err): hesaplanamayan limit "oynama" anlamına gelmez', async () => {
    const mw = enforceInhouseRoundLimits({ checkEligibility: async () => { throw new Error('rg down'); } });
    const { called, nextArg } = await run(mw, debit());
    assert.equal(called, true);
    assert.match(nextArg.message, /rg down/);
  });

  it('userId doğrudan ObjectId string ise findUser çağrılmadan kullanılır', async () => {
    let seenId;
    const mw = enforceInhouseRoundLimits({
      checkEligibility: async (id) => { seenId = id; return 'ALLOW'; },
    });
    await run(mw, debit({ externalPlayerId: '507f1f77bcf86cd799439011' }));
    assert.equal(seenId, '507f1f77bcf86cd799439011');
  });

  it('body oyuncu/tutar yoksa geçirir (deliberate: eksik veriyle oyuncu kilitleme)', async () => {
    let called = false;
    const mw = enforceInhouseRoundLimits({ checkEligibility: async () => { called = true; return 'BLOCK'; } });
    const { nextArg } = await run(mw, { body: { type: 'debit' } });
    assert.equal(called, false);
    assert.equal(nextArg, undefined);
  });
});