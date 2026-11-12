// server/src/services/adminCounts.js
//
// Admin panelinde gösterilen TÜM bekleyen iş sayıları tek noktadan.
//
// Neden ayrı servis:
//  1) Sidebar rozetleri, Dashboard kuyruk kartları ve nav sayaçları aynı
//     beş sayıyı gösterir — tek kaynaktan beslenmezlerse birbirinden
//     kopar (bugün fixture'lardan geliyorlardı).
//  2) Bir kayıt işlendiğinde (onay/red/kapat) sayı ANINDA düşmeli. Bunun
//     tek yolu: işlem sonrası yeniden hesapla ve admin odasına
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
import { publishToTenantAdmins } from '../socket/publish.js';
import { getCurrentTenantId } from '../tenancy/context.js';
import { getTenancyMode } from '../config/tenancy.js';

export const ADMIN_COUNT_KEYS = ['bank', 'crypto', 'tickets', 'kyc', 'riskFlags'];

function scopedTenantId(tenantId) {
  return getTenancyMode() === 'multi' ? tenantId : null;
}

/**
 * Bekleyen iş sayıları. Hepsi `countDocuments` — liste indirmez.
 * Yanıtta yalnızca bu beş anahtar bulunur; istemci eksik anahtarı 0 sayar.
 */
export async function getAdminCounts({ tenantId = getCurrentTenantId() } = {}) {
  const scopedTenant = scopedTenantId(tenantId);
  const scope = scopedTenant ? { tenantId: scopedTenant } : {};
  const [bank, crypto, tickets, kyc, riskFlags] = await Promise.all([
    // bank: yatırım + çekim talepleri birlikte (Dashboard'da tek "bank" kartı)
    BankDepositRequest.countDocuments({ ...scope, status: 'pending' }),
    Promise.all([
      CryptoDeposit.countDocuments({ ...scope, status: 'pending_approval' }),
      Transaction.countDocuments({ ...scope, type: 'crypto_withdraw', status: 'pending' }),
    ]).then(([dep, wd]) => dep + wd),
    // Ticket: "açık" iş = henüz çözülmemiş olanlar. in_progress ve resolved
    // hâlâ operatörün takibindedir; yalnız `closed` kuyruktan çıkar.
    Ticket.countDocuments({ ...scope, status: { $in: ['open', 'in_progress', 'resolved'] } }),
    User.countDocuments({ ...scope, kycStatus: { $in: ['pending', 'under_review'] } }),
    RiskFinding.countDocuments({ ...scope, status: 'active' }),
  ]);

  return { bank, crypto, tickets, kyc, riskFlags };
}

/**
 * Sayıları admin odasına yayınlar. Bir kayıt işlendiğinde çağrılır.
 * Yayın başarısız olursa istek patlamaz — sayaç bir sonraki REST çağrısında
 * kendiliğinden düzelir.
 */
export function broadcastAdminCounts({ tenantId = getCurrentTenantId() } = {}) {
  const scopedTenant = scopedTenantId(tenantId);
  const io = getIO();
  if (!io) return;
  Promise.resolve(getAdminCounts({ tenantId: scopedTenant }))
    .then((counts) => publishToTenantAdmins('admin:counts', counts, { tenantId: scopedTenant, io }))
    .catch(() => { /* yayarak bozma; sessizce geç */ });
}
