// V19b — no platform withdrawal while an igames session is open (active or
// closing): the close sets balance = max(balance, withdrawn), so cashing out
// in-session wins before the close would be paid twice. Covers the transfer
// withdraw, the bank withdraw request and the crypto withdraw request.
// Needs no igames module (CasinoSession lives in bet); skips without MongoDB.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v19b_withdraw_guard_test';
process.env.JWT_SECRET ||= 'v19b-guard-secret';

let connected = false;
try {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  connected = Boolean(hello.setName);
  if (!connected) await mongoose.disconnect();
} catch { /* skip */ }
const opts = { skip: !connected && 'MongoDB replica set not available' };

let User, CasinoSession, BankDepositRequest, txCtrl, bankCtrl, server, base;
let seq = 0;

before(async () => {
  if (opts.skip) return;
  ({ default: User } = await import('../../src/models/User.js'));
  ({ default: CasinoSession } = await import('../../src/models/CasinoSession.js'));
  ({ default: BankDepositRequest } = await import('../../src/models/BankDepositRequest.js'));
  txCtrl = await import('../../src/controllers/transactions.js');
  bankCtrl = await import('../../src/controllers/bank.js');
  const { default: cryptoRoutes } = await import('../../src/routes/crypto.js');
  const { errorHandler } = await import('../../src/middleware/error.js');
  const app = express();
  app.use(express.json());
  app.use('/api/crypto', cryptoRoutes);
  app.use(errorHandler);
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (connected) { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); }
});

async function mkUser(balance) {
  seq += 1;
  const n = `v19bg_${Date.now()}_${seq}`;
  return User.create({ username: n, email: `${n}@example.test`, password: 'pass12345', balance });
}
const mkSession = (user, status) => CasinoSession.create({
  userId: user._id, palaceUserCode: `pc_${seq}`, gameId: 'g1', initialBalance: 100,
  transferredAt: new Date(), status,
});

// Runs an Express controller; resolves with { status, body } or { error }.
function run(ctrl, user, validated) {
  return new Promise((resolve) => {
    const res = { statusCode: 200 };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { resolve({ status: res.statusCode, body: b }); return res; };
    ctrl({ user: { id: String(user._id) }, validated, body: validated }, res, (error) => resolve({ error }));
  });
}

async function cryptoWithdraw(user, usdtAmount) {
  const token = jwt.sign({ id: String(user._id), role: 'user', tokenVersion: 0 }, process.env.JWT_SECRET);
  const r = await fetch(`${base}/api/crypto/withdraw-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ address: 'T' + 'B'.repeat(33), usdtAmount }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

describe('V19b withdrawals refused while an igames session is open', () => {
  for (const status of ['active', 'closing']) {
    it(`transfer withdraw: 409 while ${status}, allowed after close`, opts, async () => {
      const user = await mkUser(100);
      const s = await mkSession(user, status);
      const refused = await run(txCtrl.withdraw, user, { amount: 30 });
      assert.equal(refused.error?.status, 409);
      assert.equal(refused.error?.code, 'IGAMES_SESSION_OPEN');
      assert.equal((await User.findById(user._id)).balance, 100);

      await CasinoSession.updateOne({ _id: s._id }, { $set: { status: 'closed' } });
      const allowed = await run(txCtrl.withdraw, user, { amount: 30 });
      assert.equal(allowed.error, undefined, allowed.error?.message);
      assert.equal((await User.findById(user._id)).balance, 70);
    });

    it(`bank withdraw request: 409 while ${status}, allowed after close`, opts, async () => {
      const user = await mkUser(100);
      const s = await mkSession(user, status);
      const refused = await run(bankCtrl.createWithdraw, user, { amount: 30, iban: 'TR000000000000000000000000', fullName: 'Test User' });
      assert.equal(refused.error?.code, 'IGAMES_SESSION_OPEN');
      assert.equal(await BankDepositRequest.countDocuments({ userId: user._id }), 0);

      await CasinoSession.updateOne({ _id: s._id }, { $set: { status: 'closed' } });
      const allowed = await run(bankCtrl.createWithdraw, user, { amount: 30, iban: 'TR000000000000000000000000', fullName: 'Test User' });
      assert.equal(allowed.error, undefined, allowed.error?.message);
      assert.equal(allowed.status, 201);
      assert.equal(await BankDepositRequest.countDocuments({ userId: user._id }), 1);
    });

    it(`crypto withdraw request: 409 while ${status}, guard passes after close`, opts, async () => {
      const user = await mkUser(100);
      const s = await mkSession(user, status);
      const refused = await cryptoWithdraw(user, 1);
      assert.equal(refused.status, 409);
      assert.equal(refused.body.error?.code, 'IGAMES_SESSION_OPEN');

      await CasinoSession.updateOne({ _id: s._id }, { $set: { status: 'closed' } });
      // Below the minimum: the request now reaches the amount checks (no chain call).
      const after = await cryptoWithdraw(user, 0.01);
      assert.notEqual(after.body.error?.code, 'IGAMES_SESSION_OPEN');
      assert.equal(after.status, 400);
    });
  }

  it('a flagged (needsReconciliation) session answers IGAMES_SESSION_REVIEW', opts, async () => {
    const user = await mkUser(100);
    const s = await mkSession(user, 'closing');
    await CasinoSession.updateOne({ _id: s._id }, { $set: { needsReconciliation: true } });
    const refused = await run(txCtrl.withdraw, user, { amount: 30 });
    assert.equal(refused.error?.status, 409);
    assert.equal(refused.error?.code, 'IGAMES_SESSION_REVIEW');
    const crypto = await cryptoWithdraw(user, 1);
    assert.equal(crypto.body.error?.code, 'IGAMES_SESSION_REVIEW');
    assert.equal((await User.findById(user._id)).balance, 100);
  });
});
