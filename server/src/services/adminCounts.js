// server/src/services/adminCounts.js
//
// Admin panelinde gösterilen TÜM bekleyen iş sayıları tek noktadan.
//
// Neden ayrı servis:
//  1) Sidebar rozetleri, Dashboard kuyruk kartları ve nav sayaçları aynı
//     beş sayıyı gösterir — tek kaynaktan beslenmezlerse birbirinden
//     kopar (bugün fixture'lardan geliyorlardı).
//  2) Bir kayıt işlendiğinde (onay/red/kapat) sayı ANINDA düşmeli. Bunun
//     tek yolu: işlem sonrası yeniden hesapla ve `role:admin` odasına
//     yayınla. İstemci polling yapmaz (bkz. useOnlineCount.js dokümanı).
//
// Not: seed/demo veri bu sayçalara dahildir — analytics ile aynı karar
// (bkz. controllers/analytics.js başındaki not).

import BankDepositRequest from '../models/BankDepositRequest.js';
import CryptoDeposit from '../models/CryptoDeposit.js';
import Transaction from '../models/Transaction.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import RiskFinding from '../models/RiskFinding.js';
import { getIO } from './socketEmitter.js';

export const ADMIN_COUNT_KEYS = ['bank', 'crypto', 'tickets', 'kyc', 'riskFlags'];

/**
 * Bekleyen iş sayıları. Hepsi `countDocuments` — liste indirmez.
 * Yanıtta yalnızca bu beş anahtar bulunur; istemci eksik anahtarı 0 sayar.
 */
export async function getAdminCounts() {
  const [bank, crypto, tickets, kyc, riskFlags] = await Promise.all([
    // bank: yatırım + çekim talepleri birlikte (Dashboard'da tek "bank" kartı)
    BankDepositRequest.countDocuments({ status: 'pending' }),
    Promise.all([
      CryptoDeposit.countDocuments({ status: 'pending_approval' }),
      Transaction.countDocuments({ type: 'crypto_withdraw', status: 'pending' }),
    ]).then(([dep, wd]) => dep + wd),
    // Ticket: "açık" iş = henüz çözülmemiş olanlar. in_progress ve resolved
    // hâlâ operatörün takibindedir; yalnız `closed` kuyruktan çıkar.
    Ticket.countDocuments({ status: { $in: ['open', 'in_progress', 'resolved'] } }),
    User.countDocuments({ kycStatus: { $in: ['pending', 'under_review'] } }),
    RiskFinding.countDocuments({ status: 'active' }),
  ]);

  return { bank, crypto, tickets, kyc, riskFlags };
}

/**
 * Sayıları `role:admin` odasına yayınlar. Bir kayıt işlendiğinde çağrılır.
 * Yayın başarısız olursa istek patlamaz — sayaç bir sonraki REST çağrısında
 * kendiliğinden düzelir.
 */
export function broadcastAdminCounts() {
  const io = getIO();
  if (!io) return;
  Promise.resolve(getAdminCounts())
    .then((counts) => io.to('role:admin').emit('admin:counts', counts))
    .catch(() => { /* yayarak bozma; sessizce geç */ });
}
