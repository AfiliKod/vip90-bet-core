import { Router } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { enforceResponsibleGaming } from '../middleware/responsibleGaming.js';
import { enforceRiskCheck } from '../middleware/risk.js';
import { requireKycForWithdrawal } from '../middleware/kycGate.js';
import { withdrawRequestSchema } from '../validators/crypto.js';
import User from '../models/User.js';
import CryptoDeposit from '../models/CryptoDeposit.js';
import { deriveDepositAddress, fetchIncomingUSDT, transferUSDT, getHotWalletBalance } from '../services/cryptoService.js';
import { getSpendableBreakdown } from '../services/wagering.js';
import { formatMoney } from '../currency/index.js';
import { CRYPTO_SETTINGS, shouldAutoCredit, shouldAutoProcessWithdraw } from '../config/crypto.js';
import { updateDailyStats } from '../services/responsibleGaming.js';
import { createTransaction, adjustBalance } from '../services/ledger.js';
import Transaction from '../models/Transaction.js';
import { withTransactionRetry } from '../utils/transactionRetry.js';

const r = Router();
r.use(requireAuth);

// Kullanıcı başına index sayacı — DB'de sequential sayaç için
// Index 0 hot wallet'a ait, kullanıcı deposit adresleri 1'den başlar
async function assignDepositIndex(user) {
  if (user.cryptoDepositIndex !== null && user.cryptoDepositIndex !== undefined) {
    return user.cryptoDepositIndex;
  }
  const last = await User.findOne(
    { cryptoDepositIndex: { $ne: null } },
    { cryptoDepositIndex: 1 }
  ).sort({ cryptoDepositIndex: -1 });
  // Hot wallet index 0'ı kullanır, kullanıcı adresleri 1'den başlar
  const nextIndex = Math.max(1, (last?.cryptoDepositIndex ?? 0) + 1);
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
r.post('/check-deposit', enforceRiskCheck('deposit'), async (req, res, next) => {
  try {
    if (!process.env.CRYPTO_SEED_PHRASE) {
      return res.status(503).json({ error: 'Kripto ödemesi henüz aktif değil' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return next(createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı'));

    // Self-exclusion / cool-off / account-restricted check (amount unknown yet)
    const { checkPlayerEligibility } = await import('../services/responsibleGaming.js');
    const eligibility = await checkPlayerEligibility(req.user.id, 'deposit', { amount: 0 });
    if (eligibility === 'BLOCK') {
      return next(createError(403, 'ACCOUNT_RESTRICTED', 'Hesabınız sorumlu oyun nedeniyle kısıtlıdır'));
    }

    if (user.cryptoDepositIndex === null || user.cryptoDepositIndex === undefined) {
      return res.json({ credited: [], pendingApproval: [], newBalance: user.balance });
    }

    const address  = deriveDepositAddress(user.cryptoDepositIndex);
    const txList   = await fetchIncomingUSDT(address);
    const rate     = CRYPTO_SETTINGS.usdtTryRate;
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
          // Otomatik hesaba ekle (atomik; aynı txHash'in ikinci kez işlenmesini
          // CryptoDeposit.txHash tekilliği ve işlem içi defter koruması engeller)
          const adjusted = await adjustBalance(fresh._id, tryAmount, { session });
          fresh.balance = adjusted.balanceAfter;

          const [dep] = await CryptoDeposit.create([{
            userId: fresh._id,
            txHash,
            fromAddress: tx.from,
            toAddress: address,
            usdtAmount,
            creditedTRY: tryAmount,
            status: 'credited',
            creditedAt: new Date(),
          }], { session });

          await createTransaction({
            userId: fresh._id,
            type: 'crypto_deposit',
            amount: tryAmount,
            balanceBefore: balBefore,
            balanceAfter: fresh.balance,
            note: `USDT TRC20 ${usdtAmount.toFixed(2)} USDT (tx: ${txHash.slice(0, 12)}...)`,
            status: 'completed',
            cryptoDepositId: dep._id,
            idempotencyKey: `crypto_deposit_${txHash}`,
            source: 'system',
          }, { session });

          await session.commitTransaction();
          user.balance = fresh.balance;
          await updateDailyStats(fresh._id, 'deposit', tryAmount).catch((e) => {
            console.error('[RG] updateDailyStats (crypto deposit) failed:', e.message);
          });
          credited.push({ txHash, usdtAmount, tryAmount });
          console.log(`[crypto] ${fresh._id} → +${await formatMoney(tryAmount)} (${usdtAmount} USDT, tx:${txHash.slice(0,12)})`);
        } else {
          // Admin onayına gönder
          const [dep] = await CryptoDeposit.create([{
            userId: fresh._id,
            txHash,
            fromAddress: tx.from,
            toAddress: address,
            usdtAmount,
            creditedTRY: tryAmount,
            status: 'pending_approval',
            creditedAt: null,
          }], { session });

          await createTransaction({
            userId: fresh._id,
            type: 'crypto_deposit',
            amount: tryAmount,
            balanceBefore: balBefore,
            balanceAfter: balBefore,
            note: `Bekleyen yatırma: ${usdtAmount.toFixed(2)} USDT (tx: ${txHash.slice(0, 12)}...) — Admin onayı bekliyor`,
            status: 'pending',
            cryptoDepositId: dep._id,
            idempotencyKey: `crypto_deposit_pending_${txHash}`,
            source: 'system',
          }, { session });

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
// Çekim: withdrawable bakiye kontrolü + hot wallet transfer
r.post('/withdraw-request', requireKycForWithdrawal(), enforceRiskCheck('withdraw'), enforceResponsibleGaming('withdraw'), validate(withdrawRequestSchema), async (req, res, next) => {
  try {
    const { address, usdtAmount, confirmForfeit } = req.validated;
    if (usdtAmount < CRYPTO_SETTINGS.minWithdraw) {
      return res.status(400).json({ error: `Miktar minimum ${CRYPTO_SETTINGS.minWithdraw} USDT olmalı` });
    }
    if (!/^T[A-Za-z0-9]{33}$/.test(address)) {
      return res.status(400).json({ error: 'Geçersiz TRC20 adresi' });
    }

    const rate      = CRYPTO_SETTINGS.usdtTryRate;
    const tryNeeded = +(usdtAmount * rate).toFixed(2);

    // 1. Withdrawable bakiye kontrolü
    const breakdown = await getSpendableBreakdown(req.user.id);
    if (breakdown.withdrawable < tryNeeded) {
      // Aktif bonus varsa forfeit onayı iste
      if (breakdown.locked > 0 && !confirmForfeit) {
        const { previewForfeitAmount } = await import('../services/wagering.js');
        const forfeitPreview = await previewForfeitAmount(req.user.id);
        const predictedWithdrawable = Math.max(0, parseFloat((breakdown.balance - forfeitPreview).toFixed(2)));
        return res.status(409).json({
          error: 'ACTIVE_BONUS_LOCK',
          locked: breakdown.locked,
          withdrawable: breakdown.withdrawable,
          predictedWithdrawable,
          message: `${breakdown.locked}₺ bonus kilitli. Forfeit ederseniz ${predictedWithdrawable}₺ çekebilirsiniz. Devam etmek için confirmForfeit: true gönderin.`,
        });
      }
      return res.status(400).json({
        error: 'Yetersiz bakiye',
        balance: breakdown.balance,
        locked: breakdown.locked,
        withdrawable: breakdown.withdrawable,
      });
    }

    // 2. Bonus forfeit gerekli mi?
    if (breakdown.locked > 0 && confirmForfeit) {
      const { forfeitActiveWagerings } = await import('../services/wagering.js');
      await forfeitActiveWagerings(req.user.id);
    }

    // 3. Hot wallet bakiyesini kontrol et
    const hotWallet = await getHotWalletBalance();
    if (hotWallet.usdt < usdtAmount) {
      return res.status(503).json({
        error: 'Hot wallet bakiyesi yetersiz',
        hotWalletBalance: hotWallet.usdt,
        requested: usdtAmount,
      });
    }

    // 4. Bakiyeyi düş (yeterlilik koşullu, atomik) + kaydı yaz → commit.
    //    USDT ancak commit'ten SONRA gönderilir (2026-10-12). Önceden transfer
    //    işlemin İÇİNDE yapılıyordu: commit çakışmayla geri alınırsa oyuncu
    //    USDT'yi alıyor, bakiyesi de geri geliyordu; ayrıca işlem içinde
    //    bakiye yeniden denetlenmediği için eşzamanlı talepler bakiyeyi eksiye
    //    düşürebiliyordu.
    const autoProcess = shouldAutoProcessWithdraw(usdtAmount);
    const session = await mongoose.startSession();
    let reserved;
    try {
      reserved = await withTransactionRetry(session, async () => {
        const adjusted = await adjustBalance(req.user.id, -tryNeeded, { session, requireFunds: true });
        if (!adjusted) throw createError(400, 'INSUFFICIENT_BALANCE', 'Yetersiz bakiye');
        const { transaction } = await createTransaction({
          userId: req.user.id,
          type: 'crypto_withdraw',
          amount: -tryNeeded,
          balanceBefore: adjusted.balanceBefore,
          balanceAfter: adjusted.balanceAfter,
          note: autoProcess ? `${usdtAmount} USDT → ${address} — gönderiliyor` : `${usdtAmount} USDT → ${address} — Admin onayı bekliyor`,
          status: autoProcess ? 'processing' : 'pending',
          metadata: { toAddress: address, usdtAmount, rate },
          idempotencyKey: `crypto_withdraw_pending_${req.user.id}_${crypto.randomUUID()}`,
          source: 'player',
        }, { session });
        return { tx: transaction, balanceAfter: adjusted.balanceAfter };
      });
    } finally {
      await session.endSession();
    }

    if (!autoProcess) {
      res.json({
        newBalance: reserved.balanceAfter,
        autoProcessed: false,
        message: `${usdtAmount} USDT çekim talebiniz alındı — Admin onayı bekliyor`,
      });
      // Çekim talebi SMS'i — "admin onayı bekliyor" anı tetikleyicisidir
      // (banka çekimi aynı istekte tamamlanır; onay bekleyen tek akış budur).
      // Fire-and-forget; şablon/gateway/modül kapalıysa dispatch atlar.
      import('../services/smsTemplate.js')
        .then(({ dispatchSmsEvent }) => dispatchSmsEvent(
          'withdrawalRequested',
          null,
          { amount: usdtAmount, currency: 'USDT', method: 'crypto' },
          { userId: req.user.id },
        ))
        .catch(() => {});
      return;
    }

    // Otomatik: hot wallet'tan gönder
    let result;
    try {
      result = await transferUSDT(address, usdtAmount);
    } catch (e) {
      // Sonuç belirsiz (ağ hatası): kayıt "processing"te kalır, iade edilmez;
      // admin zinciri kontrol edip sonuçlandırır.
      console.error(`[crypto] withdraw transfer belirsiz: tx=${reserved.tx._id}`, e.message);
      return res.status(502).json({ error: 'Transfer sonucu alınamadı; talebiniz incelemeye alındı', newBalance: reserved.balanceAfter });
    }

    if (!result.success) {
      // Transfer gitmedi: kayıt "failed", bakiye ve iade satırı tek işlemde.
      const refundSession = await mongoose.startSession();
      let refundedBalance = reserved.balanceAfter;
      try {
        refundedBalance = await withTransactionRetry(refundSession, async () => {
          const claimed = await Transaction.findOneAndUpdate(
            { _id: reserved.tx._id, status: 'processing' },
            { $set: { status: 'failed', note: `${usdtAmount} USDT → ${address} — transfer başarısız, iade edildi` } },
            { new: true, session: refundSession },
          );
          if (!claimed) return reserved.balanceAfter;
          const adj = await adjustBalance(req.user.id, tryNeeded, { session: refundSession });
          await createTransaction({
            userId: req.user.id,
            type: 'refund',
            amount: tryNeeded,
            balanceBefore: adj.balanceBefore,
            balanceAfter: adj.balanceAfter,
            referenceId: reserved.tx._id,
            note: 'Kripto çekim transferi başarısız, bakiye iade edildi',
            idempotencyKey: `crypto_withdraw_refund_${reserved.tx._id}`,
            source: 'system',
          }, { session: refundSession });
          return adj.balanceAfter;
        });
      } finally {
        await refundSession.endSession();
      }
      return res.status(500).json({ error: `Transfer başarısız: ${result.error}`, newBalance: refundedBalance });
    }

    await Transaction.updateOne({ _id: reserved.tx._id }, { $set: {
      status: 'completed',
      note: `${usdtAmount} USDT → ${address} (tx: ${result.txHash.slice(0, 12)}...)`,
      'metadata.txHash': result.txHash,
    } });
    res.json({
      newBalance: reserved.balanceAfter,
      autoProcessed: true,
      txHash: result.txHash,
      message: `${usdtAmount} USDT gönderildi`,
    });
  } catch (e) { next(e); }
});

// ── GET /api/crypto/withdraw-preview ──────────────────────────────────────────
// Kullanıcının çekilebilir bakiyesini gösterir
r.get('/withdraw-preview', async (req, res, next) => {
  try {
    const breakdown = await getSpendableBreakdown(req.user.id);
    const hotWallet = await getHotWalletBalance();
    res.json({
      ...breakdown,
      hotWalletBalance: hotWallet.usdt,
      minWithdraw: CRYPTO_SETTINGS.minWithdraw,
    });
  } catch (e) { next(e); }
});

// ── GET /api/crypto/settings ─────────────────────────────────────────────────
// SECURITY FIX (H3): Admin-only endpoint
r.get('/settings', requireAdmin, (req, res) => {
  res.json(CRYPTO_SETTINGS);
});

// ── GET /api/crypto/hot-wallet-balance ────────────────────────────────────────
// SECURITY FIX (H3): Admin-only endpoint
r.get('/hot-wallet-balance', requireAdmin, async (req, res, next) => {
  try {
    const balance = await getHotWalletBalance();
    res.json(balance);
  } catch (e) {
    if (e.code === 'CRYPTO_WALLET_NOT_CONFIGURED') {
      return next(createError(503, 'CRYPTO_WALLET_NOT_CONFIGURED', 'Kripto cüzdanı yapılandırılmamış (CRYPTO_SEED_PHRASE / HOT_WALLET_PRIVATE_KEY)'));
    }
    next(e);
  }
});

export default r;
