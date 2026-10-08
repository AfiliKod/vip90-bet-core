// Admin Dashboard "Bekleyen finans" tablosu için tek, normalize edilmiş kaynak.
//
// Neden ayrı servis: tablo eskiden /admin/crypto/pending-deposits ve
// /admin/crypto/pending-withdrawals ham yanıtlarını istemcide eşliyordu.
// İki uç kullanıcıyı `userId` altında populate ediyor, CryptoDeposit'te tutar
// `creditedTRY` alanında, risk bilgisi hiçbir yanıtta yok — istemci
// `r.username`, `r.amount`, `r.user?.riskLevel` okuduğu için oyuncu adı ve
// tutar "—", risk her satırda "Orta" görünüyordu. Ayrıca banka talepleri
// (aynı kuyruk sayacında sayılan) tabloda hiç yoktu.
import CryptoDeposit from '../models/CryptoDeposit.js';
import Transaction from '../models/Transaction.js';
import BankDepositRequest from '../models/BankDepositRequest.js';
import User from '../models/User.js';
import RiskProfile from '../models/RiskProfile.js';

// VIP rozeti: taban seviyenin (Bronze, level 1) üstündeki her VIP seviyesi.
const VIP_MIN_LEVEL = 2;

/**
 * Risk etiketi önceliği: risk motorunun HIGH/CRITICAL profili → 'high';
 * değilse VIP oyuncu → 'vip'; değilse risk profili MEDIUM → 'medium',
 * LOW → 'low'; profil yoksa KYC onaylıysa 'low', değilse 'medium'.
 */
export function classifyRisk({ riskLevel = null, vipLevelNumber = 0, kycStatus = null } = {}) {
  if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') return 'high';
  if (vipLevelNumber >= VIP_MIN_LEVEL) return 'vip';
  if (riskLevel === 'MEDIUM') return 'medium';
  if (riskLevel === 'LOW') return 'low';
  return kycStatus === 'approved' ? 'low' : 'medium';
}

/**
 * Onay bekleyen yatırma/çekme talepleri — en uzun bekleyen önce.
 * @returns {{ items: Array<{ ref, kind, userId, username, amount, usdtAmount, risk, status, createdAt }> }}
 */
export async function listPendingFinance({ limit = 5 } = {}) {
  const lim = Math.min(Math.max(1, parseInt(limit, 10) || 5), 50);
  const [cryptoDeposits, cryptoWithdrawals, bankRequests] = await Promise.all([
    CryptoDeposit.find({ status: 'pending_approval' }).sort({ createdAt: 1 }).limit(lim).lean(),
    Transaction.find({ type: 'crypto_withdraw', status: 'pending' }).sort({ createdAt: 1 }).limit(lim).lean(),
    BankDepositRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(lim).lean(),
  ]);

  const rows = [
    ...cryptoDeposits.map(d => ({
      ref: d._id, kind: 'crypto_deposit', userId: d.userId,
      amount: d.creditedTRY ?? null, usdtAmount: d.usdtAmount ?? null, createdAt: d.createdAt,
    })),
    ...cryptoWithdrawals.map(t => ({
      ref: t._id, kind: 'crypto_withdraw', userId: t.userId,
      amount: t.amount != null ? Math.abs(t.amount) : null, usdtAmount: t.metadata?.usdtAmount ?? null, createdAt: t.createdAt,
    })),
    ...bankRequests.map(b => ({
      ref: b._id, kind: b.type === 'withdraw' ? 'bank_withdraw' : 'bank_deposit', userId: b.userId,
      amount: b.amount ?? null, usdtAmount: null, createdAt: b.createdAt,
    })),
  ]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, lim);

  const userIds = [...new Set(rows.map(r => String(r.userId)).filter(Boolean))];
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('username kycStatus vipLevel').populate('vipLevel', 'level').lean(),
    RiskProfile.find({ playerId: { $in: userIds } }).select('playerId riskLevel').lean(),
  ]);
  const userById = new Map(users.map(u => [String(u._id), u]));
  const riskById = new Map(profiles.map(p => [String(p.playerId), p.riskLevel]));

  return {
    items: rows.map(r => {
      const user = userById.get(String(r.userId));
      return {
        ...r,
        username: user?.username ?? null,
        risk: classifyRisk({
          riskLevel: riskById.get(String(r.userId)) ?? null,
          vipLevelNumber: user?.vipLevel?.level ?? 0,
          kycStatus: user?.kycStatus ?? null,
        }),
        status: 'pending',
      };
    }),
  };
}
