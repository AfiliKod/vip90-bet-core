/**
 * 0004 - Default tenant for single-operator installs (G1, spec §6.3).
 * Shares its record name with the boot path (server/src/tenancy/defaultTenant.js),
 * so the CLI, the healthcheck and the boot agree. Skipped in multi mode.
 */
import { getTenancyMode } from '../src/config/tenancy.js';
import { ensureDefaultTenant } from '../src/tenancy/defaultTenant.js';

export default {
  name: 'tenancy-001-default-tenant',
  version: '1.1.0',
  description: 'Default tenant for single-operator installs (G1)',
  async up() {
    if (getTenancyMode() === 'multi') return;
    await ensureDefaultTenant();
  },
};
