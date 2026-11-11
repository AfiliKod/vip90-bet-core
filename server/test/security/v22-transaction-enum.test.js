import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Transaction from '../../src/models/Transaction.js';
import { createReversal, createTransaction, isDuplicateTransaction } from '../../src/services/ledger.js';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v22_tx_enum_test';

let connected = false;
try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
const opts = { skip: !connected && 'MongoDB not available' };
after(async () => { if (connected) { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); } });

async function mkUser(balance) {
  const n = `v22u_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  return User.create({ username: n, email: `${n}@example.test`, password: 'x', balance });
}

describe('V22 Transaction type enum', () => {
  it('createReversal writes a reversal row and restores the balance', opts, async () => {
    const user = await mkUser(100);
    const orig = await Transaction.create({
      userId: user._id, type: 'deposit', amount: 100, balanceBefore: 0, balanceAfter: 100,
    });
    const reversal = await createReversal(orig._id, 'test');
    assert.equal(reversal.type, 'reversal');
    assert.equal(reversal.amount, -100);
    assert.equal(String(reversal.relatedTransactionId), String(orig._id));
    assert.equal((await User.findById(user._id)).balance, 0);
  });

  it('createReversal refuses to reverse a reversal', opts, async () => {
    const user = await mkUser(50);
    const orig = await Transaction.create({
      userId: user._id, type: 'deposit', amount: 50, balanceBefore: 0, balanceAfter: 50,
    });
    const reversal = await createReversal(orig._id, 'test');
    await assert.rejects(() => createReversal(reversal._id, 'again'), /Cannot reverse a reversal/);
  });

  it('a transaction can only be reversed once (balance untouched on retry)', opts, async () => {
    const user = await mkUser(70);
    const orig = await Transaction.create({
      userId: user._id, type: 'deposit', amount: 70, balanceBefore: 0, balanceAfter: 70,
    });
    await createReversal(orig._id, 'first');
    await assert.rejects(() => createReversal(orig._id, 'second'), /already reversed/);
    assert.equal((await User.findById(user._id)).balance, 0);
  });

  it('concurrent createReversal: exactly one reversal, balance moved once', opts, async () => {
    const user = await mkUser(40);
    const orig = await Transaction.create({
      userId: user._id, type: 'deposit', amount: 40, balanceBefore: 0, balanceAfter: 40,
    });
    const res = await Promise.allSettled([createReversal(orig._id, 'a'), createReversal(orig._id, 'b')]);
    assert.equal(res.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(res.filter(r => r.status === 'rejected').length, 1);
    assert.equal(await Transaction.countDocuments({ type: 'reversal', relatedTransactionId: orig._id }), 1);
    assert.equal((await User.findById(user._id)).balance, 0);
  });

  it('keyless createTransaction calls do not collide and store no idempotencyKey', opts, async () => {
    const user = await mkUser(0);
    const mk = () => createTransaction({ userId: user._id, type: 'bonus', amount: 1, balanceBefore: 0, balanceAfter: 1 });
    const a = await mk();
    const b = await mk();
    for (const r of [a, b]) {
      const raw = await Transaction.collection.findOne({ _id: r.transaction._id });
      assert.ok(!('idempotencyKey' in raw));
    }
  });

  it('keyed duplicates: out of a txn returns idempotent, in a txn throws', opts, async () => {
    const user = await mkUser(0);
    const key = `v22-key-${Date.now()}`;
    const data = { userId: user._id, type: 'bonus', amount: 1, balanceBefore: 0, balanceAfter: 1, idempotencyKey: key };
    const first = await createTransaction(data);
    const second = await createTransaction(data);
    assert.equal(second.idempotent, true);
    assert.equal(String(second.transaction._id), String(first.transaction._id));
    const session = await mongoose.startSession();
    try {
      await assert.rejects(
        () => session.withTransaction(() => createTransaction(data, { session })),
        (e) => isDuplicateTransaction(e),
      );
    } finally { await session.endSession(); }
  });

  for (const type of ['casino_bet', 'casino_win', 'casino_cancel', 'reversal']) {
    it(`${type} passes schema validation`, async () => {
      const doc = new Transaction({
        userId: new mongoose.Types.ObjectId(), type, amount: 1, balanceBefore: 0, balanceAfter: 1,
      });
      assert.equal(doc.validateSync(), undefined);
    });
  }

  it('unknown types are still rejected', async () => {
    const doc = new Transaction({
      userId: new mongoose.Types.ObjectId(), type: 'bogus', amount: 1, balanceBefore: 0, balanceAfter: 1,
    });
    assert.ok(doc.validateSync()?.errors?.type);
  });
});
