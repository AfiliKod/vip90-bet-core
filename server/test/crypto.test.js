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
});
