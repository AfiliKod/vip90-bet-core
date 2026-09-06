import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import CryptoDeposit from '../models/CryptoDeposit.js';
import { deriveDepositAddress, fetchIncomingUSDT } from '../services/cryptoService.js';
import { formatMoney } from '../currency/index.js';
import { CRYPTO_SETTINGS, shouldAutoCredit, shouldAutoProcessWithdraw } from '../config/crypto.js';

const r = Router();
r.use(requireAuth);

// Kullanıcı başına index sayacı — DB'de sequential sayaç için
async function assignDepositIndex(user) {
  if (user.cryptoDepositIndex !== null && user.cryptoDepositIndex !== undefined) {
    return user.cryptoDepositIndex;
  }
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
// Otomatik yatırma: $100 altı otomatik hesaba eklenir, $100+ admin onayı bekler
r.post('/check-deposit', async (req, res, next) => {
  try {
    if (!process.env.CRYPTO_SEED_PHRASE) {
      return res.status(503).json({ error: 'Kripto ödemesi henüz aktif değil' });
    }
    const user = await User.findById(req.user.id);
    if (user.cryptoDepositIndex === null || user.cryptoDepositIndex === undefined) {
      return res.json({ credited: [], pendingApproval: [], newBalance: user.balance });
    }

    const address  = deriveDepositAddress(user.cryptoDepositIndex);
    const txList   = await fetchIncomingUSDT(address);
    const rate     = parseFloat(process.env.USDT_TRY_RATE || '1');
    const credited = [];
    const pendingApproval = [];

    for (const tx of txList) {
      const txHash = tx.transaction_id;
      const exists = await CryptoDeposit.findOne({ txHash });
      if (exists) continue;

      const usdtRaw    = Number(tx.value);
      const usdtAmount = usdtRaw / 1_000_000;
      const tryAmount  = +(usdtAmount * rate).toFixed(2);

      if (tryAmount <= 0) continue;

      const autoCredit = shouldAutoCredit(usdtAmount);

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const fresh     = await User.findById(user._id).session(session);
        const balBefore = fresh.balance;

        if (autoCredit) {
          // Otomatik hesaba ekle
          fresh.balance = +(fresh.balance + tryAmount).toFixed(2);
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
          console.log(`[crypto] ${fresh._id} → +${await formatMoney(tryAmount)} (${usdtAmount} USDT, tx:${txHash.slice(0,12)})`);
        } else {
          // Admin onayına gönder
          await CryptoDeposit.create([{
            userId: fresh._id,
            txHash,
            fromAddress: tx.from,
            toAddress: address,
            usdtAmount,
            creditedTRY: tryAmount,
            status: 'pending_approval',
            creditedAt: null,
          }], { session });

          await Transaction.create([{
            userId: fresh._id,
            type: 'crypto_deposit',
            amount: tryAmount,
            balanceBefore: balBefore,
            balanceAfter: balBefore,  // Bakiye değişmedi
            note: `Bekleyen yatırma: ${usdtAmount.toFixed(2)} USDT (tx: ${txHash.slice(0, 12)}...) — Admin onayı bekliyor`,
            status: 'pending',
          }], { session });

          await session.commitTransaction();
          pendingApproval.push({ txHash, usdtAmount, tryAmount });
          console.log(`[crypto] ${fresh._id} → BEKLEYEN: ${usdtAmount} USDT (tx:${txHash.slice(0,12)}) — Admin onayı bekliyor`);
        }
      } catch (e) {
        await session.abortTransaction();
        console.error('[crypto] TX processing error:', txHash, e.message);
      } finally {
        session.endSession();
      }
    }

    res.json({ credited, pendingApproval, newBalance: user.balance });
  } catch (e) { next(e); }
});

// ── POST /api/crypto/withdraw-request ────────────────────────────────────────
// Otomatik çekim: $15 altı otomatik işlenir, $15+ admin onayı bekler
r.post('/withdraw-request', async (req, res, next) => {
  try {
    const { address, usdtAmount } = req.body;
    if (!address || !usdtAmount || usdtAmount < CRYPTO_SETTINGS.minWithdraw) {
      return res.status(400).json({ error: `Geçersiz adres veya miktar (min ${CRYPTO_SETTINGS.minWithdraw} USDT)` });
    }
    if (!/^T[A-Za-z0-9]{33}$/.test(address)) {
      return res.status(400).json({ error: 'Geçersiz TRC20 adresi' });
    }

    const rate      = parseFloat(process.env.USDT_TRY_RATE || '1');
    const tryNeeded = +(usdtAmount * rate).toFixed(2);
    const autoProcess = shouldAutoProcessWithdraw(usdtAmount);

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

      if (autoProcess) {
        // Otomatik işlenir (şimdilik sadece bakiyeyi düş, gerçek transfer sonra yapılacak)
        await Transaction.create([{
          userId: user._id,
          type: 'crypto_withdraw',
          amount: -tryNeeded,
          balanceBefore: balBefore,
          balanceAfter: user.balance,
          note: `Çekim talebi: ${usdtAmount} USDT → ${address} (otomatik işlendi)`,
          status: 'completed',
        }], { session });

        await session.commitTransaction();
        res.json({
          newBalance: user.balance,
          autoProcessed: true,
          message: `${usdtAmount} USDT çekiminiz otomatik olarak işlendi`,
        });
      } else {
        // Admin onayına gönder
        await Transaction.create([{
          userId: user._id,
          type: 'crypto_withdraw',
          amount: -tryNeeded,
          balanceBefore: balBefore,
          balanceAfter: user.balance,
          note: `Çekim talebi: ${usdtAmount} USDT → ${address} — Admin onayı bekliyor`,
          status: 'pending',
        }], { session });

        await session.commitTransaction();
        res.json({
          newBalance: user.balance,
          autoProcessed: false,
          message: `${usdtAmount} USDT çekim talebiniz alındı — Admin onayı bekliyor`,
        });
      }
    } catch (e) {
      await session.abortTransaction();
      next(e);
    } finally {
      session.endSession();
    }
  } catch (e) { next(e); }
});

// ── GET /api/crypto/settings ─────────────────────────────────────────────────
// Mevcut crypto ayarlarını döndür (admin paneli için)
r.get('/settings', (req, res) => {
  res.json(CRYPTO_SETTINGS);
});

export default r;
