/**
 * Kripto çekimlerinin gönderimi ve zincirle uzlaştırması (2026-10-12).
 *
 * Bir çekim Transaction'ı (type 'crypto_withdraw') şu durumlardan geçer:
 *
 *   pending     admin onayı bekliyor (bakiye düşülmüş)
 *   processing  transfer hazırlandı/yayınlandı; sonuç zincirden doğrulanacak.
 *               metadata.chainTxId, chainExpiresAt, flow ('auto'|'admin'),
 *               attempts[] tutulur.
 *   completed   zincirde başarılı (metadata.txHash)
 *   failed      otomatik çekim gönderilemedi; bakiye iade edildi
 *   rejected    admin reddetti; bakiye iade edildi
 *
 * "Gönderilmedi" kararı yalnız kesin bilgiyle verilir: düğüm yayını açıkça
 * reddetti, işlem zincirde başarısız göründü ya da süresi (expiration) dolduğu
 * halde zincirde yok. Kesin değilse çekim "processing"te kalır ve uzlaştırma
 * işi (jobs/cryptoWithdrawalReconcile.js) sorar. Gönderilmediği kesinleşen
 * otomatik çekim iade edilir; admin onaylı çekim yeniden "pending" olur ve admin
 * tekrar onaylayabilir (yeni işlem, yeni txID) ya da reddedebilir.
 *
 * Tüm durum geçişleri koşullu ve atomiktir (eşzamanlı uzlaştırma, onay ve
 * yanıt yolları aynı çekimi iki kez sonuçlandıramaz).
 */
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import { adjustBalance, createTransaction } from './ledger.js';
import { withTransactionRetry } from '../utils/transactionRetry.js';
import * as chain from './cryptoService.js';

/** Süre dolduktan sonra "zincirde yok = gönderilmedi" demeden önce beklenen pay. */
export const EXPIRY_GRACE_MS = 2 * 60 * 1000;
/** txID'si hiç yazılamamış "processing" kaydı bu kadar beklerse elle inceleme ister. */
export const MANUAL_REVIEW_AFTER_MS = 10 * 60 * 1000;

let _chain = chain;
/** Testler için zincir istemcisi değiştirilebilir. */
export function _setChainClient(c) { _chain = c; }
export function _resetChainClient() { _chain = chain; }

const now = () => Date.now();

function withdrawalTarget(tx) {
  const meta = tx.metadata || {};
  const addrMatch = tx.note?.match(/→ ([T][A-Za-z0-9]{33})/);
  const amtMatch = tx.note?.match(/([\d.]+) USDT/);
  const toAddress = meta.toAddress || addrMatch?.[1];
  const usdtAmount = Number(meta.usdtAmount ?? (amtMatch ? parseFloat(amtMatch[1]) : NaN));
  if (!toAddress || !/^T[A-Za-z0-9]{33}$/.test(toAddress) || !Number.isFinite(usdtAmount) || usdtAmount <= 0) return null;
  return { toAddress, usdtAmount };
}

/**
 * "processing" durumundaki çekimi zincire gönderir.
 * @returns {Promise<{ outcome: 'broadcast'|'unknown'|'not_sent', txId?: string, error?: string }>}
 *   not_sent durumunda çekim finalizeNotSent ile zaten sonuçlandırılmıştır.
 */
export async function sendWithdrawal(txId) {
  const tx = await Transaction.findOne({ _id: txId, type: 'crypto_withdraw', status: 'processing' }).lean();
  if (!tx) return { outcome: 'not_sent', error: 'Çekim işlemde değil' };
  const target = withdrawalTarget(tx);
  if (!target) {
    await finalizeNotSent(tx._id, 'Çekim detayları okunamadı');
    return { outcome: 'not_sent', error: 'Çekim detayları okunamadı' };
  }

  let prepared;
  try {
    prepared = await _chain.prepareUSDTTransfer(target.toAddress, target.usdtAmount);
  } catch (e) {
    await finalizeNotSent(tx._id, `Transfer hazırlanamadı: ${e.message}`);
    return { outcome: 'not_sent', error: e.message };
  }

  // txID yayından ÖNCE yazılır: yanıt kaybolsa bile sonuç sorulabilir.
  const recorded = await Transaction.updateOne(
    { _id: tx._id, status: 'processing' },
    {
      $set: { 'metadata.chainTxId': prepared.txId, 'metadata.chainExpiresAt': new Date(prepared.expiresAt) },
      $push: { 'metadata.attempts': { txId: prepared.txId, preparedAt: new Date(), expiresAt: new Date(prepared.expiresAt) } },
    },
  );
  if (!recorded.modifiedCount) return { outcome: 'not_sent', error: 'Çekim başka bir işlem tarafından sonuçlandırıldı' };

  const result = await _chain.broadcastUSDTTransfer(prepared.signedTx);
  if (result.status === 'rejected') {
    await finalizeNotSent(tx._id, `Yayın reddedildi: ${result.error}`, prepared.txId);
    return { outcome: 'not_sent', txId: prepared.txId, error: result.error };
  }
  await Transaction.updateOne(
    { _id: tx._id, status: 'processing', 'metadata.chainTxId': prepared.txId },
    { $set: { 'metadata.broadcast': result.status, 'metadata.broadcastError': result.error || null } },
  );
  return { outcome: result.status === 'accepted' ? 'broadcast' : 'unknown', txId: prepared.txId, error: result.error };
}

/** Zincirde başarılı görülen çekimi tamamlar. */
async function markCompleted(tx, chainTxId) {
  const t = withdrawalTarget(tx);
  const r = await Transaction.updateOne(
    { _id: tx._id, status: 'processing', 'metadata.chainTxId': chainTxId },
    { $set: {
      status: 'completed',
      'metadata.txHash': chainTxId,
      note: t ? `${t.usdtAmount} USDT → ${t.toAddress} (tx: ${chainTxId.slice(0, 12)}...)` : tx.note,
    } },
  );
  return r.modifiedCount > 0;
}

/**
 * Gönderilmediği KESİN olan çekimi sonuçlandırır: otomatik çekim → 'failed' +
 * bakiye iadesi; admin onaylı çekim → yeniden 'pending'.
 * @param {string} [chainTxId] verilirse yalnız hâlâ bu işleme bağlıysa uygulanır
 * @returns {Promise<'refunded'|'pending'|null>} null: başkası sonuçlandırmış
 */
export async function finalizeNotSent(id, reason, chainTxId) {
  const filter = { _id: id, type: 'crypto_withdraw', status: 'processing' };
  if (chainTxId) filter['metadata.chainTxId'] = chainTxId;
  const tx = await Transaction.findOne(filter).lean();
  if (!tx) return null;

  if (tx.metadata?.flow === 'admin') {
    const r = await Transaction.updateOne(filter, {
      $set: { status: 'pending', 'metadata.lastFailure': reason },
      $unset: { 'metadata.chainTxId': '', 'metadata.chainExpiresAt': '', 'metadata.broadcast': '', 'metadata.broadcastError': '' },
    });
    return r.modifiedCount ? 'pending' : null;
  }

  const session = await mongoose.startSession();
  try {
    return await withTransactionRetry(session, async () => {
      const claimed = await Transaction.findOneAndUpdate(filter, {
        $set: { status: 'failed', 'metadata.lastFailure': reason, note: `${tx.note} — gönderilemedi, bakiye iade edildi` },
      }, { new: true, session });
      if (!claimed) return null;
      const refund = Math.abs(claimed.amount);
      const adj = await adjustBalance(claimed.userId, refund, { session });
      if (!adj) throw new Error('Kullanıcı bulunamadı');
      await createTransaction({
        userId: claimed.userId,
        type: 'refund',
        amount: refund,
        balanceBefore: adj.balanceBefore,
        balanceAfter: adj.balanceAfter,
        referenceId: claimed._id,
        note: `Kripto çekim gönderilemedi, bakiye iade edildi: ${reason}`,
        idempotencyKey: `crypto_withdraw_refund_${claimed._id}`,
        source: 'system',
      }, { session });
      return 'refunded';
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Tek bir "processing" çekimini zincirle uzlaştırır.
 * @returns {Promise<{ state: 'completed'|'refunded'|'pending'|'waiting'|'manual_review'|'unknown'|'not_processing', detail?: string }>}
 */
export async function reconcileWithdrawal(id, { at = now() } = {}) {
  const tx = await Transaction.findOne({ _id: id, type: 'crypto_withdraw' }).lean();
  if (!tx || tx.status !== 'processing') return { state: 'not_processing' };
  const chainTxId = tx.metadata?.chainTxId;

  if (!chainTxId) {
    const age = at - new Date(tx.updatedAt || tx.createdAt).getTime();
    return age > MANUAL_REVIEW_AFTER_MS
      ? { state: 'manual_review', detail: 'İşlem kimliği kayıtlı değil; zinciri elle kontrol edip sonuçlandırın' }
      : { state: 'waiting', detail: 'Transfer hazırlanıyor' };
  }

  let status;
  try {
    status = await _chain.getUSDTTransferStatus(chainTxId);
  } catch (e) {
    return { state: 'unknown', detail: `Zincir sorgulanamadı: ${e.message}` };
  }

  if (status === 'success') {
    return (await markCompleted(tx, chainTxId)) ? { state: 'completed' } : { state: 'not_processing' };
  }
  if (status === 'failed') {
    const r = await finalizeNotSent(tx._id, `Zincirde başarısız (${chainTxId})`, chainTxId);
    return { state: r || 'not_processing' };
  }
  const expiresAt = new Date(tx.metadata?.chainExpiresAt || 0).getTime();
  if (expiresAt && at > expiresAt + EXPIRY_GRACE_MS) {
    const r = await finalizeNotSent(tx._id, `Süresi dolduğu halde zincirde yok (${chainTxId})`, chainTxId);
    return { state: r || 'not_processing' };
  }
  return { state: 'waiting', detail: 'Zincirde henüz görünmüyor' };
}

/** Uzlaştırma işi: tüm "processing" çekimleri dolaşır. */
export async function reconcileProcessingWithdrawals({ at = now(), limit = 100 } = {}) {
  const rows = await Transaction.find({ type: 'crypto_withdraw', status: 'processing' })
    .sort({ updatedAt: 1 }).limit(limit).select('_id').lean();
  const summary = {};
  for (const r of rows) {
    const { state } = await reconcileWithdrawal(r._id, { at }).catch(e => ({ state: 'unknown', detail: e.message }));
    summary[state] = (summary[state] || 0) + 1;
  }
  return summary;
}

/**
 * İşlem kimliği hiç kaydedilmemiş (ör. hazırlık sırasında süreç çöktü)
 * "processing" çekimi admin elle sonuçlandırır: zincirde gönderildiğini
 * gördüyse txHash ile tamamlar, gönderilmediyse iade/yeniden onay.
 */
export async function resolveWithdrawalManually(id, { sent, txHash, adminId }) {
  const tx = await Transaction.findOne({ _id: id, type: 'crypto_withdraw', status: 'processing' }).lean();
  if (!tx) return { ok: false, error: 'Çekim işlemde değil' };
  if (tx.metadata?.chainTxId) return { ok: false, error: 'İşlem kimliği kayıtlı; zincir uzlaştırması kullanılmalı' };
  if (sent) {
    if (!/^[0-9a-fA-F]{64}$/.test(String(txHash || ''))) return { ok: false, error: 'Geçerli bir txHash (64 hex) gerekli' };
    const r = await Transaction.updateOne(
      { _id: tx._id, status: 'processing', 'metadata.chainTxId': { $exists: false } },
      { $set: { status: 'completed', 'metadata.txHash': txHash, 'metadata.resolvedBy': adminId, note: `${tx.note} — elle tamamlandı (tx: ${txHash.slice(0, 12)}...)` } },
    );
    return r.modifiedCount ? { ok: true, state: 'completed' } : { ok: false, error: 'Çekim başka bir işlem tarafından sonuçlandırıldı' };
  }
  const state = await finalizeNotSent(tx._id, `Admin: zincirde gönderilmediği doğrulandı (${adminId})`);
  return state ? { ok: true, state } : { ok: false, error: 'Çekim başka bir işlem tarafından sonuçlandırıldı' };
}
