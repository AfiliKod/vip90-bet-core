/**
 * Default tenant boot migration (G1, spec §6.3).
 *
 * Single-operator installs get exactly one `Tenant{isDefault:true, key:'default'}`,
 * its player domains back-filled once from CLIENT_URL and the default brand, and the
 * shared migration record `tenancy-001-default-tenant`. Safe to run concurrently
 * from several processes (PM2 cluster, overlapping restarts).
 *
 * Core never imports premium: the provider Operator model is looked up by name.
 */
import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import Domain from '../models/Domain.js';
import Brand from '../models/Brand.js';
import Migration from '../models/Migration.js';
import { getTenancyMode } from '../config/tenancy.js';
import { errorLogger } from '../services/errorLogger.js';
import { setDefaultTenantId } from './defaultTenantId.js';

export const DEFAULT_TENANT_KEY = 'default';
export const DEFAULT_TENANT_MIGRATION = Object.freeze({
  name: 'tenancy-001-default-tenant',
  version: '1.1.0',
});

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/;

function isDuplicateKeyError(err) {
  return err?.code === 11000 || /E11000/.test(String(err?.message || ''));
}

/**
 * Parse a comma-separated CLIENT_URL into lower-cased hosts (port kept when non-default),
 * skipping empty entries, `*` and invalid URLs. Deduplicated, in order.
 */
export function hostsFromClientUrl(clientUrl) {
  if (!clientUrl || typeof clientUrl !== 'string') return [];
  const out = [];
  for (const raw of clientUrl.split(',')) {
    const entry = raw.trim();
    if (!entry || entry === '*') continue;
    let url;
    try {
      url = new URL(entry);
    } catch {
      console.warn(`[tenancy] CLIENT_URL entry skipped (invalid URL): "${entry}"`);
      continue;
    }
    const host = url.host.toLowerCase();
    if (host && !out.includes(host)) out.push(host);
  }
  return out;
}

/** Normalise a brand domain entry to a bare host, or null when invalid. */
function normaliseBrandHost(value) {
  if (typeof value !== 'string') return null;
  let host = value.trim().toLowerCase();
  if (!host) return null;
  if (host.includes('://')) {
    try {
      host = new URL(host).host.toLowerCase();
    } catch {
      return null;
    }
  }
  return HOST_RE.test(host) ? host : null;
}

function hostsFromBrand(brand) {
  if (!brand || !Array.isArray(brand.domains)) return [];
  const sorted = [
    ...brand.domains.filter((d) => d?.isPrimary),
    ...brand.domains.filter((d) => !d?.isPrimary),
  ];
  const out = [];
  for (const d of sorted) {
    const host = normaliseBrandHost(d?.domain);
    if (host && !out.includes(host)) out.push(host);
  }
  return out;
}

async function defaultFindProviderOperatorId() {
  const Operator = mongoose.models.Operator;
  if (!Operator) return null;
  return (await Operator.findOne({ operatorKey: 'vip90' }).select('_id').lean())?._id ?? null;
}

async function findOrCreateDefaultTenant() {
  let tenant = await Tenant.findOne({ isDefault: true });
  if (tenant) return { tenant, created: false };
  try {
    const res = await Tenant.findOneAndUpdate(
      { key: DEFAULT_TENANT_KEY },
      {
        $setOnInsert: {
          key: DEFAULT_TENANT_KEY,
          name: 'Default',
          isDefault: true,
          status: 'active',
          ownership: 'direct',
          createdVia: 'platform',
        },
      },
      { upsert: true, new: true, includeResultMetadata: true },
    );
    return { tenant: res.value, created: Boolean(res.lastErrorObject?.upserted) };
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // A concurrent boot won the insert: re-read once.
    tenant = await Tenant.findOne({ isDefault: true });
    if (!tenant) throw err;
    return { tenant, created: false };
  }
}

/**
 * Ensure the default tenant exists, link the provider operator once and back-fill
 * the domains once (guarded by the migration record).
 */
export async function ensureDefaultTenant({
  env = process.env,
  findProviderOperatorId = defaultFindProviderOperatorId,
} = {}) {
  const { tenant: found, created } = await findOrCreateDefaultTenant();
  if (!found) throw new Error('Default tenant could not be created');
  const tenantId = found._id;

  // Link the provider operator; never overwrite an existing link.
  if (found.providerOperatorId == null) {
    const operatorId = await findProviderOperatorId();
    if (operatorId) {
      try {
        await Tenant.updateOne(
          { _id: tenantId, providerOperatorId: { $exists: false } },
          { $set: { providerOperatorId: operatorId } },
        );
      } catch (err) {
        // Sparse unique index: the operator is already linked to another tenant.
        if (!isDuplicateKeyError(err)) throw err;
        console.warn('[tenancy] provider operator already linked to another tenant; left alone');
      }
    }
  }

  let domainsCreated = 0;
  let migrationRecorded = false;
  const { name, version } = DEFAULT_TENANT_MIGRATION;
  const existing = await Migration.findOne({ name }).select('_id').lean();
  if (!existing) {
    const brand = await Brand.findOne({ isDefault: true }).lean();
    const hosts = [];
    for (const h of [...hostsFromClientUrl(env.CLIENT_URL), ...hostsFromBrand(brand)]) {
      if (!hosts.includes(h)) hosts.push(h);
    }
    for (let i = 0; i < hosts.length; i += 1) {
      const host = hosts[i];
      try {
        // A host already owned by another tenant is left alone ($setOnInsert only).
        const r = await Domain.updateOne(
          { host },
          {
            $setOnInsert: {
              host,
              tenantId,
              brandId: brand?._id ?? null,
              isPrimary: i === 0,
              purpose: 'player',
            },
          },
          { upsert: true },
        );
        domainsCreated += r.upsertedCount || 0;
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err; // concurrent boot inserted it
      }
    }
    try {
      const r = await Migration.updateOne(
        { name },
        { $setOnInsert: { name, version } },
        { upsert: true },
      );
      migrationRecorded = (r.upsertedCount || 0) > 0;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }

  const tenant = await Tenant.findById(tenantId);
  if (tenant && getTenancyMode(env) === 'single') setDefaultTenantId(tenant._id);
  return { tenant, created, domainsCreated, migrationRecorded };
}

/**
 * Boot entry point. Never throws: a failed G1 must not stop the server.
 */
export async function runTenancyBoot({
  env = process.env,
  ensure = ensureDefaultTenant,
  reportError = (m) => errorLogger.critical('tenancy_boot', m),
} = {}) {
  let mode = 'single';
  try {
    mode = getTenancyMode(env);
    if (mode === 'multi') return { mode, defaultTenant: null, error: null };
    const { tenant } = await ensure({ env });
    return { mode, defaultTenant: tenant ?? null, error: null };
  } catch (err) {
    const message = err?.message || String(err);
    try {
      reportError(message);
    } catch {
      // Reporting must never break boot.
    }
    return { mode, defaultTenant: null, error: message };
  }
}
