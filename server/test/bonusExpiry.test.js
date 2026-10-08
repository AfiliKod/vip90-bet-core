/**
 * Süresi dolan bonus çevrimi — eskiden `expired` olunca kilit tamamen kalkıyor,
 * bonus çevrim şartı tamamlanmadan çekilebilir hale geliyordu. Artık süre
 * dolumu, oyuncunun bonusu iptal etmesiyle aynı kuralla çevrilmemiş payı
 * bakiyeden geri alır.
 *
 * Çalıştırmak için: node --test test/bonusExpiry.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import BonusWagering from '../src/models/BonusWagering.js';
import {
  recordWagering, getSpendableBreakdown, expireWagering, expireOverdueWagerings,
} from '../src/services/wagering.js';

const PAST = () => new Date(Date.now() - 60 * 60 * 1000);
const FUTURE = () => new Date(Date.now() + 24 * 60 * 60 * 1000);
let seq = 0;

/** Model B: bonus gerçek bakiyeye eklenmiş, aktif çevrim kaydı var. */
async function userWithBonus({ realMoney = 100, bonus = 100, progress = 0, deadline = PAST() } = {}) {
  seq += 1;
  const user = await User.create({ username: `bx_${seq}`, email: `bx_${seq}@test.com`, password: 'Pass1234', balance: realMoney + bonus, bonusBalance: bonus });
  const w = await BonusWagering.create({
    userId: user._id, source: 'promotion', bonusAmount: bonus, wageringRequired: bonus * 35,
    wageringProgress: progress, multiplier: 35, deadline, status: 'active',
  });
  return { user, w };
}

describe('Bonus süre dolumu', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_bonus_expiry');
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Transaction.deleteMany({}), BonusWagering.deleteMany({})]);
  });

  it('süresi dolduktan sonraki bahis bonusu çekilebilir YAPMAZ — çevrilmemiş pay geri alınır', async () => {
    const { user, w } = await userWithBonus({ realMoney: 100, bonus: 100 });

    await recordWagering(user._id, 'sports', 10); // süre dolumunu tetikleyen bahis

    const breakdown = await getSpendableBreakdown(user._id);
    assert.equal(breakdown.balance, 100, 'bonus bakiyeden düşülmeli');
    assert.equal(breakdown.locked, 0);
    assert.equal(breakdown.withdrawable, 100, 'yalnızca gerçek para çekilebilir olmalı (eskiden 200)');
    assert.equal((await BonusWagering.findById(w._id)).status, 'expired');
    const tx = await Transaction.find({ userId: user._id, type: 'bonus_forfeit' }).lean();
    assert.equal(tx.length, 1);
    assert.equal(tx[0].amount, -100);
    assert.equal(tx[0].idempotencyKey, `bonus_expire_${w._id}`);
    assert.equal((await User.findById(user._id)).bonusBalance, 0);
  });

  it('kısmen çevrilmiş bonusta yalnızca çevrilmemiş pay geri alınır', async () => {
    const { user } = await userWithBonus({ realMoney: 0, bonus: 100, progress: 1750 }); // %50 çevrildi
    await expireOverdueWagerings({ userId: user._id });
    assert.equal((await User.findById(user._id)).balance, 50);
  });

  it('bakiye geri alınacak tutarın altındaysa bakiye sıfırlanır, negatife inmez', async () => {
    const { user } = await userWithBonus({ realMoney: 0, bonus: 100 });
    await User.updateOne({ _id: user._id }, { balance: 30 }); // bonus oynanıp kısmen kaybedilmiş
    const deducted = await expireOverdueWagerings({ userId: user._id });
    assert.equal(deducted.deducted, 30);
    assert.equal((await User.findById(user._id)).balance, 0);
  });

  it('çekim kapısı (getSpendableBreakdown) bahis olmadan da süre dolumunu işler', async () => {
    const { user } = await userWithBonus({ realMoney: 40, bonus: 60 });
    const breakdown = await getSpendableBreakdown(user._id);
    assert.deepEqual({ ...breakdown }, { balance: 40, locked: 0, withdrawable: 40 });
  });

  it('periyodik iş hiç oynamayan oyuncunun çevrimini işler; ikinci çalıştırma hiçbir şey yapmaz', async () => {
    const a = await userWithBonus({ realMoney: 10, bonus: 50 });
    const b = await userWithBonus({ realMoney: 20, bonus: 80 });
    const first = await expireOverdueWagerings();
    assert.deepEqual(first, { processed: 2, deducted: 130 });
    const second = await expireOverdueWagerings();
    assert.deepEqual(second, { processed: 0, deducted: 0 });
    assert.equal((await User.findById(a.user._id)).balance, 10);
    assert.equal((await User.findById(b.user._id)).balance, 20);
  });

  it('aynı çevrim için eşzamanlı iki işleme bakiyeyi bir kez düşer', async () => {
    const { user, w } = await userWithBonus({ realMoney: 100, bonus: 100 });
    const results = await Promise.all([expireWagering(w), expireWagering(w)]);
    assert.equal(results.reduce((s, d) => s + d, 0), 100);
    assert.equal((await User.findById(user._id)).balance, 100);
    assert.equal(await Transaction.countDocuments({ userId: user._id, type: 'bonus_forfeit' }), 1);
  });

  it('süresi dolmamış çevrime dokunulmaz', async () => {
    const { user, w } = await userWithBonus({ realMoney: 100, bonus: 100, deadline: FUTURE() });
    await expireOverdueWagerings();
    await recordWagering(user._id, 'sports', 10);
    assert.equal((await BonusWagering.findById(w._id)).status, 'active');
    const breakdown = await getSpendableBreakdown(user._id);
    assert.deepEqual({ ...breakdown }, { balance: 200, locked: 100, withdrawable: 100 });
  });
});
