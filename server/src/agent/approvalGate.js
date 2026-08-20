/**
 * İnsan onay kapısı (D7 — "LLM seçer, insan imzalar").
 *
 * Salt-okunur eylemler önerildiği anda auto-approved döner — hiçbir
 * onay beklemez, otomatik akışı bloklamaz. Yıkıcı eylemler ise yalnızca
 * "pending-approval" statüsünde bir öneri kaydına dönüşür; temsilcinin
 * açıkça `approve()` çağırması ZORUNLU — bu çağrı gelmeden ne "approved"
 * statüsüne geçer ne de (çağıranın sorumluluğundaki) imzalama adımına
 * girer. `signCommand` (D6) bu kapıdan SONRA, yalnızca "approved" veya
 * "auto-approved" sonuç üzerinde çağrılmalı — burası o kararı vermez,
 * yalnızca hangi eylemlerin o kararı bekleyeceğini belirler.
 */
import { randomUUID } from 'crypto';
import { getActionRisk, RISK_LEVELS } from './actionCatalog.js';

export function createApprovalGate({ idGen = randomUUID } = {}) {
  const pending = new Map(); // proposalId -> { actionId, params }

  return {
    propose({ actionId, params }) {
      const risk = getActionRisk(actionId); // kayıtsız eylem burada fırlatır — öneri oluşmaz
      if (risk === RISK_LEVELS.SAFE) {
        return { status: 'auto-approved', actionId, params };
      }
      const proposalId = `prop-${idGen()}`;
      pending.set(proposalId, { actionId, params });
      return { status: 'pending-approval', proposalId, actionId, params };
    },

    approve(proposalId, representativeId) {
      const p = pending.get(proposalId);
      if (!p) throw new Error(`Bilinmeyen veya zaten işlenmiş öneri: ${proposalId}`);
      pending.delete(proposalId);
      return { status: 'approved', actionId: p.actionId, params: p.params, approvedBy: representativeId };
    },

    reject(proposalId, representativeId, reason) {
      const p = pending.get(proposalId);
      if (!p) throw new Error(`Bilinmeyen veya zaten işlenmiş öneri: ${proposalId}`);
      pending.delete(proposalId);
      return { status: 'rejected', actionId: p.actionId, reason, rejectedBy: representativeId };
    },

    pendingCount() {
      return pending.size;
    },
  };
}
