/**
 * Seed: Admin için gerçek testnet transferleri ile kripto işlemleri
 *
 * Hot wallet'tan admin deposit adresine USDT gönderir (yatırma simülasyonu),
 * check-deposit mantığıyla bakiyeye ekler, çekimlerde hot wallet'tan dış adrese gönderir.
 *
 * Kullanım: cd server && node seed-admin-crypto.js
 * Süre: ~5-10 dakika (testnet onay süreleri dahil)
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
import { deriveDepositAddress, getHotWalletAddress, transferUSDT, fetchIncomingUSDT } from './src/services/cryptoService.js';
import { CRYPTO_SETTINGS, shouldAutoCredit, shouldAutoProcessWithdraw } from './src/config/crypto.js';
import { getSpendableBreakdown } from './src/services/wagering.js';

const ADMIN_ID = '6a9deeedf0d553bf2db76f5b';
const RATE = 1;
const CONFIRM_WAIT_MS = 60_000; // Shasta onay süresi ~30-60sn
const MAX_WAIT_MS = 180_000;    // Max bekleme 3 dakika

function ts(m) { return new Date(Date.now() - m * 60_000); }
function tid() { return `seed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function fmt(n) { return +n.toFixed(2); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForConfirmation(address, expectedAmount, startMs) {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const txs = await fetchIncomingUSDT(address, startMs);
      const match = txs.find(tx => Number(tx.value) / 1_000_000 >= expectedAmount * 0.99);
      if (match) return match;
    } catch (e) {
      // TronGrid rate limit olabilir, bekle
    }
    await sleep(CONFIRM_WAIT_MS);
  }
  return null;
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB:', process.env.MONGODB_URI);

  const admin = await User.findById(ADMIN_ID);
  if (!admin) { console.error('Admin bulunamadı'); process.exit(1); }

  const hotWallet = getHotWalletAddress();
  const adminDepositAddr = deriveDepositAddress(admin.cryptoDepositIndex || 1);
  console.log(`Hot wallet:      ${hotWallet}`);
  console.log(`Admin deposit:   ${adminDepositAddr}`);
  console.log(`Admin cryptoDepositIndex: ${admin.cryptoDepositIndex}`);

  if (hotWallet === adminDepositAddr) {
    console.error('HATA: Hot wallet ve admin deposit adresi aynı! Index düzeltmesi uygulanmamış.');
    process.exit(1);
  }

  // Temizle
  await Transaction.deleteMany({ userId: ADMIN_ID, type: { $in: ['crypto_deposit', 'crypto_withdraw'] } });
  await CryptoDeposit.deleteMany({ userId: ADMIN_ID });
  admin.balance = 0;
  await admin.save();
  console.log('Temizlendi. Balance: 0\n');

  let balance = 0;
  const locked = 0; // Bonus henüz yok
  const log = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. YATIRIMLAR — Gerçek testnet transferleri
  // ═══════════════════════════════════════════════════════════════════════════

  const deposits = [
    { usdt: 50,  auto: true,  desc: 'auto-credit (< $100)' },
    { usdt: 75,  auto: true,  desc: 'auto-credit (< $100)' },
    { usdt: 150, auto: false, desc: 'pending ($150 > $100)' },
    { usdt: 200, auto: false, desc: 'pending ($200 > $100)' },
    { usdt: 300, auto: false, desc: 'pending ($300 > $100)' },
  ];

  console.log('═══ YATIRIMLAR ═══');
  for (const dep of deposits) {
    const tryAmt = fmt(dep.usdt * RATE);
    const txHash = tid();
    const now = Date.now();

    if (dep.auto) {
      // Gerçek testnet transferi: hot wallet → admin deposit address
      console.log(`\n  → ${dep.usdt} USDT gönderiliyor (${dep.desc})...`);
      const result = await transferUSDT(adminDepositAddr, dep.usdt);

      if (!result.success) {
        console.log(`  ✗ Transfer başarısız: ${result.error}`);
        continue;
      }
      console.log(`  ✓ TX broadcast edildi: ${result.txHash}`);
      console.log(`  ⏳ Onay bekleniyor...`);

      // Onay bekle
      const confirmed = await waitForConfirmation(adminDepositAddr, dep.usdt, now);
      if (!confirmed) {
        console.log(`  ✗ Onay zaman aşımı — transfer bulunamadı`);
        continue;
      }
      console.log(`  ✓ Onaylandı! txHash: ${confirmed.transaction_id?.slice(0, 16)}...`);

      // Bakiyeyi güncelle (auto-credit)
      const before = balance;
      balance = fmt(balance + tryAmt);

      const depDoc = await CryptoDeposit.create({
        userId: ADMIN_ID, txHash: result.txHash,
        fromAddress: hotWallet, toAddress: adminDepositAddr,
        usdtAmount: dep.usdt, creditedTRY: tryAmt,
        status: 'credited', creditedAt: new Date(),
        createdAt: new Date(now), updatedAt: new Date(now),
      });

      await Transaction.create({
        userId: ADMIN_ID, type: 'crypto_deposit', amount: tryAmt,
        balanceBefore: before, balanceAfter: fmt(balance),
        note: `USDT TRC20 ${dep.usdt} USDT (tx: ${result.txHash.slice(0, 12)}...) — Otomatik onaylandı (< $100)`,
        status: 'completed', cryptoDepositId: depDoc._id,
        createdAt: new Date(now), updatedAt: new Date(now),
      });

      log.push(`+${tryAmt}₺ yatırıldı (auto, tx: ${result.txHash.slice(0, 12)}) | bakiye: ${before} → ${fmt(balance)} | çekilebilir: ${fmt(balance)}`);
      console.log(`  ✓ +${tryAmt}₺ bakiyeye eklendi. Yeni bakiye: ${fmt(balance)}₺`);
      // DB bakiyesini güncelle — HER yatırma/çekim sonrası zorunlu
      admin.balance = fmt(balance);
      await admin.save();

    } else {
      // Pending: sadece DB kaydı, transfer yok (admin onayı bekliyor)
      console.log(`\n  ⏳ ${dep.usdt} USDT pending kaydı oluşturuluyor (${dep.desc})...`);

      const depDoc = await CryptoDeposit.create({
        userId: ADMIN_ID, txHash,
        fromAddress: 'TPending_' + Math.random().toString(36).slice(2, 6),
        toAddress: adminDepositAddr,
        usdtAmount: dep.usdt, creditedTRY: tryAmt,
        status: 'pending_approval', creditedAt: null,
        createdAt: ts(deposits.indexOf(dep) * -30 - 30), updatedAt: ts(deposits.indexOf(dep) * -30 - 30),
      });

      await Transaction.create({
        userId: ADMIN_ID, type: 'crypto_deposit', amount: tryAmt,
        balanceBefore: fmt(balance), balanceAfter: fmt(balance),
        note: `Bekleyen yatırma: ${dep.usdt} USDT (tx: ${txHash.slice(0, 12)}...) — $${dep.usdt} > $100 limiti, admin onayı bekliyor`,
        status: 'pending', cryptoDepositId: depDoc._id,
        createdAt: ts(deposits.indexOf(dep) * -30 - 30), updatedAt: ts(deposits.indexOf(dep) * -30 - 30),
      });

      log.push(`⏳${dep.usdt} USDT pending | bakiye: ${fmt(balance)} (değişmedi)`);
      console.log(`  ✓ Pending kayıt oluşturuldu`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. BONUS YÜKLEMESİ (20:32)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ BONUS ═══');
  console.log('  500₺ bonus zaten mevcut (wagering record)');
  // Bonus zaten DB'de, bakiyeye de yansıtılmalı
  balance = fmt(balance + 500);
  admin.balance = fmt(balance);
  await admin.save();
  log.push(`+500₺ bonus yüklendi | bakiye: ${fmt(balance)} | çekilebilir: ${fmt(balance - 500)}`);
  console.log(`  ✓ Bakiye: ${fmt(balance)}₺, bonus kilit: 500₺, çekilebilir: ${fmt(balance - 500)}₺`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. ÇEKİMLER — Gerçek testnet transferleri
  // ═══════════════════════════════════════════════════════════════════════════
  const breakdown = await getSpendableBreakdown(ADMIN_ID);
  const withdrawable = breakdown.withdrawable;
  console.log(`\n═══ ÇEKİMLER (çekilebilir: ${withdrawable}₺) ═══`);

  // Çekim 1: 10 USDT auto (< $15, withdrawable yeterli)
  const wd1Amount = 10;
  const wd1Try = fmt(wd1Amount * RATE);
  if (withdrawable >= wd1Try) {
    console.log(`\n  → ${wd1Amount} USDT gönderiliyor (auto, < $15)...`);
    const wd1Result = await transferUSDT(deriveDepositAddress(99), wd1Amount); // Dış adres
    if (wd1Result.success) {
      console.log(`  ✓ TX: ${wd1Result.txHash.slice(0, 16)}...`);
      const before1 = balance;
      balance = fmt(balance - wd1Try);

      await Transaction.create({
        userId: ADMIN_ID, type: 'crypto_withdraw', amount: -wd1Try,
        balanceBefore: before1, balanceAfter: fmt(balance),
        note: `${wd1Amount} USDT → ${deriveDepositAddress(99)} (tx: ${wd1Result.txHash.slice(0, 12)}...) — Otomatik gönderildi (< $15)`,
        status: 'completed', createdAt: ts(15), updatedAt: ts(15),
      });

      log.push(`-${wd1Try}₺ gönderildi (auto, tx: ${wd1Result.txHash.slice(0, 12)}) | bakiye: ${before1} → ${fmt(balance)}`);
      console.log(`  ✓ -${wd1Try}₺ bakiyeden düştü. Yeni bakiye: ${fmt(balance)}₺`);
      // DB bakiyesini güncelle
      admin.balance = fmt(balance);
      await admin.save();
    } else {
      console.log(`  ✗ Transfer başarısız: ${wd1Result.error}`);
    }
  }

  // Çekim 2: 50 USDT pending ($50 > $15, withdrawable yeterli)
  const wd2Amount = 50;
  const wd2Try = fmt(wd2Amount * RATE);
  const currentBreakdown = await getSpendableBreakdown(ADMIN_ID);
  console.log(`\n  ⏳ ${wd2Amount} USDT pending (çekilebilir: ${currentBreakdown.withdrawable}₺)...`);
  if (currentBreakdown.withdrawable >= wd2Try) {
    const before2 = balance;
    balance = fmt(balance - wd2Try);

    await Transaction.create({
      userId: ADMIN_ID, type: 'crypto_withdraw', amount: -wd2Try,
      balanceBefore: before2, balanceAfter: fmt(balance),
      note: `${wd2Amount} USDT → ${deriveDepositAddress(99)} — $50 > $15 limiti, admin onayı bekliyor`,
      status: 'pending', createdAt: ts(5), updatedAt: ts(5),
    });

    log.push(`⏳-${wd2Try}₺ pending | bakiye: ${before2} → ${fmt(balance)} | çekilebilir: ${fmt(balance - 500)}`);
    console.log(`  ✓ Pending. Bakiye: ${fmt(balance)}₺`);
    // DB bakiyesini güncelle
    admin.balance = fmt(balance);
    await admin.save();
  } else {
    console.log(`  ✗ Çekilebilir yetersiz (${currentBreakdown.withdrawable} < ${wd2Try})`);
  }

  // Çekim 3: 100 USDT — RED (çekilebilir yetersiz)
  const wd3Amount = 100;
  const wd3Try = fmt(wd3Amount * RATE);
  const finalBreakdown = await getSpendableBreakdown(ADMIN_ID);
  console.log(`\n  ❌ ${wd3Amount} USDT red testi (çekilebilir: ${finalBreakdown.withdrawable}₺)...`);
  if (finalBreakdown.withdrawable < wd3Try) {
    await Transaction.create({
      userId: ADMIN_ID, type: 'crypto_withdraw', amount: -wd3Try,
      balanceBefore: fmt(balance), balanceAfter: fmt(balance),
      note: `${wd3Amount} USDT → ${deriveDepositAddress(99)} — REDDEDİLDİ: Çekilebilir bakiye yetersiz (${finalBreakdown.withdrawable}₺ mevcut, ${wd3Try}₺ talep edildi). Bonus kilidi: 500₺`,
      status: 'rejected', createdAt: ts(1), updatedAt: ts(1),
    });
    log.push(`❌${wd3Try}₺ RED (çekilebilir: ${finalBreakdown.withdrawable} < ${wd3Try}) | bakiye: ${fmt(balance)} (değişmedi)`);
    console.log(`  ✓ Red kaydı oluşturuldu`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÖZET
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ZAMAN ÇİZELGESİ');
  console.log('═══════════════════════════════════════════════════════════');
  for (const l of log) console.log(`  ${l}`);

  const finalBal = await User.findById(ADMIN_ID).select('balance bonusBalance');
  console.log(`\n═══ FINAL ═══`);
  console.log(`Bakiye:      ${finalBal.balance}₺`);
  console.log(`Bonus Kilit: ${finalBal.bonusBalance}₺`);
  console.log(`Çekilebilir: ${fmt(finalBal.balance - finalBal.bonusBalance)}₺`);

  const txAll = await Transaction.find({ userId: ADMIN_ID }).sort({ createdAt: -1 });
  console.log(`\n═══ İŞLEMLER (${txAll.length}) ═══`);
  for (const tx of txAll) {
    const arrow = tx.amount > 0 ? '+' : '';
    const t = tx.createdAt.toISOString().slice(0, 16).replace('T', ' ');
    console.log(`  ${t} | ${tx.type.padEnd(18)} | ${arrow}${tx.amount}₺ | ${tx.status.padEnd(10)} | ${tx.note?.slice(0, 55)}`);
  }

  // Hot wallet bakiyesi
  try {
    const { getHotWalletBalance } = await import('./src/services/cryptoService.js');
    const hw = await getHotWalletBalance();
    console.log(`\n═══ HOT WALLET ═══`);
    console.log(`USDT: ${hw.usdt} | Adres: ${hw.address}`);
  } catch (e) {
    console.log(`\nHot wallet bakiye sorgu hatası: ${e.message}`);
  }

  await mongoose.disconnect();
  console.log('\nTamamlandı.');
}

seed().catch(e => { console.error(e); process.exit(1); });
