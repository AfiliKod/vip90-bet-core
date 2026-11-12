/**
 * 0005 - Backfill tenantId on all TEN collections (G3, spec §6.3).
 * Batches of 10.000 with a resumable checkpoint in the Migration record; safe
 * to run twice. Skipped in multi mode, where every write is already scoped.
 */
import { getTenancyMode } from '../src/config/tenancy.js';
import { backfillTenantId, BACKFILL_MIGRATION_NAME } from '../src/tenancy/backfill.js';

export default {
  name: BACKFILL_MIGRATION_NAME,
  version: '1.2.0',
  description: 'Backfill tenantId on all TEN collections (G3, spec §6.3)',
  async up() {
    if (getTenancyMode() === 'multi') return;
    await backfillTenantId();
  },
};
