import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Transaction from '../src/models/Transaction.js';
import User from '../src/models/User.js';
import { createTransaction, getTransactionHistory, getTransactionStats } from '../src/services/ledger.js';

describe('Ledger Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_ledger');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Transaction.deleteMany({});
    await User.deleteMany({});
  });

  describe('createTransaction', () => {
    it('should create a transaction with idempotency key', async () => {
      const user = await User.create({ username: 'testuser', email: 'test@test.com', password: 'pass123' });
      
      const tx1 = await createTransaction({
        userId: user._id,
        type: 'deposit',
        amount: 100,
        balanceBefore: 0,
        balanceAfter: 100,
        idempotencyKey: 'test-key-1',
      });

      const tx2 = await createTransaction({
        userId: user._id,
        type: 'deposit',
        amount: 100,
        balanceBefore: 0,
        balanceAfter: 100,
        idempotencyKey: 'test-key-1',
      });

      assert.equal(tx1.idempotent, false);
      assert.equal(tx2.idempotent, true);
      assert.equal(tx1.transaction._id.toString(), tx2.transaction._id.toString());
    });

    it('should create transaction with all ledger fields', async () => {
      const user = await User.create({ username: 'testuser', email: 'test@test.com', password: 'pass123' });
      
      const tx = await createTransaction({
        userId: user._id,
        type: 'bet',
        amount: -50,
        balanceBefore: 100,
        balanceAfter: 50,
        currency: 'TRY',
        source: 'player',
        metadata: { gameId: 'crash' },
        walletId: 'main',
      });

      assert.equal(tx.transaction.currency, 'TRY');
      assert.equal(tx.transaction.source, 'player');
      assert.equal(tx.transaction.metadata.gameId, 'crash');
      assert.equal(tx.transaction.walletId, 'main');
    });
  });

  describe('getTransactionHistory', () => {
    it('should return paginated transaction history', async () => {
      const user = await User.create({ username: 'testuser', email: 'test@test.com', password: 'pass123' });
      
      for (let i = 0; i < 5; i++) {
        await createTransaction({
          userId: user._id,
          type: 'bet',
          amount: -10,
          balanceBefore: 100 - i * 10,
          balanceAfter: 90 - i * 10,
          idempotencyKey: `bet-${i}`,
        });
      }

      const result = await getTransactionHistory(user._id, { page: 1, limit: 3 });
      
      assert.equal(result.transactions.length, 3);
      assert.equal(result.total, 5);
      assert.equal(result.pages, 2);
    });

    it('should filter by transaction type', async () => {
      const user = await User.create({ username: 'testuser', email: 'test@test.com', password: 'pass123' });
      
      await createTransaction({ userId: user._id, type: 'deposit', amount: 100, balanceBefore: 0, balanceAfter: 100, idempotencyKey: 'dep-1' });
      await createTransaction({ userId: user._id, type: 'bet', amount: -50, balanceBefore: 100, balanceAfter: 50, idempotencyKey: 'bet-1' });
      await createTransaction({ userId: user._id, type: 'win', amount: 75, balanceBefore: 50, balanceAfter: 125, idempotencyKey: 'win-1' });

      const result = await getTransactionHistory(user._id, { type: 'bet' });
      
      assert.equal(result.transactions.length, 1);
      assert.equal(result.transactions[0].type, 'bet');
    });
  });

  describe('getTransactionStats', () => {
    it('should return transaction statistics', async () => {
      const user = await User.create({ username: 'testuser', email: 'test@test.com', password: 'pass123' });
      
      await createTransaction({ userId: user._id, type: 'deposit', amount: 100, balanceBefore: 0, balanceAfter: 100, idempotencyKey: 'dep-stat-1' });
      await createTransaction({ userId: user._id, type: 'bet', amount: -50, balanceBefore: 100, balanceAfter: 50, idempotencyKey: 'bet-stat-1' });
      await createTransaction({ userId: user._id, type: 'win', amount: 75, balanceBefore: 50, balanceAfter: 125, idempotencyKey: 'win-stat-1' });

      const stats = await getTransactionStats(user._id);
      
      assert.ok(Array.isArray(stats));
      assert.ok(stats.length >= 1);
    });
  });
});
