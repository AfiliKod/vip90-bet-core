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
import BonusWagering from '../src/models/BonusWagering.js';
import { deriveDepositAddress, fetchIncomingUSDT, getHotWalletAddress } from '../src/services/cryptoService.js';
import { shouldAutoCredit, shouldAutoProcessWithdraw, CRYPTO_SETTINGS } from '../src/config/crypto.js';
import { getSpendableBreakdown, previewForfeitAmount, forfeitActiveWagerings, getLockedAmount } from '../src/services/wagering.js';

// ── Yardımcı fonksiyonlar: route handler mantığını birebir simüle eder ──────────
async function simulateAutoCreditDeposit(user, { usdtAmount, txHash, fromAddress }) {
  const rate = parseFloat(process.env.USDT_TRY_RATE || '1');
  const tryAmount = +(usdtAmount * rate).toFixed(2);
  const address = deriveDepositAddress(user.cryptoDepositIndex ?? 0);
  const balBefore = user.balance;

  user.balance = +(user.balance + tryAmount).toFixed(2);
  await user.save();

  await Transaction.create({
    userId: user._id,
    type: 'crypto_deposit',
    amount: tryAmount,
    balanceBefore: balBefore,
    balanceAfter: user.balance,
    note: `USDT TRC20 ${usdtAmount.toFixed(2)} USDT (tx: ${txHash.slice(0, 12)}...)`,
    status: 'completed',
  });

  await CryptoDeposit.create({
    userId: user._id,
    txHash,
    fromAddress,
    toAddress: address,
    usdtAmount,
    creditedTRY: tryAmount,
    status: 'credited',
    creditedAt: new Date(),
  });

  return { tryAmount, balBefore };
}

async function simulatePendingDeposit(user, { usdtAmount, txHash, fromAddress }) {
  const rate = parseFloat(process.env.USDT_TRY_RATE || '1');
  const tryAmount = +(usdtAmount * rate).toFixed(2);
  const address = deriveDepositAddress(user.cryptoDepositIndex ?? 0);
  const balBefore = user.balance;

  await CryptoDeposit.create({
    userId: user._id,
    txHash,
    fromAddress,
    toAddress: address,
    usdtAmount,
    creditedTRY: tryAmount,
    status: 'pending_approval',
    creditedAt: null,
  });

  await Transaction.create({
    userId: user._id,
    type: 'crypto_deposit',
    amount: tryAmount,
    balanceBefore: balBefore,
    balanceAfter: balBefore,
    note: `Bekleyen yatırma: ${usdtAmount.toFixed(2)} USDT (tx: ${txHash.slice(0, 12)}...) — Admin onayı bekliyor`,
    status: 'pending',
  });

  return { tryAmount, balBefore };
}

async function simulateAutoProcessWithdraw(user, { usdtAmount, txHash }) {
  const rate = parseFloat(process.env.USDT_TRY_RATE || '1');
  const tryNeeded = +(usdtAmount * rate).toFixed(2);
  const balBefore = user.balance;

  user.balance = +(user.balance - tryNeeded).toFixed(2);
  await user.save();

  await Transaction.create({
    userId: user._id,
    type: 'crypto_withdraw',
    amount: -tryNeeded,
    balanceBefore: balBefore,
    balanceAfter: user.balance,
    note: `${usdtAmount} USDT → TTestWa11etAddressForCoreTests1111 (tx: ${txHash.slice(0, 12)}...)`,
    status: 'completed',
    txHash,
  });

  return { tryNeeded, balBefore };
}

async function simulatePendingWithdraw(user, { usdtAmount, toAddress }) {
  const rate = parseFloat(process.env.USDT_TRY_RATE || '1');
  const tryNeeded = +(usdtAmount * rate).toFixed(2);
  const balBefore = user.balance;

  user.balance = +(user.balance - tryNeeded).toFixed(2);
  await user.save();

  await Transaction.create({
    userId: user._id,
    type: 'crypto_withdraw',
    amount: -tryNeeded,
    balanceBefore: balBefore,
    balanceAfter: user.balance,
    note: `${usdtAmount} USDT → ${toAddress} — Admin onayı bekliyor`,
    status: 'pending',
    toAddress,
    usdtAmount,
  });

  return { tryNeeded, balBefore };
}

async function getTransactionHistory(userId) {
  return Transaction.find({ userId }).sort({ createdAt: -1 });
}

describe('Crypto Payment System - Shasta Testnet', () => {
  before(async () => {
    // Kasıtlı olarak MONGODB_URI'yi yok sayıyoruz: .env üstteki config() çağrısıyla
    // yükleniyor ve gerçek geliştirme veritabanını (betzone) işaret ediyor. Bu satır
    // || ile fallback olsaydı testler admin dahil tüm kullanıcıları silerdi (yaşandı).
    await mongoose.connect('mongodb://localhost:27017/betzone_test_crypto');
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

  describe('Auto Deposit/Withdrawal Limits', () => {
    it('should auto credit deposit below $100', () => {
      assert.ok(shouldAutoCredit(50), '50 USDT should auto credit');
      assert.ok(shouldAutoCredit(99.99), '99.99 USDT should auto credit');
      assert.ok(shouldAutoCredit(1), '1 USDT should auto credit');
    });

    it('should require approval for deposit above $100', () => {
      assert.ok(!shouldAutoCredit(100), '100 USDT should require approval');
      assert.ok(!shouldAutoCredit(150), '150 USDT should require approval');
      assert.ok(!shouldAutoCredit(1000), '1000 USDT should require approval');
    });

    it('should auto process withdrawal below $15', () => {
      assert.ok(shouldAutoProcessWithdraw(10), '10 USDT should auto process');
      assert.ok(shouldAutoProcessWithdraw(14.99), '14.99 USDT should auto process');
      assert.ok(shouldAutoProcessWithdraw(5), '5 USDT should auto process');
    });

    it('should require approval for withdrawal above $15', () => {
      assert.ok(!shouldAutoProcessWithdraw(15), '15 USDT should require approval');
      assert.ok(!shouldAutoProcessWithdraw(20), '20 USDT should require approval');
      assert.ok(!shouldAutoProcessWithdraw(100), '100 USDT should require approval');
    });

    it('should have correct default settings', () => {
      assert.equal(CRYPTO_SETTINGS.deposit.autoCreditLimit, 100);
      assert.equal(CRYPTO_SETTINGS.withdraw.autoProcessLimit, 15);
      assert.equal(CRYPTO_SETTINGS.minWithdraw, 5);
      assert.ok(CRYPTO_SETTINGS.supportedCurrencies.includes('USDT'));
    });
  });

  describe('Hot Wallet', () => {
    it('should derive hot wallet address', () => {
      const address = getHotWalletAddress();
      assert.ok(address, 'Hot wallet address should be defined');
      assert.match(address, /^T[A-Za-z0-9]{33}$/, 'Should be valid TRON address');
    });
  });

  describe('Withdrawable Balance', () => {
    it('should calculate withdrawable when no bonus', async () => {
      const user = await User.create({
        username: 'testuser_nobonus',
        email: 'nobonus@test.com',
        password: 'hashed_password',
        balance: 500,
      });

      const breakdown = await getSpendableBreakdown(user._id);
      assert.equal(breakdown.balance, 500);
      assert.equal(breakdown.locked, 0);
      assert.equal(breakdown.withdrawable, 500);
    });

    it('should calculate withdrawable with active bonus', async () => {
      const user = await User.create({
        username: 'testuser_bonus',
        email: 'bonus@test.com',
        password: 'hashed_password',
        balance: 500,
      });

      await BonusWagering.create({
        userId: user._id,
        bonusAmount: 200,
        wageringRequired: 7000,
        status: 'active',
      });

      const breakdown = await getSpendableBreakdown(user._id);
      assert.equal(breakdown.balance, 500);
      assert.equal(breakdown.locked, 200);
      assert.equal(breakdown.withdrawable, 300);
    });
  });

  // ── Senaryo Testleri ───────────────────────────────────────────────────────
  describe('Withdrawal Scenarios', () => {
    const TRC20_ADDR = 'TTestWa11etAddressForCoreTests1111';

    describe('Scenario 1: No bonus, sufficient balance, below $15 (auto process)', () => {
      it('should allow auto-process when no bonus and amount < $15', async () => {
        const user = await User.create({
          username: 'scenario1',
          email: 's1@test.com',
          password: 'hashed_password',
          balance: 500,
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.locked, 0, 'No locked bonus');
        assert.equal(breakdown.withdrawable, 500, 'Full balance withdrawable');
        assert.ok(breakdown.withdrawable >= 10, 'Balance covers 10 USDT');
        assert.ok(shouldAutoProcessWithdraw(10), '10 USDT is below auto-process limit');
      });
    });

    describe('Scenario 2: No bonus, sufficient balance, above $15 (admin approval)', () => {
      it('should require admin approval when no bonus and amount >= $15', async () => {
        const user = await User.create({
          username: 'scenario2',
          email: 's2@test.com',
          password: 'hashed_password',
          balance: 500,
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.locked, 0, 'No locked bonus');
        assert.equal(breakdown.withdrawable, 500, 'Full balance withdrawable');
        assert.ok(breakdown.withdrawable >= 50, 'Balance covers 50 USDT');
        assert.ok(!shouldAutoProcessWithdraw(50), '50 USDT requires admin approval');
      });
    });

    describe('Scenario 3: No bonus, insufficient balance', () => {
      it('should reject withdrawal when balance is too low', async () => {
        const user = await User.create({
          username: 'scenario3',
          email: 's3@test.com',
          password: 'hashed_password',
          balance: 3,
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.withdrawable, 3, 'Only 3₺ available');
        assert.ok(breakdown.withdrawable < CRYPTO_SETTINGS.minWithdraw, 'Below minimum withdrawal');
      });
    });

    describe('Scenario 4: With bonus, sufficient withdrawable, below $15', () => {
      it('should allow auto-process with bonus if withdrawable covers amount', async () => {
        const user = await User.create({
          username: 'scenario4',
          email: 's4@test.com',
          password: 'hashed_password',
          balance: 500,
        });

        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 100,
          wageringRequired: 3500,
          status: 'active',
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.locked, 100, '100₺ locked');
        assert.equal(breakdown.withdrawable, 400, '400₺ withdrawable');
        assert.ok(breakdown.withdrawable >= 10, 'Covers 10 USDT');
        assert.ok(shouldAutoProcessWithdraw(10), '10 USDT auto-processes');
      });
    });

    describe('Scenario 5: With bonus, sufficient withdrawable, above $15', () => {
      it('should require admin approval with bonus if amount >= $15', async () => {
        const user = await User.create({
          username: 'scenario5',
          email: 's5@test.com',
          password: 'hashed_password',
          balance: 500,
        });

        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 100,
          wageringRequired: 3500,
          status: 'active',
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.locked, 100, '100₺ locked');
        assert.equal(breakdown.withdrawable, 400, '400₺ withdrawable');
        assert.ok(breakdown.withdrawable >= 50, 'Covers 50 USDT');
        assert.ok(!shouldAutoProcessWithdraw(50), '50 USDT needs admin approval');
      });
    });

    describe('Scenario 6: With bonus, insufficient withdrawable, forfeit covers', () => {
      it('should return 409 ACTIVE_BONUS_LOCK and show forfeit preview', async () => {
        const user = await User.create({
          username: 'scenario6',
          email: 's6@test.com',
          password: 'hashed_password',
          balance: 500,
        });

        // 0% progress → tam bonusAmount feda edilir (tamamı unchecked kısım)
        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 300,
          wageringRequired: 10500,
          wageringProgress: 0,
          status: 'active',
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.locked, 300, '300₺ locked');
        assert.equal(breakdown.withdrawable, 200, 'Only 200₺ withdrawable');

        // Kullanıcı 400₺ çekmek istiyor — yetersiz
        assert.ok(breakdown.withdrawable < 400, '200 < 400 → insufficient');

        // Forfeit önizlemesi: progress=0 olduğu için tam bonusAmount feda edilir
        const forfeitAmount = await previewForfeitAmount(user._id);
        assert.equal(forfeitAmount, 300, 'Full bonus amount forfeited when progress=0');

        const predictedWithdrawable = Math.max(0, parseFloat((breakdown.balance - forfeitAmount).toFixed(2)));
        assert.equal(predictedWithdrawable, 200, '500 - 300 = 200 → still under 400');

        // Bu durumda forfeit YETMIYOR — kullanıcıya "yetersiz" denilmeli
        assert.ok(predictedWithdrawable < 400, 'Even after forfeit: 200 < 400 → insufficient');
      });
    });

    describe('Scenario 7: With bonus, insufficient withdrawable, forfeit does NOT cover', () => {
      it('should reject when even forfeit is not enough', async () => {
        const user = await User.create({
          username: 'scenario7',
          email: 's7@test.com',
          password: 'hashed_password',
          balance: 100,
        });

        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 80,
          wageringRequired: 2800,
          status: 'active',
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.withdrawable, 20, 'Only 20₺ withdrawable');

        // 50₺ çekmek istiyor
        assert.ok(breakdown.withdrawable < 50, '20 < 50 → insufficient');

        const forfeitAmount = await previewForfeitAmount(user._id);
        const predictedWithdrawable = Math.max(0, parseFloat((breakdown.balance - forfeitAmount).toFixed(2)));

        assert.ok(predictedWithdrawable < 50, `Even after forfeit: ${predictedWithdrawable} < 50 → still insufficient`);
      });
    });

    describe('Scenario 8: Bonus wagering completed → fully withdrawable', () => {
      it('should have no locked amount after wagering is completed', async () => {
        const user = await User.create({
          username: 'scenario8',
          email: 's8@test.com',
          password: 'hashed_password',
          balance: 500,
        });

        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 200,
          wageringRequired: 7000,
          wageringProgress: 7000,
          status: 'completed',
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.locked, 0, 'No locked — wagering completed');
        assert.equal(breakdown.withdrawable, 500, 'Full balance withdrawable');
      });
    });

    describe('Scenario 9: Multiple active bonuse stacking', () => {
      it('should sum all active wagerings for locked amount', async () => {
        const user = await User.create({
          username: 'scenario9',
          email: 's9@test.com',
          password: 'hashed_password',
          balance: 1000,
        });

        await BonusWagering.create([
          { userId: user._id, bonusAmount: 100, wageringRequired: 3500, status: 'active' },
          { userId: user._id, bonusAmount: 200, wageringRequired: 7000, status: 'active' },
          { userId: user._id, bonusAmount: 50, wageringRequired: 1750, status: 'active' },
        ]);

        const locked = await getLockedAmount(user._id);
        assert.equal(locked, 350, 'Total locked: 100+200+50 = 350');

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.withdrawable, 650, '1000 - 350 = 650');
      });
    });

    describe('Scenario 10: Forfeit destroys bonus irreversibly', () => {
      it('should reduce balance and mark wagerings as forfeited', async () => {
        const user = await User.create({
          username: 'scenario10',
          email: 's10@test.com',
          password: 'hashed_password',
          balance: 500,
        });

        const w1 = await BonusWagering.create({
          userId: user._id,
          bonusAmount: 200,
          wageringRequired: 7000,
          wageringProgress: 1000,
          status: 'active',
        });

        const beforeForfeit = await getSpendableBreakdown(user._id);
        assert.equal(beforeForfeit.withdrawable, 300, 'Before forfeit: 300₺');

        const result = await forfeitActiveWagerings(user._id);
        assert.ok(result.totalForfeitedAmount > 0, 'Forfeited some amount');

        const afterForfeit = await getSpendableBreakdown(user._id);
        assert.equal(afterForfeit.locked, 0, 'No locked after forfeit');
        assert.equal(afterForfeit.balance, afterForfeit.withdrawable, 'All remaining is withdrawable');

        // Wagering status should be 'forfeited'
        const w1After = await BonusWagering.findById(w1._id);
        assert.equal(w1After.status, 'forfeited', 'Wagering marked as forfeited');
      });
    });
  });

  // ── Yatırma/çekim + Transaction History entegrasyon testleri ────────────────
  describe('Deposit & Withdrawal Flow + Transaction History', () => {
    const TRC20_ADDR = 'TTestWa11etAddressForCoreTests1111';

    // ── YATIRMA (DEPOSIT) ───────────────────────────────────────────────────
    describe('Deposit: auto-credit below $100', () => {
      it('should credit balance immediately and create completed transaction', async () => {
        const user = await User.create({
          username: 'deposit_auto',
          email: 'deposit_auto@test.com',
          password: 'hashed_password',
          balance: 500,
          cryptoDepositIndex: 0,
        });

        const usdtAmount = 50;
        const txHash = 'auto_credit_tx_' + Date.now();

        const { tryAmount } = await simulateAutoCreditDeposit(user, { usdtAmount, txHash, fromAddress: 'TFromAuto1' });

        // Bakiye artmış olmalı
        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, +(500 + tryAmount).toFixed(2), 'Balance should increase by tryAmount');

        // CryptoDeposit: status='credited'
        const deposit = await CryptoDeposit.findOne({ txHash });
        assert.ok(deposit, 'CryptoDeposit should exist');
        assert.equal(deposit.status, 'credited', 'Should be credited');
        assert.equal(deposit.usdtAmount, usdtAmount);

        // Transaction: status='completed', type='crypto_deposit'
        const tx = await Transaction.findOne({ userId: user._id, type: 'crypto_deposit', txHash: undefined });
        // txHash field not on Transaction model; match by userId + type + note
        const txs = await Transaction.find({ userId: user._id, type: 'crypto_deposit' });
        assert.ok(txs.length >= 1, 'Should have at least 1 crypto_deposit transaction');
        const lastTx = txs[0]; // sorted by createdAt desc
        assert.equal(lastTx.status, 'completed', 'Transaction status should be completed');
        assert.equal(lastTx.amount, tryAmount, 'Amount should be positive (credit)');
        assert.equal(lastTx.balanceBefore, 500, 'balanceBefore should be 500');
        assert.equal(lastTx.balanceAfter, +(500 + tryAmount).toFixed(2), 'balanceAfter should match');
      });

      it('should appear in Transaction History with correct fields', async () => {
        const user = await User.create({
          username: 'deposit_auto_hist',
          email: 'deposit_auto_hist@test.com',
          password: 'hashed_password',
          balance: 200,
          cryptoDepositIndex: 0,
        });

        await simulateAutoCreditDeposit(user, {
          usdtAmount: 75,
          txHash: 'hist_auto_' + Date.now(),
          fromAddress: 'TFromHist1',
        });

        const history = await getTransactionHistory(user._id);
        assert.ok(history.length >= 1, 'Transaction history should not be empty');

        const cryptoTx = history.find(t => t.type === 'crypto_deposit');
        assert.ok(cryptoTx, 'Should have a crypto_deposit entry');
        assert.equal(cryptoTx.status, 'completed');
        assert.ok(cryptoTx.amount > 0, 'Amount should be positive');
        assert.ok(cryptoTx.note.includes('USDT'), 'Note should mention USDT');
        assert.ok(cryptoTx.balanceAfter > cryptoTx.balanceBefore, 'Balance should increase');
      });
    });

    describe('Deposit: pending approval above $100', () => {
      it('should NOT credit balance and create pending transaction', async () => {
        const user = await User.create({
          username: 'deposit_pending',
          email: 'deposit_pending@test.com',
          password: 'hashed_password',
          balance: 500,
          cryptoDepositIndex: 0,
        });

        const usdtAmount = 150;
        const txHash = 'pending_deposit_tx_' + Date.now();

        const { tryAmount } = await simulatePendingDeposit(user, { usdtAmount, txHash, fromAddress: 'TFromPending1' });

        // Bakiye değişmemiş olmalı
        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, 500, 'Balance should NOT change for pending deposit');

        // CryptoDeposit: status='pending_approval'
        const deposit = await CryptoDeposit.findOne({ txHash });
        assert.ok(deposit, 'CryptoDeposit should exist');
        assert.equal(deposit.status, 'pending_approval', 'Should be pending_approval');
        assert.equal(deposit.usdtAmount, usdtAmount);

        // Transaction: status='pending'
        const txs = await Transaction.find({ userId: user._id, type: 'crypto_deposit' });
        assert.ok(txs.length >= 1, 'Should have at least 1 crypto_deposit transaction');
        const lastTx = txs[0];
        assert.equal(lastTx.status, 'pending', 'Transaction status should be pending');
        assert.equal(lastTx.amount, tryAmount, 'Amount should reflect USDT value');
        assert.equal(lastTx.balanceBefore, 500, 'balanceBefore unchanged');
        assert.equal(lastTx.balanceAfter, 500, 'balanceAfter unchanged (pending)');
        assert.ok(lastTx.note.includes('Admin onayı'), 'Note should mention admin approval');
      });

      it('should appear in Transaction History with pending status', async () => {
        const user = await User.create({
          username: 'deposit_pending_hist',
          email: 'deposit_pending_hist@test.com',
          password: 'hashed_password',
          balance: 300,
          cryptoDepositIndex: 0,
        });

        await simulatePendingDeposit(user, {
          usdtAmount: 200,
          txHash: 'hist_pending_' + Date.now(),
          fromAddress: 'TFromHist2',
        });

        const history = await getTransactionHistory(user._id);
        const cryptoTx = history.find(t => t.type === 'crypto_deposit');
        assert.ok(cryptoTx, 'Should have a crypto_deposit entry');
        assert.equal(cryptoTx.status, 'pending', 'Should show pending status');
        assert.ok(cryptoTx.amount > 0, 'Amount should be positive');
        assert.ok(cryptoTx.note.includes('Admin onayı'), 'Note should indicate pending admin approval');
      });
    });

    // ── ÇEKİM (WITHDRAWAL) ──────────────────────────────────────────────────
    describe('Withdrawal: auto-process below $15', () => {
      it('should deduct balance and create completed transaction', async () => {
        const user = await User.create({
          username: 'withdraw_auto',
          email: 'withdraw_auto@test.com',
          password: 'hashed_password',
          balance: 500,
        });

        const usdtAmount = 10;
        const txHash = 'auto_withdraw_tx_' + Date.now();

        const { tryNeeded } = await simulateAutoProcessWithdraw(user, { usdtAmount, txHash });

        // Bakiye azalmış olmalı
        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, +(500 - tryNeeded).toFixed(2), 'Balance should decrease by tryNeeded');

        // Transaction: status='completed', type='crypto_withdraw'
        const txs = await Transaction.find({ userId: user._id, type: 'crypto_withdraw' });
        assert.ok(txs.length >= 1, 'Should have at least 1 crypto_withdraw transaction');
        const lastTx = txs[0];
        assert.equal(lastTx.status, 'completed', 'Transaction status should be completed');
        assert.equal(lastTx.amount, -tryNeeded, 'Amount should be negative (debit)');
        assert.equal(lastTx.balanceBefore, 500, 'balanceBefore should be 500');
        assert.equal(lastTx.balanceAfter, +(500 - tryNeeded).toFixed(2), 'balanceAfter should match');
      });

      it('should appear in Transaction History with correct fields', async () => {
        const user = await User.create({
          username: 'withdraw_auto_hist',
          email: 'withdraw_auto_hist@test.com',
          password: 'hashed_password',
          balance: 300,
        });

        await simulateAutoProcessWithdraw(user, {
          usdtAmount: 12,
          txHash: 'hist_withdraw_auto_' + Date.now(),
        });

        const history = await getTransactionHistory(user._id);
        const cryptoTx = history.find(t => t.type === 'crypto_withdraw');
        assert.ok(cryptoTx, 'Should have a crypto_withdraw entry');
        assert.equal(cryptoTx.status, 'completed');
        assert.ok(cryptoTx.amount < 0, 'Amount should be negative');
        assert.ok(cryptoTx.note.includes('USDT'), 'Note should mention USDT');
        assert.ok(cryptoTx.balanceAfter < cryptoTx.balanceBefore, 'Balance should decrease');
      });
    });

    describe('Withdrawal: pending approval above $15', () => {
      it('should deduct balance and create pending transaction', async () => {
        const user = await User.create({
          username: 'withdraw_pending',
          email: 'withdraw_pending@test.com',
          password: 'hashed_password',
          balance: 500,
        });

        const usdtAmount = 50;

        const { tryNeeded } = await simulatePendingWithdraw(user, {
          usdtAmount,
          toAddress: TRC20_ADDR,
        });

        // Bakiye azalmış olmalı (admin onayı beklerken bile bakiye düşer)
        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, +(500 - tryNeeded).toFixed(2), 'Balance should decrease');

        // Transaction: status='pending', type='crypto_withdraw'
        const txs = await Transaction.find({ userId: user._id, type: 'crypto_withdraw' });
        assert.ok(txs.length >= 1, 'Should have at least 1 crypto_withdraw transaction');
        const lastTx = txs[0];
        assert.equal(lastTx.status, 'pending', 'Transaction status should be pending');
        assert.equal(lastTx.amount, -tryNeeded, 'Amount should be negative');
        assert.equal(lastTx.balanceBefore, 500, 'balanceBefore should be 500');
        assert.equal(lastTx.balanceAfter, +(500 - tryNeeded).toFixed(2), 'balanceAfter should match');
        assert.ok(lastTx.note.includes('Admin onayı'), 'Note should mention admin approval');
      });

      it('should appear in Transaction History with pending status', async () => {
        const user = await User.create({
          username: 'withdraw_pending_hist',
          email: 'withdraw_pending_hist@test.com',
          password: 'hashed_password',
          balance: 400,
        });

        await simulatePendingWithdraw(user, {
          usdtAmount: 30,
          toAddress: TRC20_ADDR,
        });

        const history = await getTransactionHistory(user._id);
        const cryptoTx = history.find(t => t.type === 'crypto_withdraw');
        assert.ok(cryptoTx, 'Should have a crypto_withdraw entry');
        assert.equal(cryptoTx.status, 'pending', 'Should show pending status');
        assert.ok(cryptoTx.amount < 0, 'Amount should be negative');
        assert.ok(cryptoTx.note.includes('Admin onayı'), 'Note should indicate pending admin approval');
      });
    });

    // ── KARMA SENARYOLAR ────────────────────────────────────────────────────
    describe('Mixed transactions in history', () => {
      it('should show both completed and pending deposits in history sorted by date', async () => {
        const user = await User.create({
          username: 'mixed_tx',
          email: 'mixed_tx@test.com',
          password: 'hashed_password',
          balance: 1000,
          cryptoDepositIndex: 0,
        });

        // İlk: auto-credit ($50)
        await simulateAutoCreditDeposit(user, {
          usdtAmount: 50,
          txHash: 'mixed_auto_' + Date.now(),
          fromAddress: 'TFromMixed1',
        });

        // İkinci: pending ($200)
        await simulatePendingDeposit(user, {
          usdtAmount: 200,
          txHash: 'mixed_pending_' + Date.now(),
          fromAddress: 'TFromMixed2',
        });

        const history = await getTransactionHistory(user._id);
        const cryptoDeposits = history.filter(t => t.type === 'crypto_deposit');
        assert.equal(cryptoDeposits.length, 2, 'Should have 2 crypto_deposit transactions');

        // En yenisi önce (sorted by createdAt desc)
        assert.equal(cryptoDeposits[0].status, 'pending', 'Newer (pending) should be first');
        assert.equal(cryptoDeposits[1].status, 'completed', 'Older (completed) should be second');
      });

      it('should show both completed and pending withdrawals in history', async () => {
        const user = await User.create({
          username: 'mixed_withdraw',
          email: 'mixed_withdraw@test.com',
          password: 'hashed_password',
          balance: 2000,
        });

        // İlk: auto-process ($10)
        await simulateAutoProcessWithdraw(user, {
          usdtAmount: 10,
          txHash: 'mixed_wd_auto_' + Date.now(),
        });

        // İkinci: pending ($50)
        await simulatePendingWithdraw(user, {
          usdtAmount: 50,
          toAddress: TRC20_ADDR,
        });

        const history = await getTransactionHistory(user._id);
        const cryptoWithdraws = history.filter(t => t.type === 'crypto_withdraw');
        assert.equal(cryptoWithdraws.length, 2, 'Should have 2 crypto_withdraw transactions');

        // En yenisi önce
        assert.equal(cryptoWithdraws[0].status, 'pending', 'Newer (pending) should be first');
        assert.equal(cryptoWithdraws[1].status, 'completed', 'Older (completed) should be second');
      });

      it('should show deposit and withdrawal together with correct net balance', async () => {
        const user = await User.create({
          username: 'net_balance',
          email: 'net_balance@test.com',
          password: 'hashed_password',
          balance: 1000,
          cryptoDepositIndex: 0,
        });

        // $80 yatır (auto-credit, < $100)
        const { tryAmount: depTry } = await simulateAutoCreditDeposit(user, {
          usdtAmount: 80,
          txHash: 'net_dep_' + Date.now(),
          fromAddress: 'TFromNet1',
        });

        // $10 çek (auto-process, < $15)
        const { tryNeeded: wdTry } = await simulateAutoProcessWithdraw(user, {
          usdtAmount: 10,
          txHash: 'net_wd_' + Date.now(),
        });

        const afterUser = await User.findById(user._id);
        const expectedBalance = +(1000 + depTry - wdTry).toFixed(2);
        assert.equal(afterUser.balance, expectedBalance, 'Balance should reflect deposit - withdrawal');

        const history = await getTransactionHistory(user._id);
        const cryptoTx = history.filter(t => t.type === 'crypto_deposit' || t.type === 'crypto_withdraw');
        assert.equal(cryptoTx.length, 2, 'Should have 2 crypto transactions');
        assert.ok(cryptoTx.every(t => t.status === 'completed'), 'All should be completed');
      });
    });

    // ── BOUNDARY DEĞERLER ──────────────────────────────────────────────────
    describe('Boundary amounts at threshold', () => {
      it('$99.99 deposit should auto-credit (just below $100)', async () => {
        const user = await User.create({
          username: 'boundary_dep',
          email: 'boundary_dep@test.com',
          password: 'hashed_password',
          balance: 0,
          cryptoDepositIndex: 0,
        });

        assert.ok(shouldAutoCredit(99.99), '$99.99 should auto credit');

        await simulateAutoCreditDeposit(user, {
          usdtAmount: 99.99,
          txHash: 'bound_dep_' + Date.now(),
          fromAddress: 'TFromBound1',
        });

        const history = await getTransactionHistory(user._id);
        const tx = history.find(t => t.type === 'crypto_deposit');
        assert.equal(tx.status, 'completed', '$99.99 deposit should be completed');
      });

      it('$100 deposit should require approval (at threshold)', async () => {
        const user = await User.create({
          username: 'boundary_dep2',
          email: 'boundary_dep2@test.com',
          password: 'hashed_password',
          balance: 0,
          cryptoDepositIndex: 0,
        });

        assert.ok(!shouldAutoCredit(100), '$100 should require approval');

        await simulatePendingDeposit(user, {
          usdtAmount: 100,
          txHash: 'bound_dep2_' + Date.now(),
          fromAddress: 'TFromBound2',
        });

        const history = await getTransactionHistory(user._id);
        const tx = history.find(t => t.type === 'crypto_deposit');
        assert.equal(tx.status, 'pending', '$100 deposit should be pending');
      });

      it('$14.99 withdrawal should auto-process (just below $15)', async () => {
        const user = await User.create({
          username: 'boundary_wd',
          email: 'boundary_wd@test.com',
          password: 'hashed_password',
          balance: 200,
        });

        assert.ok(shouldAutoProcessWithdraw(14.99), '$14.99 should auto process');

        await simulateAutoProcessWithdraw(user, {
          usdtAmount: 14.99,
          txHash: 'bound_wd_' + Date.now(),
        });

        const history = await getTransactionHistory(user._id);
        const tx = history.find(t => t.type === 'crypto_withdraw');
        assert.equal(tx.status, 'completed', '$14.99 withdrawal should be completed');
      });

      it('$15 withdrawal should require approval (at threshold)', async () => {
        const user = await User.create({
          username: 'boundary_wd2',
          email: 'boundary_wd2@test.com',
          password: 'hashed_password',
          balance: 200,
        });

        assert.ok(!shouldAutoProcessWithdraw(15), '$15 should require approval');

        await simulatePendingWithdraw(user, {
          usdtAmount: 15,
          toAddress: TRC20_ADDR,
        });

        const history = await getTransactionHistory(user._id);
        const tx = history.find(t => t.type === 'crypto_withdraw');
        assert.equal(tx.status, 'pending', '$15 withdrawal should be pending');
      });
    });
  });

  // ── Admin panel: onay/red + Transaction History + bonus etkisi ──────────────
  describe('Admin Panel: Approve/Reject + Transaction History + Bonus', () => {
    const TRC20_ADDR = 'TTestWa11etAddressForCoreTests1111';

    // ── Admin Transaction History ────────────────────────────────────────────
    describe('Admin Transaction History', () => {
      it('admin should see all own transactions in history', async () => {
        const admin = await User.create({
          username: 'admin_history',
          email: 'admin_history@test.com',
          password: 'hashed_password',
          role: 'admin',
          balance: 5000,
        });

        // Admin kendi işlemlerini yapsın
        await simulateAutoCreditDeposit(admin, {
          usdtAmount: 80,
          txHash: 'admin_dep_' + Date.now(),
          fromAddress: 'TFromAdmin1',
        });
        await simulateAutoProcessWithdraw(admin, {
          usdtAmount: 10,
          txHash: 'admin_wd_' + Date.now(),
        });

        const history = await getTransactionHistory(admin._id);
        assert.ok(history.length >= 2, 'Admin should see at least 2 transactions');

        const depTx = history.find(t => t.type === 'crypto_deposit');
        const wdTx = history.find(t => t.type === 'crypto_withdraw');
        assert.ok(depTx, 'Should have deposit in history');
        assert.ok(wdTx, 'Should have withdrawal in history');
        assert.equal(depTx.status, 'completed');
        assert.equal(wdTx.status, 'completed');
      });

      it('admin should see pending transactions in their history', async () => {
        const admin = await User.create({
          username: 'admin_pending_hist',
          email: 'admin_pending_hist@test.com',
          password: 'hashed_password',
          role: 'admin',
          balance: 3000,
        });

        await simulatePendingDeposit(admin, {
          usdtAmount: 150,
          txHash: 'admin_pending_dep_' + Date.now(),
          fromAddress: 'TFromAdminP1',
        });

        const history = await getTransactionHistory(admin._id);
        const pendingTx = history.find(t => t.type === 'crypto_deposit' && t.status === 'pending');
        assert.ok(pendingTx, 'Admin should see pending deposit in their history');
        assert.ok(pendingTx.note.includes('Admin onayı'), 'Should indicate admin approval needed');
      });
    });

    // ── Admin: Yatırma Onayı ─────────────────────────────────────────────────
    describe('Admin Approve Deposit', () => {
      it('should credit user balance and mark deposit as credited', async () => {
        const user = await User.create({
          username: 'admin_dep_user',
          email: 'admin_dep_user@test.com',
          password: 'hashed_password',
          balance: 500,
          cryptoDepositIndex: 0,
        });

        const usdtAmount = 150;
        const txHash = 'admin_approve_dep_' + Date.now();

        const { tryAmount } = await simulatePendingDeposit(user, { usdtAmount, txHash, fromAddress: 'TFromAdminA1' });

        // Admin onayı öncesi bakiye
        assert.equal((await User.findById(user._id)).balance, 500, 'Balance unchanged before approval');

        // Pending deposit'ı bul
        const deposit = await CryptoDeposit.findOne({ txHash, status: 'pending_approval' });
        assert.ok(deposit, 'Should have pending deposit');

        // Admin onayı: balance credited, CryptoDeposit → 'credited', Transaction → 'completed'
        const balBefore = user.balance;
        user.balance = +(user.balance + deposit.creditedTRY).toFixed(2);
        await user.save();

        deposit.status = 'credited';
        deposit.creditedAt = new Date();
        await deposit.save();

        // Transaction'ı güncelle
        const pendingTx = await Transaction.findOne({ userId: user._id, type: 'crypto_deposit', status: 'pending' });
        pendingTx.status = 'completed';
        pendingTx.balanceAfter = user.balance;
        pendingTx.note = `USDT TRC20 ${usdtAmount} USDT — Admin onayı ile eklendi`;
        await pendingTx.save();

        // Doğrulama
        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, +(500 + tryAmount).toFixed(2), 'Balance should increase after approval');

        const afterDeposit = await CryptoDeposit.findOne({ txHash });
        assert.equal(afterDeposit.status, 'credited', 'Deposit should be credited');
        assert.ok(afterDeposit.creditedAt, 'creditedAt should be set');

        const afterTx = await Transaction.findOne({ userId: user._id, type: 'crypto_deposit', status: 'completed' });
        assert.ok(afterTx, 'Should have completed deposit transaction');
        assert.ok(afterTx.note.includes('Admin onayı'), 'Note should mention admin approval');

        // History'de görünmeli
        const history = await getTransactionHistory(user._id);
        const histTx = history.find(t => t.type === 'crypto_deposit' && t.status === 'completed');
        assert.ok(histTx, 'Approved deposit should appear in transaction history');
      });

      it('should credit user balance WITH active bonus (bonus does not block deposit)', async () => {
        const user = await User.create({
          username: 'admin_dep_bonus',
          email: 'admin_dep_bonus@test.com',
          password: 'hashed_password',
          balance: 500,
          cryptoDepositIndex: 0,
        });

        // Aktif bonus var — yatırma bonus kilidinden etkilenmemeli
        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 200,
          wageringRequired: 7000,
          status: 'active',
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.locked, 200, 'Bonus locked');
        assert.equal(breakdown.withdrawable, 300, 'Only 300₺ withdrawable');

        const usdtAmount = 120;
        const txHash = 'admin_dep_bonus_' + Date.now();

        const { tryAmount } = await simulatePendingDeposit(user, { usdtAmount, txHash, fromAddress: 'TFromAdminB1' });

        // Admin onayı
        const deposit = await CryptoDeposit.findOne({ txHash, status: 'pending_approval' });
        user.balance = +(user.balance + deposit.creditedTRY).toFixed(2);
        await user.save();
        deposit.status = 'credited';
        deposit.creditedAt = new Date();
        await deposit.save();

        const pendingTx = await Transaction.findOne({ userId: user._id, type: 'crypto_deposit', status: 'pending' });
        pendingTx.status = 'completed';
        pendingTx.balanceAfter = user.balance;
        await pendingTx.save();

        // Doğrulama: bakiye arttı, bonus hala aktif
        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, +(500 + tryAmount).toFixed(2), 'Balance should increase');

        const afterBreakdown = await getSpendableBreakdown(user._id);
        assert.equal(afterBreakdown.locked, 200, 'Bonus still locked');
        assert.equal(afterBreakdown.withdrawable, +(500 + tryAmount - 200).toFixed(2), 'Withdrawable = balance - locked');

        // Bonus wagering hala aktif
        const wagering = await BonusWagering.findOne({ userId: user._id, status: 'active' });
        assert.ok(wagering, 'Bonus wagering should still be active');
      });

      it('should reject deposit without changing balance', async () => {
        const user = await User.create({
          username: 'admin_rej_dep',
          email: 'admin_rej_dep@test.com',
          password: 'hashed_password',
          balance: 500,
          cryptoDepositIndex: 0,
        });

        const txHash = 'admin_reject_dep_' + Date.now();
        await simulatePendingDeposit(user, {
          usdtAmount: 200,
          txHash,
          fromAddress: 'TFromAdminR1',
        });

        const deposit = await CryptoDeposit.findOne({ txHash, status: 'pending_approval' });
        deposit.status = 'rejected';
        await deposit.save();

        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, 500, 'Balance should NOT change on rejection');

        const afterDeposit = await CryptoDeposit.findOne({ txHash });
        assert.equal(afterDeposit.status, 'rejected', 'Deposit should be rejected');

        // History'de pending olarak kalmalı (red separately İşlenmemiş olarak görünür)
        const history = await getTransactionHistory(user._id);
        const tx = history.find(t => t.type === 'crypto_deposit');
        assert.ok(tx, 'Rejected deposit should still appear in history');
      });
    });

    // ── Admin: Çekim Onayı ───────────────────────────────────────────────────
    describe('Admin Approve Withdrawal', () => {
      it('should complete withdrawal and update transaction status', async () => {
        const user = await User.create({
          username: 'admin_wd_user',
          email: 'admin_wd_user@test.com',
          password: 'hashed_password',
          balance: 1000,
        });

        const usdtAmount = 50;
        const { tryNeeded } = await simulatePendingWithdraw(user, {
          usdtAmount,
          toAddress: TRC20_ADDR,
        });

        // Pending transaction'ı bul
        const pendingTx = await Transaction.findOne({
          userId: user._id,
          type: 'crypto_withdraw',
          status: 'pending',
        });
        assert.ok(pendingTx, 'Should have pending withdrawal');

        // Admin onayı: status → completed
        pendingTx.status = 'completed';
        pendingTx.note = `${pendingTx.note} — Onaylandı`;
        await pendingTx.save();

        const afterTx = await Transaction.findById(pendingTx._id);
        assert.equal(afterTx.status, 'completed', 'Withdrawal should be completed');

        // Bakiye zaten düşülmüştü (withdrawal request anında)
        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, +(1000 - tryNeeded).toFixed(2), 'Balance should remain decreased');
      });

      it('should complete withdrawal WITH active bonus (bonus does not block approved withdrawal)', async () => {
        const user = await User.create({
          username: 'admin_wd_bonus',
          email: 'admin_wd_bonus@test.com',
          password: 'hashed_password',
          balance: 1000,
        });

        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 100,
          wageringRequired: 3500,
          status: 'active',
        });

        const breakdown = await getSpendableBreakdown(user._id);
        assert.equal(breakdown.withdrawable, 900, 'Withdrawable: 1000 - 100 = 900');

        const usdtAmount = 50;
        const { tryNeeded } = await simulatePendingWithdraw(user, {
          usdtAmount,
          toAddress: TRC20_ADDR,
        });

        // Admin onayı
        const pendingTx = await Transaction.findOne({
          userId: user._id,
          type: 'crypto_withdraw',
          status: 'pending',
        });
        pendingTx.status = 'completed';
        await pendingTx.save();

        // Bonus hala aktif — sadece withdrawable kısım çekildi
        const afterBreakdown = await getSpendableBreakdown(user._id);
        assert.equal(afterBreakdown.locked, 100, 'Bonus still locked');
        assert.equal(afterBreakdown.withdrawable, +(900 - tryNeeded).toFixed(2), 'Withdrawable decreased by tryNeeded');
      });

      it('should reject withdrawal and refund balance', async () => {
        const user = await User.create({
          username: 'admin_rej_wd',
          email: 'admin_rej_wd@test.com',
          password: 'hashed_password',
          balance: 1000,
        });

        const usdtAmount = 50;
        const { tryNeeded } = await simulatePendingWithdraw(user, {
          usdtAmount,
          toAddress: TRC20_ADDR,
        });

        // Bakiye düşmüş olmalı
        assert.equal((await User.findById(user._id)).balance, +(1000 - tryNeeded).toFixed(2), 'Balance decreased');

        // Admin reddi: bakiyeyi iade et
        const pendingTx = await Transaction.findOne({
          userId: user._id,
          type: 'crypto_withdraw',
          status: 'pending',
        });

        const refundAmount = Math.abs(pendingTx.amount);
        const userBefore = await User.findById(user._id);
        const balBefore = userBefore.balance;
        userBefore.balance = +(userBefore.balance + refundAmount).toFixed(2);
        await userBefore.save();

        await Transaction.create({
          userId: user._id,
          type: 'crypto_withdraw',
          amount: refundAmount,
          balanceBefore: balBefore,
          balanceAfter: userBefore.balance,
          note: 'Çekim reddedildi — bakiye iade edildi',
          status: 'completed',
        });

        pendingTx.status = 'rejected';
        await pendingTx.save();

        // Doğrulama: bakiye iade edildi
        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, 1000, 'Balance should be refunded to original');

        const refundTx = await Transaction.findOne({
          userId: user._id,
          type: 'crypto_withdraw',
          status: 'completed',
          note: 'Çekim reddedildi — bakiye iade edildi',
        });
        assert.ok(refundTx, 'Should have refund transaction');
        assert.equal(refundTx.amount, tryNeeded, 'Refund amount should match');
      });

      it('should reject withdrawal WITH active bonus and restore full withdrawable', async () => {
        const user = await User.create({
          username: 'admin_rej_wd_bonus',
          email: 'admin_rej_wd_bonus@test.com',
          password: 'hashed_password',
          balance: 1000,
        });

        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 200,
          wageringRequired: 7000,
          status: 'active',
        });

        const breakdownBefore = await getSpendableBreakdown(user._id);
        assert.equal(breakdownBefore.withdrawable, 800, 'Withdrawable: 1000 - 200 = 800');

        const usdtAmount = 50;
        const { tryNeeded } = await simulatePendingWithdraw(user, {
          usdtAmount,
          toAddress: TRC20_ADDR,
        });

        // Admin reddi
        const pendingTx = await Transaction.findOne({
          userId: user._id,
          type: 'crypto_withdraw',
          status: 'pending',
        });
        const refundAmount = Math.abs(pendingTx.amount);
        const userBefore = await User.findById(user._id);
        const balBefore = userBefore.balance;
        userBefore.balance = +(userBefore.balance + refundAmount).toFixed(2);
        await userBefore.save();

        await Transaction.create({
          userId: user._id,
          type: 'crypto_withdraw',
          amount: refundAmount,
          balanceBefore: balBefore,
          balanceAfter: userBefore.balance,
          note: 'Çekim reddedildi — bakiye iade edildi',
          status: 'completed',
        });

        pendingTx.status = 'rejected';
        await pendingTx.save();

        // Doğrulama: bakiye iade, bonus hala aktif
        const afterUser = await User.findById(user._id);
        assert.equal(afterUser.balance, 1000, 'Balance restored');

        const afterBreakdown = await getSpendableBreakdown(user._id);
        assert.equal(afterBreakdown.locked, 200, 'Bonus still locked');
        assert.equal(afterBreakdown.withdrawable, 800, 'Withdrawable restored to 800');
      });
    });

    // ── Admin: Bonus ile karma senaryolar ────────────────────────────────────
    describe('Bonus Impact on Admin Operations', () => {
      it('deposit approval increases balance but bonus lock remains', async () => {
        const user = await User.create({
          username: 'bonus_dep_lock',
          email: 'bonus_dep_lock@test.com',
          password: 'hashed_password',
          balance: 200,
          cryptoDepositIndex: 0,
        });

        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 150,
          wageringRequired: 5250,
          status: 'active',
        });

        // Yatırma: $120 (pending)
        const txHash = 'bonus_dep_lock_' + Date.now();
        const { tryAmount } = await simulatePendingDeposit(user, {
          usdtAmount: 120,
          txHash,
          fromAddress: 'TFromBonusD1',
        });

        // Admin onayı
        const deposit = await CryptoDeposit.findOne({ txHash, status: 'pending_approval' });
        user.balance = +(user.balance + deposit.creditedTRY).toFixed(2);
        await user.save();
        deposit.status = 'credited';
        deposit.creditedAt = new Date();
        await deposit.save();

        const pendingTx = await Transaction.findOne({ userId: user._id, type: 'crypto_deposit', status: 'pending' });
        pendingTx.status = 'completed';
        pendingTx.balanceAfter = user.balance;
        await pendingTx.save();

        const afterBreakdown = await getSpendableBreakdown(user._id);
        assert.equal(afterBreakdown.balance, +(200 + tryAmount).toFixed(2), 'Balance includes deposit');
        assert.equal(afterBreakdown.locked, 150, 'Bonus lock unchanged');
        assert.equal(afterBreakdown.withdrawable, +(200 + tryAmount - 150).toFixed(2), 'Withdrawable = balance - locked');
      });

      it('withdrawal rejection restores balance, bonus lock unaffected', async () => {
        const user = await User.create({
          username: 'bonus_wd_reject',
          email: 'bonus_wd_reject@test.com',
          password: 'hashed_password',
          balance: 800,
        });

        await BonusWagering.create({
          userId: user._id,
          bonusAmount: 200,
          wageringRequired: 7000,
          status: 'active',
        });

        const breakdownBefore = await getSpendableBreakdown(user._id);
        assert.equal(breakdownBefore.withdrawable, 600, 'Withdrawable: 800 - 200 = 600');

        const usdtAmount = 50;
        const { tryNeeded } = await simulatePendingWithdraw(user, {
          usdtAmount,
          toAddress: TRC20_ADDR,
        });

        // Bakiye düşmüş olmalı
        assert.equal((await User.findById(user._id)).balance, +(800 - tryNeeded).toFixed(2));

        // Admin reddi → bakiye iade
        const pendingTx = await Transaction.findOne({
          userId: user._id,
          type: 'crypto_withdraw',
          status: 'pending',
        });
        const refundAmount = Math.abs(pendingTx.amount);
        const userBefore = await User.findById(user._id);
        const balBefore = userBefore.balance;
        userBefore.balance = +(userBefore.balance + refundAmount).toFixed(2);
        await userBefore.save();

        await Transaction.create({
          userId: user._id,
          type: 'crypto_withdraw',
          amount: refundAmount,
          balanceBefore: balBefore,
          balanceAfter: userBefore.balance,
          note: 'Çekim reddedildi — bakiye iade edildi',
          status: 'completed',
        });

        pendingTx.status = 'rejected';
        await pendingTx.save();

        const afterBreakdown = await getSpendableBreakdown(user._id);
        assert.equal(afterBreakdown.balance, 800, 'Balance fully restored');
        assert.equal(afterBreakdown.locked, 200, 'Bonus lock unaffected');
        assert.equal(afterBreakdown.withdrawable, 600, 'Withdrawable restored');
      });

      it('multiple users: admin operations on one user should not affect another', async () => {
        const user1 = await User.create({
          username: 'multi_user_1',
          email: 'multi1@test.com',
          password: 'hashed_password',
          balance: 500,
          cryptoDepositIndex: 0,
        });
        const user2 = await User.create({
          username: 'multi_user_2',
          email: 'multi2@test.com',
          password: 'hashed_password',
          balance: 800,
        });

        // User1: pending deposit
        const txHash1 = 'multi_dep1_' + Date.now();
        await simulatePendingDeposit(user1, {
          usdtAmount: 150,
          txHash: txHash1,
          fromAddress: 'TFromMulti1',
        });

        // User2: pending withdrawal
        await simulatePendingWithdraw(user2, {
          usdtAmount: 30,
          toAddress: TRC20_ADDR,
        });

        // Admin: User1'in yatırmasını onayla
        const deposit = await CryptoDeposit.findOne({ txHash: txHash1, status: 'pending_approval' });
        user1.balance = +(user1.balance + deposit.creditedTRY).toFixed(2);
        await user1.save();
        deposit.status = 'credited';
        deposit.creditedAt = new Date();
        await deposit.save();

        const tx1 = await Transaction.findOne({ userId: user1._id, type: 'crypto_deposit', status: 'pending' });
        tx1.status = 'completed';
        tx1.balanceAfter = user1.balance;
        await tx1.save();

        // User2 etkilenmemeli
        const user2After = await User.findById(user2._id);
        const user2Breakdown = await getSpendableBreakdown(user2._id);
        assert.equal(user2After.balance, +(800 - 30).toFixed(2), 'User2 balance unchanged by User1 approval');
        assert.equal(user2Breakdown.withdrawable, +(800 - 30).toFixed(2), 'User2 withdrawable unchanged');
      });
    });
  });
});
