/**
 * Bakım ajanı destek altyapısının üretim bağlantısı (D6).
 *
 * agentToggle: mevcut Setting koleksiyonu üzerinden (theme/index.js,
 * modules/index.js ile aynı yaklaşım) — yeni şema açmaz.
 *
 * commandQueue: kasıtlı olarak minimal, bellek-içi. WAF, kalıcı depolama,
 * prompt-injection filtresi ve rate-limit D8'in kapsamı — burası yalnızca
 * D6'nın pull() sözleşmesini gerçek bir kaynağa bağlamak için var.
 */
import { createAgentToggleStore } from './agentToggle.js';
import { filterPayload } from '../../agent/promptFirewall.js';
import { mongoLoad } from '../../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from '../settings.js';

const TOGGLE_KEY = 'support.agentEnabled';

// Tenant-keyed instances (İP-4 Task 4): the registry cache is per instance.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createAgentToggleStore({
  load: async () => {
    const raw = await mongoLoad([TOGGLE_KEY], { tenantId, brandId });
    return { enabled: raw[TOGGLE_KEY] === 'true' };
  },
}));

export const agentToggleStore = {
  isEnabled: () => stores.current().isEnabled(),
  invalidate: () => stores.invalidateAll(),
};

export const isAgentEnabled = () => agentToggleStore.isEnabled();

/** Admin panelinden ajanı açar/kapatır. */
export async function setAgentEnabled(enabled, updatedBy) {
  await saveScopedSetting(TOGGLE_KEY, String(!!enabled), updatedBy);
  agentToggleStore.invalidate();
}

/**
 * Bellek-içi bekleyen komut kuyruğu — tek operatör/tek destek oturumu
 * varsayımıyla. D8'de kalıcı depolama + WAF ile değiştirilecek.
 */
export function createCommandQueue() {
  const pending = new Map(); // customerId -> imzalı komut

  return {
    enqueue(customerId, signedCommand) {
      pending.set(customerId, signedCommand);
    },
    /** localAgent.pull() sözleşmesi: bekleyen komutu alır ve kuyruktan düşürür. */
    async dequeue(customerId) {
      const cmd = pending.get(customerId) ?? null;
      if (cmd) pending.delete(customerId);
      return cmd;
    },
    size() {
      return pending.size;
    },
  };
}


/**
 * Müşteriden merkeze giden teşhis raporu kutusu (D8). Her `submit()`
 * çağrısı D8'in WAF'ından (filterPayload) geçer — şüpheli veri kuyruğa
 * hiç girmez, "LLM'e ulaşmıyor" garantisi burada uygulanır. D6'nın
 * maskDiagnostics'i alan bazlı sınırlar, bu ise içerik bazlı süzer.
 */
export function createDiagnosticInbox() {
  const items = [];

  return {
    submit(customerId, maskedPayload) {
      const clean = filterPayload(maskedPayload); // şüpheliyse throw — kuyruğa girmez
      items.push({ customerId, payload: clean, receivedAt: Date.now() });
    },
    next() {
      return items.shift() ?? null;
    },
    size() {
      return items.length;
    },
  };
}
