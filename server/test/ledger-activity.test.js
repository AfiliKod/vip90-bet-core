import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { createTransaction } from '../src/services/ledger.js';

// createTransaction, logActivity'i fire-and-forget çağırıyor (brief: gerçek
// işlem asla activity logging'i beklememeli). Bu yüzden insert ile find
// arasındaki yarışı deterministik hale getirmek için pozitif assertion'larda
// poll, negatif assertion'da kısa bir settle süresi kullanıyoruz.
async function waitForEvents(query, { timeoutMs = 2000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const events = await ActivityEvent.find(query);
    if (events.length > 0 || Date.now() >= deadline) return events;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function settle(ms = 300) {
  await new Promise((r) => setTimeout(r, ms));
}

describe('ledger — createTransaction activity entegrasyonu', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_ledger_activity');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it("type='deposit' bir Transaction oluşunca ActivityEvent(type='deposit') yazılır", async () => {
    const user = await User.create({ username: 'txuser1', email: 'txuser1@test.com', password: 'x', balance: 100 });
    await createTransaction({
      userId: user._id, type: 'deposit', amount: 50, balanceBefore: 50, balanceAfter: 100,
      status: 'completed', note: 'test yatırma',
    });

    const events = await waitForEvents({ userId: user._id, type: 'deposit' });
    assert.equal(events.length, 1);
    assert.equal(events[0].amount, 50);
    assert.equal(events[0].referenceModel, 'Transaction');
  });

  it("type='withdraw' bir Transaction oluşunca ActivityEvent(type='withdraw') yazılır", async () => {
    const user = await User.create({ username: 'txuser2', email: 'txuser2@test.com', password: 'x', balance: 50 });
    await createTransaction({
      userId: user._id, type: 'withdraw', amount: -50, balanceBefore: 100, balanceAfter: 50, status: 'completed',
    });

    const events = await waitForEvents({ userId: user._id, type: 'withdraw' });
    assert.equal(events.length, 1);
  });

  it("bet/win gibi diğer type'lar için ActivityEvent(deposit/withdraw) YAZILMAZ", async () => {
    const user = await User.create({ username: 'txuser3', email: 'txuser3@test.com', password: 'x', balance: 50 });
    await createTransaction({
      userId: user._id, type: 'bet', amount: -10, balanceBefore: 60, balanceAfter: 50, status: 'completed',
    });

    await settle();
    const events = await ActivityEvent.find({ userId: user._id });
    assert.equal(events.length, 0);
  });
});
