/**
 * Seed: Admin için kripto işlemleri — zaman sıralı, bakiye durumlu
 *
 * Kullanım: cd server && node seed-admin-crypto.js
 */
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '.env') });

import User from './src/models/User.js';
import Transaction from './src/models/Transaction.js';
import CryptoDeposit from './src/models/CryptoDeposit.js';
import BonusWagering from './src/models/BonusWagering.js';

const ADMIN_ID = '6a9deeedf0d553bf2db76f5b';
const TRC20_ADDR = 'TTestWa11etAddressForCoreTests1111';
const RATE = 1; // USDT = TRY (test)

function h(m) { return new Date(Date.now() - m * 60_000); }
function tid() { return `seed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function fmt(n) { return +n.toFixed(2); }

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB:', process.env.MONGODB_URI);

  const admin = await User.findById(ADMIN_ID);
  if (!admin) { console.error('Admin bulunamadı'); process.exit(1); }

  // Temizle
  await Transaction.deleteMany({ userId: ADMIN_ID, type: { $in: ['crypto_deposit', 'crypto_withdraw'] } });
  await CryptoDeposit.deleteMany({ userId: ADMIN_ID });

  // Başlangıç: balance=500, bonus=500 (locked)
  admin.balance = 500;
  await admin.save();

  let balance = 500;
  const locked = 500;
  const log = [];

  function state(m) {
    const w = Math.max(0, fmt(balance - locked));
    return { balance: fmt(balance), locked, withdrawable: w };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZAMAN ÇİZELGESİ (dakika bazında, eskiden yeniye)
  // ═══════════════════════════════════════════════════════════════════════════

  const events = [
    // ── YATIRIMLAR ────────────────────────────────────────────────────────────
    {
      time: 300, // 5 saat önce
      type: 'deposit', usdt: 50, auto: true,
      note: (h) => `USDT TRC20 50.00 USDT (tx: ${h.slice(0, 12)}...) — Otomatik onaylandı (< $100)`,
    },
    {
      time: 240, // 4 saat önce
      type: 'deposit', usdt: 75, auto: true,
      note: (h) => `USDT TRC20 75.00 USDT (tx: ${h.slice(0, 12)}...) — Otomatik onaylandı (< $100)`,
    },
    {
      time: 180, // 3 saat önce
      type: 'deposit', usdt: 150, auto: false,
      note: (h) => `Bekleyen yatırma: 150.00 USDT (tx: ${h.slice(0, 12)}...) — $150 > $100 limiti, admin onayı bekliyor`,
    },
    {
      time: 120, // 2 saat önce
      type: 'deposit', usdt: 200, auto: false,
      note: (h) => `Bekleyen yatırma: 200.00 USDT (tx: ${h.slice(0, 12)}...) — $200 > $100 limiti, admin onayı bekliyor`,
    },
    {
      time: 90, // 1.5 saat önce
      type: 'deposit', usdt: 300, auto: false,
      note: (h) => `Bekleyen yatırma: 300.00 USDT (tx: ${h.slice(0, 12)}...) — $300 > $100 limiti, admin onayı bekliyor`,
    },

    // ── ÇEKİMLER ──────────────────────────────────────────────────────────────
    {
      time: 60, // 1 saat önce
      type: 'withdraw', usdt: 10, auto: true,
      note: (h) => `10 USDT → ${TRC20_ADDR} (tx: ${h.slice(0, 12)}...) — Otomatik gönderildi (< $15, hot wallet transfer)`,
    },
    {
      time: 30, // 30 dk önce
      type: 'withdraw', usdt: 50, auto: false,
      note: () => `50 USDT → ${TRC20_ADDR} — $50 > $15 limiti, admin onayı bekliyor. Çekilebilir bakiye yeterli (115₺ mevcut)`,
    },
    {
      time: 15, // 15 dk önce
      type: 'withdraw', usdt: 100, auto: false, shouldFail: true,
      note: () => `100 USDT → ${TRC20_ADDR} — REDDEDİLDİ: Çekilebilir bakiye yetersiz (65₺ mevcut, 100₺ talep edildi). Bonus kilidi: 500₺`,
    },
  ];

  // Sırayla uygula
  for (const ev of events) {
    const ts = h(ev.time);
    const hash = tid();
    const s = state();
    const tryAmt = fmt(ev.usdt * RATE);

    if (ev.type === 'deposit') {
      if (ev.auto) {
        // Auto-credit: bakiye artar
        const before = balance;
        balance = fmt(balance + tryAmt);
        const after = state();

        await Transaction.create({
          userId: ADMIN_ID, type: 'crypto_deposit', amount: tryAmt,
          balanceBefore: before, balanceAfter: fmt(balance),
          note: ev.note(hash), status: 'completed',
          createdAt: ts, updatedAt: ts,
        });

        await CryptoDeposit.create({
          userId: ADMIN_ID, txHash: hash,
          fromAddress: 'TFrom_' + Math.random().toString(36).slice(2, 6),
          toAddress: `TDepositIdx0`, usdtAmount: ev.usdt, creditedTRY: tryAmt,
          status: 'credited', creditedAt: ts,
          createdAt: ts, updatedAt: ts,
        });

        log.push(`+${tryAmt} TRY yatırıldı (auto) | bakiye: ${before} → ${fmt(balance)} | çekilebilir: ${after.withdrawable}`);
      } else {
        // Pending: bakiye değişmez
        await Transaction.create({
          userId: ADMIN_ID, type: 'crypto_deposit', amount: tryAmt,
          balanceBefore: fmt(balance), balanceAfter: fmt(balance),
          note: ev.note(hash), status: 'pending',
          createdAt: ts, updatedAt: ts,
        });

        await CryptoDeposit.create({
          userId: ADMIN_ID, txHash: hash,
          fromAddress: 'TFrom_' + Math.random().toString(36).slice(2, 6),
          toAddress: `TDepositIdx0`, usdtAmount: ev.usdt, creditedTRY: tryAmt,
          status: 'pending_approval', creditedAt: null,
          createdAt: ts, updatedAt: ts,
        });

        log.push(`⏳${tryAmt} TRY bekliyor (pending) | bakiye: ${fmt(balance)} | çekilebilir: ${state().withdrawable}`);
      }
    } else if (ev.type === 'withdraw') {
      const w = state().withdrawable;

      if (ev.shouldFail || tryAmt > w) {
        // RED: withdrawable yetersiz — bakiye düşmez, transaction oluşmaz
        // Ama admin'in görebileceği bir "reddedilen" transaction ekleyelim
        const before = fmt(balance);
        await Transaction.create({
          userId: ADMIN_ID, type: 'crypto_withdraw', amount: -tryAmt,
          balanceBefore: before, balanceAfter: before,
          note: ev.note(hash), status: 'rejected',
          toAddress: TRC20_ADDR, usdtAmount: ev.usdt,
          createdAt: ts, updatedAt: ts,
        });

        log.push(`❌${tryAmt} TRY RED (çekilebilir: ${w} < ${tryAmt}) | bakiye: ${before} (değişmedi)`);
      } else if (ev.auto) {
        // Auto-process: bakiye azalır
        const before = balance;
        balance = fmt(balance - tryAmt);
        const after = state();

        await Transaction.create({
          userId: ADMIN_ID, type: 'crypto_withdraw', amount: -tryAmt,
          balanceBefore: before, balanceAfter: fmt(balance),
          note: ev.note(hash), status: 'completed',
          createdAt: ts, updatedAt: ts,
        });

        log.push(`-${tryAmt} TRY gönderildi (auto) | bakiye: ${before} → ${fmt(balance)} | çekilebilir: ${after.withdrawable}`);
      } else {
        // Pending: bakiye azalır, admin onayı bekler
        const before = balance;
        balance = fmt(balance - tryAmt);
        const after = state();

        await Transaction.create({
          userId: ADMIN_ID, type: 'crypto_withdraw', amount: -tryAmt,
          balanceBefore: before, balanceAfter: fmt(balance),
          note: ev.note(), status: 'pending',
          toAddress: TRC20_ADDR, usdtAmount: ev.usdt,
          createdAt: ts, updatedAt: ts,
        });

        log.push(`⏳-${tryAmt} TRY bekliyor (pending) | bakiye: ${before} → ${fmt(balance)} | çekilebilir: ${after.withdrawable}`);
      }
    }
  }

  // Final bakiye
  admin.balance = fmt(balance);
  await admin.save();

  // ═══════════════════════════════════════════════════════════════════════════
  // ÖZET
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ ZAMAN ÇİZELGESİ ═══');
  for (const l of log) console.log(`  ${l}`);

  const final = state();
  console.log(`\n═══ FINAL ═══`);
  console.log(`Bakiye:      ${final.balance}₺`);
  console.log(`Bonus Kilit: ${final.locked}₺`);
  console.log(`Çekilebilir: ${final.withdrawable}₺`);

  const txAll = await Transaction.find({ userId: ADMIN_ID }).sort({ createdAt: 1 });
  console.log(`\n═══ İŞLEMLER (${txAll.length}) ═══`);
  for (const tx of txAll) {
    const arrow = tx.amount > 0 ? '+' : '';
    const ts = tx.createdAt.toISOString().slice(0, 16).replace('T', ' ');
    console.log(`  ${ts} | ${tx.type.padEnd(18)} | ${arrow}${tx.amount}₺ | ${tx.status.padEnd(10)} | ${tx.note?.slice(0, 50)}`);
  }

  await mongoose.disconnect();
  console.log('\nTamamlandı.');
}

seed().catch(e => { console.error(e); process.exit(1); });
