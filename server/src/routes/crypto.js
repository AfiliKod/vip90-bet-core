import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import CryptoDeposit from '../models/CryptoDeposit.js';
import { deriveDepositAddress, fetchIncomingUSDT } from '../services/cryptoService.js';

const r = Router();
r.use(requireAuth);

// Kullanıcı başına index sayacı — DB'de sequential sayaç için
async function assignDepositIndex(user) {
  if (user.cryptoDepositIndex !== null && user.cryptoDepositIndex !== undefined) {
    return user.cryptoDepositIndex;
  }
  // Şu ana kadar atanmış en yüksek index + 1
  const last = await User.findOne(
    { cryptoDepositIndex: { $ne: null } },
    { cryptoDepositIndex: 1 }
  ).sort({ cryptoDepositIndex: -1 });
  const nextIndex = (last?.cryptoDepositIndex ?? -1) + 1;
  user.cryptoDepositIndex = nextIndex;
  await user.save();
  return nextIndex;
}

// ── GET /api/crypto/deposit-address ──────────────────────────────────────────
// Kullanıcıya özel TRC20 USDT deposit adresi döndürür.
r.get('/deposit-address', async (req, res, next) => {
  try {
    if (!process.env.CRYPTO_SEED_PHRASE) {
      return res.status(503).json({ error: 'Kripto ödemesi henüz aktif değil' });
    }
    const user  = await User.findById(req.user.id);
    const index = await assignDepositIndex(user);
    const address = deriveDepositAddress(index);
    res.json({ address, network: 'TRC20', token: 'USDT' });
  } catch (e) { next(e); }
});

// ── POST /api/crypto/check-deposit ───────────────────────────────────────────
// TronGrid'i sorgula, yeni gelen USDT'yi balance'a ekle.
// Rate: %1 USDT/TRY dönüşüm oranı env'den alınır (USDT_TRY_RATE, default 1)
r.post('/check-deposit', async (req, res, next) => {
  try {
    if (!process.env.CRYPTO_SEED_PHRASE) {
      return res.status(503).json({ error: 'Kripto ödemesi henüz aktif değil' });
    }
    const user = await User.findById(req.user.id);
    if (user.cryptoDepositIndex === null || user.cryptoDepositIndex === undefined) {
      return res.json({ credited: [], newBalance: user.balance });
    }

    const address  = deriveDepositAddress(user.cryptoDepositIndex);
    const txList   = await fetchIncomingUSDT(address);
    const rate     = parseFloat(process.env.USDT_TRY_RATE || '1');
    const credited = [];

    for (const tx of txList) {
      const txHash = tx.transaction_id;
      // Daha önce işlendi mi?
      const exists = await CryptoDeposit.findOne({ txHash });
      if (exists) continue;

      const usdtRaw    = Number(tx.value);          // 6 decimal (1 USDT = 1_000_000)
      const usdtAmount = usdtRaw / 1_000_000;
      const tryAmount  = +(usdtAmount * rate).toFixed(2);

      if (tryAmount <= 0) continue;

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const fresh       = await User.findById(user._id).session(session);
        const balBefore   = fresh.balance;
        fresh.balance     = +(fresh.balance + tryAmount).toFixed(2);
        await fresh.save({ session });

        await Transaction.create([{
          userId: fresh._id,
          type: 'crypto_deposit',
          amount: tryAmount,
          balanceBefore: balBefore,
          balanceAfter: fresh.balance,
          note: `USDT TRC20 ${usdtAmount.toFixed(2)} USDT (tx: ${txHash.slice(0, 12)}...)`,
          status: 'completed',
        }], { session });

        await CryptoDeposit.create([{
          userId: fresh._id,
          txHash,
          fromAddress: tx.from,
          toAddress: address,
          usdtAmount,
          creditedTRY: tryAmount,
          status: 'credited',
          creditedAt: new Date(),
        }], { session });

        await session.commitTransaction();
        user.balance = fresh.balance;
        credited.push({ txHash, usdtAmount, tryAmount });
        console.log(`[crypto] ${fresh._id} → +${tryAmount}₺ (${usdtAmount} USDT, tx:${txHash.slice(0,12)})`);
      } catch (e) {
        await session.abortTransaction();
        console.error('[crypto] TX işleme hatası:', txHash, e.message);
      } finally {
        session.endSession();
      }
    }

    res.json({ credited, newBalance: user.balance });
  } catch (e) { next(e); }
});

// ── POST /api/crypto/withdraw-request ────────────────────────────────────────
// Çekim talebi oluşturur (manuel işlem — admin onaylar).
r.post('/withdraw-request', async (req, res, next) => {
  try {
    const { address, usdtAmount } = req.body;
    if (!address || !usdtAmount || usdtAmount < 5) {
      return res.status(400).json({ error: 'Geçersiz adres veya miktar (min 5 USDT)' });
    }
    // Basit TRC20 adres doğrulama (T ile başlayıp 34 karakter)
    if (!/^T[A-Za-z0-9]{33}$/.test(address)) {
      return res.status(400).json({ error: 'Geçersiz TRC20 adresi' });
    }

    const rate     = parseFloat(process.env.USDT_TRY_RATE || '1');
    const tryNeeded = +(usdtAmount * rate).toFixed(2);

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(req.user.id).session(session);
      if (user.balance < tryNeeded) {
        await session.abortTransaction();
        return res.status(400).json({ error: 'Yetersiz bakiye' });
      }
      const balBefore = user.balance;
      user.balance    = +(user.balance - tryNeeded).toFixed(2);
      await user.save({ session });

      await Transaction.create([{
        userId: user._id,
        type: 'crypto_withdraw',
        amount: -tryNeeded,
        balanceBefore: balBefore,
        balanceAfter: user.balance,
        note: `Çekim talebi: ${usdtAmount} USDT → ${address}`,
        status: 'pending',
      }], { session });

      await session.commitTransaction();
      res.json({ newBalance: user.balance, message: `${usdtAmount} USDT çekim talebiniz alındı (24 saat içinde işlenir)` });
    } catch (e) {
      await session.abortTransaction();
      next(e);
    } finally {
      session.endSession();
    }
  } catch (e) { next(e); }
});

export default r;
