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
import mongoose from 'mongoose';
import Setting from '../../models/Setting.js';
import { createAgentToggleStore } from './agentToggle.js';

const TOGGLE_KEY = 'support.agentEnabled';

export const agentToggleStore = createAgentToggleStore({
  load: async () => {
    if (mongoose.connection.readyState !== 1) return {};
    const row = await Setting.findOne({ key: TOGGLE_KEY }).lean();
    return { enabled: row?.value === 'true' };
  },
});

export const isAgentEnabled = () => agentToggleStore.isEnabled();

/** Admin panelinden ajanı açar/kapatır. */
export async function setAgentEnabled(enabled, updatedBy) {
  await Setting.updateOne(
    { key: TOGGLE_KEY },
    { $set: { value: String(!!enabled), updatedBy } },
    { upsert: true },
  );
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
