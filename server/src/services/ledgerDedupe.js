/**
 * Ledger çift yazım temizliği (2026-10-03).
 *
 * 2026-09-17 ledger geçişinde (PAM batch 2) bazı noktalarda `createTransaction()`
 * eski ham `Transaction.create()`'in YERİNE değil YANINA eklendi; her işlem iki
 * `Transaction` dokümanı yazdı. Kod 2026-10-03'te düzeltildi (tek
 * idempotent `createTransaction`, PR #132); bu modül geçmişte yazılmış kopyaları bulur
 * ve kaldırır.
 *
 * Eşleştirme (bir çift):
 *   - "ledger" satırı: idempotencyKey'i bu noktaların öneklerinden biriyle başlar;
 *   - "ham" satır: idempotencyKey YOK;
 *   - ikisinde userId, type, amount, balanceBefore, balanceAfter AYNI ve
 *     createdAt farkı ≤ WINDOW_MS. Aynı bakiye geçişi (before→after) iki ayrı
 *     gerçek işlemde oluşamaz — bu, kopyanın kesin işaretidir.
 *   Not ve status karşılaştırılmaz: onay bekleyen kripto çekimlerinde admin
 *   kopyalardan BİRİNİ onaylamış/reddetmiş olabilir (not/status değişir).
 *
 * Hangisi kaldırılır:
 *   - Biri hâlâ `pending`, diğeri işlenmişse → bekleyen kopya kaldırılır
 *     (aksi halde kuyrukta kalır; tekrar onaylanırsa ikinci USDT gönderimi,
 *     reddedilirse ikinci iade olurdu). İşlenmiş satırın geçmişi korunur.
 *   - Aksi halde → ham kopya kaldırılır, idempotency anahtarlı ledger satırı kalır.
 *
 * Kaldırılan satır silinmeden önce `transactions_dedupe_archive` koleksiyonuna
 * (orijinal doküman + korunan satırın id'si) yazılır — geri alınabilir.
 * Kaldırılana işaret eden referanslar (ReferralCommission.transactionId,
 * Transaction.relatedTransactionId, ChatRain.recipients.transactionId)
 * korunan satıra çevrilir. İdempotent: ikinci çalıştırmada çift bulunmaz.
 */
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';

export const ARCHIVE_COLLECTION = 'transactions_dedupe_archive';
const WINDOW_MS = 5000;
const AFFECTED = [
  { type: 'cashback', prefixes: ['vip_cashback_'] },
  { type: 'bonus', prefixes: ['vip_levelup_'] },
  { type: 'referral_commission', prefixes: ['referral_commission_', 'referral_approve_'] },
  { type: 'agent_commission', prefixes: ['agent_commission_'] },
  { type: 'crypto_withdraw', prefixes: ['crypto_withdraw_'] },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Kopya çiftlerini bulur (yazmaz). @returns {Array<{ keep, remove, reason }>} */
export async function findDoubleWritePairs() {
  const pairs = [];
  const usedRaw = new Set();
  for (const { type, prefixes } of AFFECTED) {
    const keyRe = new RegExp(`^(${prefixes.map(escapeRe).join('|')})`);
    const ledgerRows = await Transaction.find({ type, idempotencyKey: keyRe }).sort({ createdAt: 1 }).lean();
    for (const ledger of ledgerRows) {
      const t = new Date(ledger.createdAt).getTime();
      const candidates = await Transaction.find({
        _id: { $ne: ledger._id },
        type,
        userId: ledger.userId,
        amount: ledger.amount,
        balanceBefore: ledger.balanceBefore,
        balanceAfter: ledger.balanceAfter,
        idempotencyKey: { $in: [null] }, // null ya da alan hiç yok
        createdAt: { $gte: new Date(t - WINDOW_MS), $lte: new Date(t + WINDOW_MS) },
      }).sort({ createdAt: 1 }).lean();
      const raw = candidates.find(c => !usedRaw.has(String(c._id)));
      if (!raw) continue;
      usedRaw.add(String(raw._id));

      const ledgerPending = ledger.status === 'pending';
      const rawPending = raw.status === 'pending';
      if (rawPending !== ledgerPending) {
        // Admin kopyalardan birini işlemiş: işleneni koru, bekleyen kopyayı kaldır.
        pairs.push(ledgerPending
          ? { keep: raw, remove: ledger, reason: 'stale_pending_copy' }
          : { keep: ledger, remove: raw, reason: 'stale_pending_copy' });
      } else {
        pairs.push({ keep: ledger, remove: raw, reason: 'raw_copy' });
      }
    }
  }
  return pairs;
}

/**
 * @param {{ dryRun?: boolean, log?: Function }} opts
 * @returns {{ found: number, removed: number, byType: Object, pairs: Array }}
 */
export async function dedupeDoubleWrites({ dryRun = false, log = () => {} } = {}) {
  const pairs = await findDoubleWritePairs();
  const byType = {};
  for (const p of pairs) byType[p.remove.type] = (byType[p.remove.type] || 0) + 1;
  const summary = pairs.map(p => ({
    removeId: String(p.remove._id), keepId: String(p.keep._id), type: p.remove.type,
    userId: String(p.remove.userId), amount: p.remove.amount, reason: p.reason,
    removeStatus: p.remove.status, keepStatus: p.keep.status, createdAt: p.remove.createdAt,
  }));
  if (dryRun || pairs.length === 0) return { found: pairs.length, removed: 0, byType, pairs: summary };

  const db = mongoose.connection.db;
  const archive = db.collection(ARCHIVE_COLLECTION);
  let removed = 0;
  for (const { keep, remove, reason } of pairs) {
    const session = await mongoose.startSession();
    let deleted = 0;
    try {
      await session.withTransaction(async () => {
        await archive.updateOne(
          { _id: remove._id },
          { $setOnInsert: { _id: remove._id, original: remove, keptTransactionId: keep._id, reason, archivedAt: new Date() } },
          { upsert: true, session },
        );
        await db.collection('referralcommissions').updateMany({ transactionId: remove._id }, { $set: { transactionId: keep._id } }, { session });
        await db.collection('transactions').updateMany({ relatedTransactionId: remove._id }, { $set: { relatedTransactionId: keep._id } }, { session });
        await db.collection('chatrains').updateMany(
          { 'recipients.transactionId': remove._id },
          { $set: { 'recipients.$[r].transactionId': keep._id } },
          { arrayFilters: [{ 'r.transactionId': remove._id }], session },
        );
        const del = await db.collection('transactions').deleteOne({ _id: remove._id }, { session });
        deleted = del.deletedCount;
      });
    } finally {
      await session.endSession();
    }
    removed += deleted;
    log(`[ledgerDedupe] ${remove.type} ${remove._id} kaldırıldı (korunan ${keep._id}, ${reason})`);
  }
  return { found: pairs.length, removed, byType, pairs: summary };
}
