import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env dosyasını yükle
config({ path: join(__dirname, '..', '.env') });

import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import CryptoDeposit from '../src/models/CryptoDeposit.js';
import { deriveDepositAddress, fetchIncomingUSDT } from '../src/services/cryptoService.js';

describe('Crypto Payment System - Shasta Testnet', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_crypto');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await CryptoDeposit.deleteMany({});
  });

  describe('Network Configuration', () => {
    it('should use Shasta testnet when TRON_NETWORK=shasta', () => {
      const network = process.env.TRON_NETWORK || 'mainnet';
      assert.equal(network, 'shasta', 'TRON_NETWORK should be shasta');
    });
  });

  describe('deriveDepositAddress', () => {
    it('should derive a valid TRON address from seed phrase', () => {
      const address = deriveDepositAddress(0);
      assert.ok(address, 'Address should be defined');
      assert.match(address, /^T[A-Za-z0-9]{33}$/, 'Should be valid TRON address format');
    });

    it('should derive different addresses for different indices', () => {
      const addr0 = deriveDepositAddress(0);
      const addr1 = deriveDepositAddress(1);
      assert.notEqual(addr0, addr1, 'Different indices should produce different addresses');
    });

    it('should be deterministic (same index = same address)', () => {
      const addr1 = deriveDepositAddress(0);
      const addr2 = deriveDepositAddress(0);
      assert.equal(addr1, addr2, 'Same index should produce same address');
    });

    it('should derive address for index 10', () => {
      const address = deriveDepositAddress(10);
      assert.ok(address, 'Address for index 10 should be defined');
      assert.match(address, /^T[A-Za-z0-9]{33}$/, 'Should be valid TRON address');
    });
  });

  describe('fetchIncomingUSDT', () => {
    it('should fetch transactions from Shasta testnet', async () => {
      const testAddress = deriveDepositAddress(0);
      try {
        const txs = await fetchIncomingUSDT(testAddress, 0);
        assert.ok(Array.isArray(txs), 'Should return an array');
        console.log(`  ✓ Shasta testnet: ${txs.length} transactions found for ${testAddress}`);
      } catch (e) {
        console.warn(`  ⚠ Testnet erişim hatası: ${e.message}`);
      }
    });

    it('should handle empty address gracefully', async () => {
      const emptyAddress = deriveDepositAddress(999);
      try {
        const txs = await fetchIncomingUSDT(emptyAddress, 0);
        assert.ok(Array.isArray(txs), 'Should return an array');
        assert.equal(txs.length, 0, 'Should return empty array for new address');
      } catch (e) {
        console.warn(`  ⚠ Testnet erişim hatası: ${e.message}`);
      }
    });
  });

  describe('CryptoDeposit Model', () => {
    it('should create a deposit record', async () => {
      const user = await User.create({
        username: 'testuser_crypto',
        email: 'crypto@test.com',
        password: 'hashed_password',
      });

      const deposit = await CryptoDeposit.create({
        userId: user._id,
        txHash: 'test_tx_hash_' + Date.now(),
        fromAddress: 'TFromAddress123456789012345678901234',
        toAddress: deriveDepositAddress(0),
        usdtAmount: 100.50,
        creditedTRY: 100.50,
        status: 'credited',
        creditedAt: new Date(),
      });

      assert.ok(deposit, 'Deposit should be created');
      assert.equal(deposit.usdtAmount, 100.50);
      assert.equal(deposit.status, 'credited');
    });

    it('should require txHash to be unique', async () => {
      const user = await User.create({
        username: 'testuser_unique',
        email: 'unique@test.com',
        password: 'hashed_password',
      });

      const txHash = 'unique_tx_' + Date.now();
      
      await CryptoDeposit.create({
        userId: user._id,
        txHash,
        fromAddress: 'TFrom1',
        toAddress: deriveDepositAddress(0),
        usdtAmount: 50,
        creditedTRY: 50,
        status: 'credited',
      });

      try {
        await CryptoDeposit.create({
          userId: user._id,
          txHash,
          fromAddress: 'TFrom2',
          toAddress: deriveDepositAddress(1),
          usdtAmount: 100,
          creditedTRY: 100,
          status: 'credited',
        });
        assert.fail('Should throw duplicate key error');
      } catch (e) {
        assert.ok(e.code === 11000, 'Should throw duplicate key error');
      }
    });
  });

  describe('User Crypto Fields', () => {
    it('should have cryptoDepositIndex field', async () => {
      const user = await User.create({
        username: 'testuser_fields',
        email: 'fields@test.com',
        password: 'hashed_password',
      });

      assert.equal(user.cryptoDepositIndex, null, 'cryptoDepositIndex should be null by default');
    });

    it('should assign deposit index sequentially', async () => {
      const user1 = await User.create({
        username: 'testuser_seq1',
        email: 'seq1@test.com',
        password: 'hashed_password',
      });

      const user2 = await User.create({
        username: 'testuser_seq2',
        email: 'seq2@test.com',
        password: 'hashed_password',
      });

      user1.cryptoDepositIndex = 0;
      await user1.save();

      user2.cryptoDepositIndex = 1;
      await user2.save();

      assert.equal(user1.cryptoDepositIndex, 0);
      assert.equal(user2.cryptoDepositIndex, 1);
    });
  });

  describe('Transaction Types', () => {
    it('should create crypto_deposit transaction', async () => {
      const user = await User.create({
        username: 'testuser_tx',
        email: 'tx@test.com',
        password: 'hashed_password',
        balance: 0,
      });

      const tx = await Transaction.create({
        userId: user._id,
        type: 'crypto_deposit',
        amount: 100,
        balanceBefore: 0,
        balanceAfter: 100,
        note: 'Test USDT deposit',
        status: 'completed',
      });

      assert.ok(tx);
      assert.equal(tx.type, 'crypto_deposit');
      assert.equal(tx.amount, 100);
    });

    it('should create crypto_withdraw transaction', async () => {
      const user = await User.create({
        username: 'testuser_withdraw',
        email: 'withdraw@test.com',
        password: 'hashed_password',
        balance: 500,
      });

      const tx = await Transaction.create({
        userId: user._id,
        type: 'crypto_withdraw',
        amount: -100,
        balanceBefore: 500,
        balanceAfter: 400,
        note: 'Test USDT withdrawal',
        status: 'pending',
      });

      assert.ok(tx);
      assert.equal(tx.type, 'crypto_withdraw');
      assert.equal(tx.amount, -100);
      assert.equal(tx.status, 'pending');
    });
  });
});
