/**
 * Dashboard "Bekleyen finans" tablosunun veri kaynağı — oyuncu adı, tutar ve
 * risk eskiden istemcide yanlış alanlardan okunduğu için "—"/"Orta" görünüyordu.
 *
 * Çalıştırmak için: node --test test/pendingFinance.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import CryptoDeposit from '../src/models/CryptoDeposit.js';
import BankDepositRequest from '../src/models/BankDepositRequest.js';
import RiskProfile from '../src/models/RiskProfile.js';
import VipLevel from '../src/models/VipLevel.js';
import { listPendingFinance, classifyRisk } from '../src/services/pendingFinance.js';

const ago = (min) => new Date(Date.now() - min * 60000);
let seq = 0;
const makeUser = (extra = {}) => { seq += 1; return User.create({ username: `pf_user_${seq}`, email: `pf_${seq}@test.com`, password: 'Pass1234', ...extra }); };

describe('pendingFinance', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_pending_finance');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await Promise.all([User, Transaction, CryptoDeposit, BankDepositRequest, RiskProfile, VipLevel].map(M => M.deleteMany({})));
  });

  it('classifyRisk: risk profili > VIP > KYC önceliği', () => {
    assert.equal(classifyRisk({ riskLevel: 'CRITICAL', vipLevelNumber: 5 }), 'high');
    assert.equal(classifyRisk({ riskLevel: 'HIGH' }), 'high');
    assert.equal(classifyRisk({ riskLevel: 'LOW', vipLevelNumber: 2 }), 'vip');
    assert.equal(classifyRisk({ vipLevelNumber: 1, kycStatus: 'approved' }), 'low');
    assert.equal(classifyRisk({ riskLevel: 'MEDIUM' }), 'medium');
    assert.equal(classifyRisk({ riskLevel: 'LOW' }), 'low');
    assert.equal(classifyRisk({}), 'medium');
  });

  it('kripto + banka talepleri gerçek oyuncu adı, tutar ve riskle, en uzun bekleyen önce döner', async () => {
    const gold = await VipLevel.create({ level: 3, name: 'Gold', xpRequired: 100 });
    const vipUser = await makeUser({ vipLevel: gold._id });
    const riskyUser = await makeUser();
    const kycUser = await makeUser({ kycStatus: 'approved' });
    await RiskProfile.create({ playerId: riskyUser._id, riskLevel: 'HIGH' });

    await CryptoDeposit.create({ userId: vipUser._id, txHash: 'tx-pf-1', toAddress: 'T1', usdtAmount: 25, creditedTRY: 875, status: 'pending_approval', createdAt: ago(30) });
    await Transaction.create({ userId: riskyUser._id, type: 'crypto_withdraw', amount: -350, balanceBefore: 500, balanceAfter: 150, status: 'pending', metadata: { usdtAmount: 10 }, createdAt: ago(90) });
    await BankDepositRequest.create({ userId: kycUser._id, type: 'withdraw', amount: 1200, status: 'pending', createdAt: ago(10) });
    await BankDepositRequest.create({ userId: kycUser._id, type: 'deposit', amount: 99, status: 'approved', createdAt: ago(5) }); // onaylı — dahil değil

    const { items } = await listPendingFinance({ limit: 10 });

    assert.deepEqual(items.map(i => i.kind), ['crypto_withdraw', 'crypto_deposit', 'bank_withdraw']);
    assert.deepEqual(items.map(i => i.username), [riskyUser.username, vipUser.username, kycUser.username]);
    assert.deepEqual(items.map(i => i.amount), [350, 875, 1200]);
    assert.deepEqual(items.map(i => i.usdtAmount), [10, 25, null]);
    assert.deepEqual(items.map(i => i.risk), ['high', 'vip', 'low']);
    assert.ok(items.every(i => i.status === 'pending'));
  });

  it('limit uygulanır ve silinmiş kullanıcının talebi username: null döner', async () => {
    const ghostId = new mongoose.Types.ObjectId();
    for (let i = 0; i < 4; i++) {
      await BankDepositRequest.create({ userId: ghostId, type: 'deposit', amount: 10 + i, status: 'pending', createdAt: ago(60 - i) });
    }
    const { items } = await listPendingFinance({ limit: 2 });
    assert.equal(items.length, 2);
    assert.deepEqual(items.map(i => i.amount), [10, 11]);
    assert.equal(items[0].username, null);
  });
});
