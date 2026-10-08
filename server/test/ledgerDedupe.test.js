/**
 * Eski çift Transaction kayıtlarının temizliği (servis, elle betik) ve demo hesap
 * parolalarının döndürülmesi (migration 0003).
 *
 * Fikstürler, 2026-09-17 ile 2026-10-02 arasındaki kodun yazdığı şekli
 * birebir taklit eder: önce idempotencyKey'siz ham satır, hemen ardından aynı
 * alanlarla idempotencyKey'li ledger satırı.
 *
 * Çalıştırmak için: node --test test/ledgerDedupe.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { dedupeDoubleWrites, ARCHIVE_COLLECTION } from '../src/services/ledgerDedupe.js';
import migration0003 from '../migrations/0003_rotate_seed_passwords.js';

let db;
const oid = () => new mongoose.Types.ObjectId();
const at = (sec) => new Date(Date.UTC(2026, 8, 20, 12, 0, sec));

/** Eski kodun yazdığı bir çift: ham (anahtarsız) + ledger (anahtarlı). */
async function oldDoubleWrite({ userId, type, amount, before, after, note = 'n', key, status = 'completed', sec = 0, extraRaw = {}, extraLedger = {} }) {
  const base = { userId, type, amount, balanceBefore: before, balanceAfter: after, note, status, cryptoDepositId: null, createdBy: null, metadata: {}, relatedTransactionId: null, walletId: 'main', isSeed: false };
  const raw = { _id: oid(), ...base, currency: 'TRY', source: 'system', createdAt: at(sec), updatedAt: at(sec), ...extraRaw };
  const ledger = { _id: oid(), ...base, idempotencyKey: key, currency: 'TRY', source: 'system', createdAt: at(sec + 1), updatedAt: at(sec + 1), ...extraLedger };
  await db.collection('transactions').insertMany([raw, ledger]);
  return { raw, ledger };
}
const exists = async (id) => !!(await db.collection('transactions').findOne({ _id: id }));

describe('Ledger çift yazım temizliği (ledgerDedupe)', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_ledger_dedupe');
    db = mongoose.connection.db;
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    for (const c of ['transactions', ARCHIVE_COLLECTION, 'referralcommissions', 'users', 'migrations']) {
      await db.collection(c).deleteMany({});
    }
  });

  it('tamamlanmış çiftlerde ham kopyayı arşivleyip siler, ledger satırı kalır', async () => {
    const u = oid();
    const vip = await oldDoubleWrite({ userId: u, type: 'cashback', amount: 5, before: 100, after: 105, key: `vip_cashback_${u}_1`, sec: 0 });
    const lvl = await oldDoubleWrite({ userId: u, type: 'bonus', amount: 25, before: 105, after: 130, key: `vip_levelup_${u}_L2`, sec: 10 });
    const agent = await oldDoubleWrite({ userId: u, type: 'agent_commission', amount: 20, before: 0, after: 20, key: `agent_commission_a_p_1`, sec: 20 });
    const rej = await oldDoubleWrite({ userId: u, type: 'crypto_withdraw', amount: 30, before: 50, after: 80, key: `crypto_withdraw_reject_x`, sec: 30 });

    const r = await dedupeDoubleWrites();

    assert.equal(r.found, 4);
    assert.equal(r.removed, 4);
    for (const p of [vip, lvl, agent, rej]) {
      assert.equal(await exists(p.raw._id), false);
      assert.equal(await exists(p.ledger._id), true);
    }
    const archived = await db.collection(ARCHIVE_COLLECTION).findOne({ _id: vip.raw._id });
    assert.equal(String(archived.keptTransactionId), String(vip.ledger._id));
    assert.equal(archived.original.amount, 5);
    assert.equal(archived.reason, 'raw_copy');
  });

  it('ReferralCommission.transactionId ham kopyaya işaret ediyorsa ledger satırına çevrilir', async () => {
    const u = oid();
    const pair = await oldDoubleWrite({ userId: u, type: 'referral_commission', amount: 7, before: 0, after: 7, key: 'referral_approve_c1' });
    const rc = await db.collection('referralcommissions').insertOne({ referrerId: u, transactionId: pair.raw._id });
    await dedupeDoubleWrites();
    const after = await db.collection('referralcommissions').findOne({ _id: rc.insertedId });
    assert.equal(String(after.transactionId), String(pair.ledger._id));
  });

  it('onay bekleyen kripto çekim: ikisi de bekliyorsa ham kopya kalkar (kuyrukta tek satır)', async () => {
    const u = oid();
    const p = await oldDoubleWrite({ userId: u, type: 'crypto_withdraw', amount: -350, before: 500, after: 150, status: 'pending', key: `crypto_withdraw_pending_${u}_r1` });
    await dedupeDoubleWrites();
    assert.equal(await exists(p.raw._id), false);
    assert.equal(await db.collection('transactions').countDocuments({ type: 'crypto_withdraw', status: 'pending', userId: u }), 1);
  });

  it('admin ham kopyayı onaylamışsa işlenen kalır, bekleyen ledger kopyası kalkar (çift USDT gönderimi önlenir)', async () => {
    const u = oid();
    const p = await oldDoubleWrite({
      userId: u, type: 'crypto_withdraw', amount: -350, before: 500, after: 150, status: 'pending', key: `crypto_withdraw_pending_${u}_r2`,
      extraRaw: { status: 'completed', note: 'onaylandı', metadata: { txHash: 'abc' } },
    });
    const r = await dedupeDoubleWrites();
    assert.equal(r.pairs[0].reason, 'stale_pending_copy');
    assert.equal(await exists(p.raw._id), true);
    assert.equal(await exists(p.ledger._id), false);
  });

  it('admin ledger kopyasını reddetmişse işlenen kalır, bekleyen ham kopya kalkar (çift iade önlenir)', async () => {
    const u = oid();
    const p = await oldDoubleWrite({
      userId: u, type: 'crypto_withdraw', amount: -100, before: 300, after: 200, status: 'pending', key: `crypto_withdraw_pending_${u}_r3`,
      extraLedger: { status: 'rejected', note: 'reddedildi' },
    });
    await dedupeDoubleWrites();
    assert.equal(await exists(p.raw._id), false);
    assert.equal(await exists(p.ledger._id), true);
  });

  it('gerçek (kopya olmayan) kayıtlara dokunmaz', async () => {
    const u = oid();
    const base = { userId: u, type: 'cashback', note: 'n', status: 'completed', currency: 'TRY', source: 'system', metadata: {} };
    await db.collection('transactions').insertMany([
      { ...base, amount: 5, balanceBefore: 100, balanceAfter: 105, idempotencyKey: 'vip_cashback_a', createdAt: at(0) },
      { ...base, amount: 5, balanceBefore: 105, balanceAfter: 110, createdAt: at(1) },        // farklı bakiye geçişi
      { ...base, amount: 5, balanceBefore: 100, balanceAfter: 105, createdAt: at(40) },       // pencere dışı
      { ...base, type: 'deposit', amount: 5, balanceBefore: 100, balanceAfter: 105, createdAt: at(0) }, // etkilenmeyen tür
    ]);
    const r = await dedupeDoubleWrites();
    assert.equal(r.found, 0);
    assert.equal(await db.collection('transactions').countDocuments(), 4);
  });

  it('dryRun hiçbir şey yazmaz; gerçek koşu idempotenttir', async () => {
    const u = oid();
    await oldDoubleWrite({ userId: u, type: 'cashback', amount: 5, before: 100, after: 105, key: `vip_cashback_${u}_2` });
    const dry = await dedupeDoubleWrites({ dryRun: true });
    assert.equal(dry.found, 1);
    assert.equal(await db.collection('transactions').countDocuments(), 2);
    assert.equal((await dedupeDoubleWrites()).removed, 1);
    assert.deepEqual(await dedupeDoubleWrites(), { found: 0, removed: 0, byType: {}, pairs: [] });
  });

  it('migration 0003 seed parolalarını döndürür, oturumlarını düşürür, gerçek kullanıcıya dokunmaz', async () => {
    const oldHash = await bcrypt.hash('SeedUser1234!', 4);
    await db.collection('users').insertMany([
      { username: 's1', email: 's1@seed.local', password: oldHash, isSeed: true, tokenVersion: 3 },
      { username: 'real', email: 'real@test.com', password: oldHash, tokenVersion: 3 },
    ]);
    await migration0003.up();
    const seed = await db.collection('users').findOne({ username: 's1' });
    const real = await db.collection('users').findOne({ username: 'real' });
    assert.equal(await bcrypt.compare('SeedUser1234!', seed.password), false);
    assert.equal(seed.tokenVersion, 4);
    assert.equal(real.password, oldHash);
    assert.equal(real.tokenVersion, 3);
  });

  it('tekil idempotencyKey\'li kayıtlara (createTransaction ile yazılmış güncel kayıtlar) dokunmaz', async () => {
    const u = oid();
    const base = { userId: u, balanceBefore: 100, balanceAfter: 105, amount: 5, status: 'completed', currency: 'TRY', source: 'system', createdAt: at(0), updatedAt: at(0) };
    // Güncel kod: tek kayıt, anahtarlı. Aynı alanlı iki ayrı anahtarlı kayıt da (farklı sourceId) kopya sayılmaz.
    await db.collection('transactions').insertMany([
      { _id: oid(), ...base, type: 'cashback', idempotencyKey: `vip_cashback_${u}_srcA` },
      { _id: oid(), ...base, type: 'cashback', idempotencyKey: `vip_cashback_${u}_srcB` },
      { _id: oid(), ...base, type: 'agent_commission', idempotencyKey: `agent_commission_a_${u}_srcC` },
    ]);
    const dry = await dedupeDoubleWrites({ dryRun: true });
    assert.equal(dry.found, 0);
    const r = await dedupeDoubleWrites();
    assert.equal(r.removed, 0);
    assert.equal(await db.collection('transactions').countDocuments(), 3);
  });

  it('anahtarsız tekil kayıt (eşi yok) silinmez', async () => {
    const u = oid();
    await db.collection('transactions').insertOne({ _id: oid(), userId: u, type: 'cashback', amount: 5, balanceBefore: 1, balanceAfter: 6, status: 'completed', createdAt: at(0), updatedAt: at(0) });
    assert.equal((await dedupeDoubleWrites()).removed, 0);
    assert.equal(await db.collection('transactions').countDocuments(), 1);
  });
});
