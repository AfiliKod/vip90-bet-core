/**
 * G5 staff separation (spec §6.3): copy every admin `User` to a platform
 * `StaffAccount` with the identical `_id`, and grant scoped role assignments.
 *
 * - `super_admin` holders (and orphaned admins without any role) become
 *   `platform_owner` plus `tenant_owner` on the default tenant.
 * - Admins with specific roles (finance, support, ...) get the matching
 *   tenant-scoped role on the default tenant.
 * - The legacy `User.role: 'admin'` document is left intact (only
 *   `staffMigratedAt` is stamped) so single-mode login keeps working.
 *
 * Idempotent: migrated users are skipped, account and assignment writes are
 * upserts, and the Migration record is only written when no errors occurred,
 * so a failed run can simply be re-run.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Migration from '../models/Migration.js';
import Role from '../models/Role.js';
import RoleAssignment from '../models/RoleAssignment.js';
import StaffAccount from '../models/StaffAccount.js';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import { readBackupCodes } from '../services/twoFactorAuth.js';
import { encryptSensitive, isEncryptedSecret } from '../utils/secretCrypto.js';
import { runAsPlatform } from './context.js';

export const STAFF_MIGRATION_NAME = 'tenancy-004-staff-accounts';
const BATCH_SIZE = 500;

function hashBackupCode(code) {
  return crypto.createHash('sha256').update(String(code ?? '').replace(/\s/g, '')).digest('hex');
}

/** User 2FA state in StaffAccount shape: encrypted secret, SHA-256 backup code hashes. */
function migrateTwoFactor(user) {
  const rawSecret = user.twoFactorSecret ?? null;
  let secretEnc = null;
  if (rawSecret) {
    if (isEncryptedSecret(rawSecret)) {
      secretEnc = rawSecret;
    } else {
      try {
        secretEnc = encryptSensitive(rawSecret);
      } catch {
        // Legacy plaintext secret without an encryption key: decryptSensitive
        // still reads the unprefixed form, so keep it rather than lose 2FA.
        secretEnc = rawSecret;
        console.warn(`[tenancy] G5: user ${user._id} has a plaintext 2FA secret; copied as-is (OPERATOR_SECRET_ENCRYPTION_KEY missing?)`);
      }
    }
  }
  return {
    enabled: !!user.twoFactorEnabled,
    secretEnc,
    backupCodesHash: readBackupCodes(user).map(hashBackupCode),
  };
}

async function migrateOne(user, tenantId, resolveRole, { bootstrap }) {
  const heldRoles = user.roles?.length
    ? await Role.find({ _id: { $in: user.roles } }).select('name').lean()
    : [];
  const heldNames = [...new Set(heldRoles.map((role) => role.name))];

  const targets = [];
  // V5 parity (migrateOrphanedAdminRoles): a role-less admin is promoted only in
  // the bootstrap case (nobody holds super_admin). Otherwise it is a stripped
  // account and stays without assignments (fail-closed).
  if (heldNames.includes('super_admin') || (heldNames.length === 0 && bootstrap)) {
    targets.push({ name: 'platform_owner', scopeType: 'platform', scopeId: null });
    targets.push({ name: 'tenant_owner', scopeType: 'tenant', scopeId: tenantId });
  } else {
    for (const name of heldNames) targets.push({ name, scopeType: 'tenant', scopeId: tenantId });
  }

  const assignments = [];
  for (const target of targets) {
    const role = await resolveRole(target.name, target.scopeType);
    assignments.push({ roleId: role._id, scopeType: target.scopeType, scopeId: target.scopeId });
  }

  // updateOne (not save/create) copies the bcrypt hash verbatim: the StaffAccount
  // pre-save hook would otherwise hash the already-hashed password a second time.
  await StaffAccount.updateOne(
    { _id: user._id },
    {
      $set: {
        email: String(user.email).trim().toLowerCase(),
        username: user.username,
        password: user.password,
        status: user.isActive ? 'active' : 'suspended',
        twoFactor: migrateTwoFactor(user),
      },
    },
    { upsert: true, setDefaultsOnInsert: true, timestamps: true },
  );

  for (const assignment of assignments) {
    await RoleAssignment.updateOne(
      { staffId: user._id, ...assignment },
      { $setOnInsert: { staffId: user._id, ...assignment } },
      { upsert: true },
    );
  }

  await User.updateOne({ _id: user._id }, { $set: { staffMigratedAt: new Date() } });
}

/**
 * @param {{ defaultTenantId?: mongoose.Types.ObjectId|string|null }} [options]
 * @returns {Promise<{ scanned: number, migrated: number, skipped: number, errors: Array<{ userId: string, message: string }> }>}
 */
export async function migrateAdminUsersToStaff({ defaultTenantId = null } = {}) {
  return runAsPlatform('g5-staff-migration', async () => {
    let tenantId = defaultTenantId;
    if (!tenantId) {
      const def = await Tenant.findOne({ isDefault: true }).select('_id').lean();
      if (!def) throw new Error('Cannot migrate staff without a default tenant (run G1 first)');
      tenantId = def._id;
    } else if (!(tenantId instanceof mongoose.Types.ObjectId)) {
      tenantId = new mongoose.Types.ObjectId(String(tenantId));
    }

    const roleCache = new Map();
    let templatesSeeded = false;
    async function resolveRole(name, scopeType) {
      const key = `${scopeType}:${name}`;
      if (roleCache.has(key)) return roleCache.get(key);
      const find = async () => {
        const exact = await Role.findOne({ name, scopeType, scopeId: null }).select('_id').lean();
        if (exact) return exact;
        const scoped = await Role.findOne({ name, scopeType }).select('_id').lean();
        if (scoped) return scoped;
        // Roles created before İP-3 carry no scopeType; absent means the tenant default.
        if (scopeType === 'tenant') return Role.findOne({ name, scopeType: null }).select('_id').lean();
        return null;
      };
      let role = await find();
      if (!role && !templatesSeeded) {
        templatesSeeded = true;
        const { initDefaultScopedRoles } = await import('../services/permissions.js');
        await initDefaultScopedRoles();
        role = await find();
      }
      if (!role) throw new Error(`Role "${name}" (scopeType: ${scopeType}) is missing; seed the scoped role templates first`);
      roleCache.set(key, role);
      return role;
    }

    const superAdminRole = await Role.findOne({ name: 'super_admin' }).select('_id').lean();
    const bootstrap = !superAdminRole || !(await User.exists({ roles: superAdminRole._id }));

    const report = { scanned: 0, migrated: 0, skipped: 0, errors: [] };
    let lastId = null;
    for (;;) {
      const filter = { role: 'admin' };
      if (lastId) filter._id = { $gt: lastId };
      const batch = await User.find(filter)
        .select('+password +twoFactorSecret +twoFactorBackupCodes')
        .sort({ _id: 1 })
        .limit(BATCH_SIZE)
        .lean();
      if (batch.length === 0) break;

      for (const user of batch) {
        report.scanned += 1;
        if (user.staffMigratedAt) {
          report.skipped += 1;
          continue;
        }
        try {
          await migrateOne(user, tenantId, resolveRole, { bootstrap });
          report.migrated += 1;
        } catch (err) {
          const message = err?.message || String(err);
          report.errors.push({ userId: String(user._id), message });
          console.error(`[tenancy] G5: staff migration failed for user ${user._id}: ${message}`);
        }
      }

      lastId = batch[batch.length - 1]._id;
      if (batch.length < BATCH_SIZE) break;
    }

    // Only mark the migration done on a clean run so the runner retries errors.
    if (report.errors.length === 0) {
      await Migration.updateOne(
        { name: STAFF_MIGRATION_NAME },
        { $setOnInsert: { name: STAFF_MIGRATION_NAME, version: '1.3.0' } },
        { upsert: true },
      );
    }
    console.info(`[tenancy] G5: scanned=${report.scanned} migrated=${report.migrated} skipped=${report.skipped} errors=${report.errors.length}`);
    return report;
  });
}