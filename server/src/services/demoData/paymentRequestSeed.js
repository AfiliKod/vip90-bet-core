// server/src/services/demoData/paymentRequestSeed.js
import crypto from 'node:crypto';
import BankDepositRequest from '../../models/BankDepositRequest.js';
import CryptoDeposit from '../../models/CryptoDeposit.js';
import SlikairPayment from '../../models/SlikairPayment.js';
import Transaction from '../../models/Transaction.js';
import { CRYPTO_SETTINGS } from '../../config/crypto.js';
import { getSeedUserPool, load as loadUsers } from './userSeed.js';
import { pick, pickWeighted, randomFloat, randomPastDate } from './randomUtils.js';

// Wallet → Crypto sekmesi CryptoDeposit'i değil Transaction (crypto_deposit /
// crypto_withdraw) listeler ve onay uçları Transaction kimliği bekler; bu yüzden
// her seed CryptoDeposit için eşleşen bir Transaction da üretilir.
const DEPOSIT_TX_STATUS = {
  pending_approval: 'pending',
  credited: 'completed',
  confirmed: 'completed',
  rejected: 'rejected',
};

function depositNote(dep, txStatus) {
  const usdt = dep.usdtAmount.toFixed(2);
  const ref = `tx: ${dep.txHash.slice(0, 12)}...`;
  if (txStatus === 'pending') return `Bekleyen yatırma: ${usdt} USDT (${ref}) — Admin onayı bekliyor`;
  if (txStatus === 'rejected') return `Bekleyen yatırma: ${usdt} USDT (${ref}) — Reddedildi`;
  return `USDT TRC20 ${usdt} USDT (${ref})`;
}

function depositTransaction(dep) {
  const status = DEPOSIT_TX_STATUS[dep.status] || 'completed';
  const balanceBefore = randomFloat(0, 20000);
  return {
    userId: dep.userId,
    type: 'crypto_deposit',
    amount: dep.creditedTRY,
    balanceBefore,
    balanceAfter: status === 'completed' ? +(balanceBefore + dep.creditedTRY).toFixed(2) : balanceBefore,
    status,
    note: depositNote(dep, status),
    cryptoDepositId: dep._id,
    source: status === 'completed' && dep.status !== 'pending_approval' ? 'system' : 'player',
    isSeed: true,
    createdAt: dep.createdAt,
  };
}

// Not formatı ("{usdt} USDT → {adres}") gerçek çekim akışıyla aynıdır; ancak
// adres kasıtlı olarak T-adresi değil: approveCryptoWithdrawal adresi nottan
// regex ile okuyup transferUSDT çağırdığı için, seed satırı onaylansa bile
// parse hatası (400) alır ve zincire asla para gönderilmez.
function withdrawTransaction({ userId, createdAt, index }) {
  const rate = CRYPTO_SETTINGS.usdtTryRate || 1;
  const usdtAmount = randomFloat(10, 500);
  const tryAmount = +(usdtAmount * rate).toFixed(2);
  const status = pickWeighted([['pending', 40], ['completed', 40], ['rejected', 20]]);
  const address = `seed_wallet_w${index}`;
  const balanceBefore = +(tryAmount + randomFloat(0, 20000)).toFixed(2);
  const note = {
    pending: `${usdtAmount} USDT → ${address} — Admin onayı bekliyor`,
    completed: `${usdtAmount} USDT → ${address} (tx: seed_${crypto.randomBytes(6).toString('hex')}...)`,
    rejected: `${usdtAmount} USDT → ${address} — Reddedildi, bakiye iade edildi`,
  }[status];
  return {
    userId,
    type: 'crypto_withdraw',
    amount: -tryAmount,
    balanceBefore,
    balanceAfter: +(balanceBefore - tryAmount).toFixed(2),
    status,
    note,
    metadata: { toAddress: address, usdtAmount },
    source: 'player',
    isSeed: true,
    createdAt,
  };
}

async function ensureUserPool() {
  let pool = await getSeedUserPool(500);
  if (!pool.length) {
    await loadUsers(20);
    pool = await getSeedUserPool(500);
  }
  return pool;
}

export async function status() {
  const [bank, cryptoCount, slikair, cryptoWithdraws] = await Promise.all([
    BankDepositRequest.countDocuments({ isSeed: true }),
    CryptoDeposit.countDocuments({ isSeed: true }),
    SlikairPayment.countDocuments({ isSeed: true }),
    Transaction.countDocuments({ isSeed: true, type: 'crypto_withdraw' }),
  ]);
  return { count: bank + cryptoCount + slikair + cryptoWithdraws };
}

export async function load(count) {
  const pool = await ensureUserPool();
  const bankDocs = [], cryptoDocs = [], slikairDocs = [], withdrawTxDocs = [];

  for (let i = 0; i < count; i++) {
    const userId = pick(pool)._id;
    const createdAt = randomPastDate(90);
    const channel = pick(['bank', 'bank', 'crypto', 'crypto_withdraw', 'slikair']);

    if (channel === 'bank') {
      bankDocs.push({
        userId, type: pick(['deposit', 'withdraw']), amount: randomFloat(100, 5000),
        status: pickWeighted([['pending', 40], ['approved', 45], ['rejected', 15]]),
        isSeed: true, createdAt,
      });
    } else if (channel === 'crypto') {
      cryptoDocs.push({
        userId, txHash: `seed_${crypto.randomBytes(16).toString('hex')}`,
        toAddress: `seed_wallet_${i}`, usdtAmount: randomFloat(20, 1000),
        creditedTRY: randomFloat(700, 35000),
        status: pickWeighted([['confirmed', 30], ['credited', 50], ['pending_approval', 15], ['rejected', 5]]),
        isSeed: true, createdAt,
      });
    } else if (channel === 'crypto_withdraw') {
      withdrawTxDocs.push(withdrawTransaction({ userId, createdAt, index: i }));
    } else {
      slikairDocs.push({
        userId, requestId: `seed_${crypto.randomBytes(12).toString('hex')}`,
        amount: randomFloat(20, 1500), currency: 'EUR', paymentMethod: 'card',
        email: `seed_payment_${i}@seed.local`, country: 'TR',
        status: pickWeighted([['succeeded', 60], ['created', 15], ['failed', 15], ['pending', 10]]),
        isSeed: true, createdAt,
      });
    }
  }

  const results = await Promise.all([
    bankDocs.length ? BankDepositRequest.insertMany(bankDocs) : [],
    cryptoDocs.length ? CryptoDeposit.insertMany(cryptoDocs) : [],
    slikairDocs.length ? SlikairPayment.insertMany(slikairDocs) : [],
    withdrawTxDocs.length ? Transaction.insertMany(withdrawTxDocs) : [],
  ]);
  // Eşleşen Transaction'lar (Wallet → Crypto bunları listeler); `created` sayacına
  // dahil değil — her CryptoDeposit zaten bir kayıt olarak sayıldı.
  const [, createdDeposits] = results;
  if (createdDeposits.length) await Transaction.insertMany(createdDeposits.map(depositTransaction));
  return { created: results.reduce((sum, r) => sum + r.length, 0) };
}

export async function clear() {
  const [bank, cryptoResult, slikair, , withdrawTxs] = await Promise.all([
    BankDepositRequest.deleteMany({ isSeed: true }),
    CryptoDeposit.deleteMany({ isSeed: true }),
    SlikairPayment.deleteMany({ isSeed: true }),
    Transaction.deleteMany({ isSeed: true, type: 'crypto_deposit' }),
    Transaction.deleteMany({ isSeed: true, type: 'crypto_withdraw' }),
  ]);
  // Sayaç yalnız birincil kayıtlar: deposit-Transaction'lar CryptoDeposit'in eşi.
  return { deleted: bank.deletedCount + cryptoResult.deletedCount + slikair.deletedCount + withdrawTxs.deletedCount };
}

export async function liveTick() {
  const pool = await getSeedUserPool(500);
  if (!pool.length) return null;
  const userId = pick(pool)._id;
  await BankDepositRequest.create({
    userId, type: 'deposit', amount: randomFloat(100, 2000), status: 'pending', isSeed: true,
  });
  return { userId };
}
