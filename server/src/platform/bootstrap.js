import Migration from '../models/Migration.js';
import Setting from '../models/Setting.js';
import Tenant from '../models/Tenant.js';
import { initDefaultPermissions, initDefaultScopedRoles, syncMissingPermissions } from '../services/permissions.js';
import { buildCompoundIndexes as buildAllTenantIndexes } from '../tenancy/indexBuilder.js';
import { getTenancyMode } from '../config/tenancy.js';

export const PLATFORM_BOOTSTRAP_MIGRATION = Object.freeze({
  name: 'platform-001-bootstrap',
  version: '1.0.0',
});

/**
 * Execute N1 platform bootstrap migration on empty DB or multi-mode startup.
 * @param {{ env?: object }} [options]
 */
export async function runPlatformBootstrap({ env = process.env } = {}) {
  const mode = getTenancyMode(env);
  if (mode !== 'multi') {
    return { success: true, skipped: true, reason: 'single-mode' };
  }

  const existing = await Migration.findOne({ name: PLATFORM_BOOTSTRAP_MIGRATION.name });
  if (existing) {
    return { success: true, alreadyApplied: true, migrationRecorded: true };
  }

  // 1. Seed permission catalogue and role templates
  await initDefaultPermissions();
  await syncMissingPermissions();
  await initDefaultScopedRoles();

  // 2. Build compound indexes only (multi mode does not use global legacy unique indexes)
  await buildAllTenantIndexes();

  // 3. Platform Setting defaults (scope: 'platform')
  await Setting.findOneAndUpdate(
    { scope: 'platform', key: 'platform_initialized' },
    {
      $setOnInsert: {
        scope: 'platform',
        key: 'platform_initialized',
        value: 'true',
        category: 'system',
        description: 'Flag indicating N1 platform bootstrap completion',
      },
    },
    { upsert: true, new: true }
  );

  await Setting.findOneAndUpdate(
    { scope: 'platform', key: 'audit_retention_days' },
    {
      $setOnInsert: {
        scope: 'platform',
        key: 'audit_retention_days',
        value: String(Math.max(parseInt(env.AUDIT_RETENTION_DAYS, 10) || 1825, 1825)),
        category: 'compliance',
        description: 'Audit log retention duration in days (minimum 1825 for 5 years)',
      },
    },
    { upsert: true, new: true }
  );

  // 4. Verify tenant count is 0
  const tenantCount = await Tenant.countDocuments();
  if (tenantCount > 0) {
    // If existing tenants exist, ensure none is stamped as default in multi-mode clean install
    const defaultTenant = await Tenant.findOne({ isDefault: true });
    if (defaultTenant) {
      console.warn('[tenancy] Multi mode detected pre-existing default tenant');
    }
  }

  // 5. Mark migration as applied
  await Migration.findOneAndUpdate(
    { name: PLATFORM_BOOTSTRAP_MIGRATION.name },
    {
      $setOnInsert: {
        name: PLATFORM_BOOTSTRAP_MIGRATION.name,
        version: PLATFORM_BOOTSTRAP_MIGRATION.version,
      },
    },
    { upsert: true }
  );

  return { success: true, migrationRecorded: true, alreadyApplied: false };
}