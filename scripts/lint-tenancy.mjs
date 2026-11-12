#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, join } from 'node:path';

export const RUN_AS_PLATFORM_ALLOWLIST = new Set([
  'server/src/platform/services/platformAudit.js',
  'server/src/services/settlement.js',
  'server/src/services/tenantDailyStat.js',
  'server/src/services/ledgerDedupe.js',
  'server/src/tenancy/provisioning.js',
  'server/src/tenancy/callbackAttribution.js',
  'server/src/tenancy/defaultTenant.js',
  'server/src/tenancy/staffMigration.js',
  'server/src/tenancy/settingsMigration.js',
  'server/src/tenancy/backfill.js',
  'server/src/tenancy/indexBuilder.js',
  'server/src/tenancy/callbackAttribution.js',
  'server/src/tenancy/context.js',
  'server/src/tenancy/index.js',
]);

const RUN_AS_PLATFORM_EXEMPT_PREFIXES = ['server/test/', 'server/migrations/', 'scripts/'];

export function checkRunAsPlatformUsage(filePath, content) {
  const norm = filePath.replace(/\\/g, '/');
  if (RUN_AS_PLATFORM_EXEMPT_PREFIXES.some((prefix) => norm.startsWith(prefix))) return [];
  if (!content.includes('runAsPlatform(')) return [];
  if (RUN_AS_PLATFORM_ALLOWLIST.has(norm)) return [];
  return [`runAsPlatform is not permitted in ${norm} (spec §4.4 #5)`];
}

// Catalog / platform models addressed by id without a tenant filter on purpose.
export const UNSCOPED_ID_LOOKUP_MODELS = new Set(['Event', 'GameTask']);

export function checkControllerQueries(filePath, content) {
  const norm = filePath.replace(/\\/g, '/');
  if (!norm.includes('controllers/')) return [];
  const errors = [];
  // Id lookups from the request must go through tenantFilter (spec §9 G-3).
  const idLookup = /\b([A-Z][A-Za-z]+)\.(findById|findByIdAndUpdate|findByIdAndDelete)\(\s*req\.params\./g;
  for (const m of content.matchAll(idLookup)) {
    if (!UNSCOPED_ID_LOOKUP_MODELS.has(m[1])) {
      errors.push(`${m[1]}.${m[2]}(req.params...) in ${norm}: use tenantFilter(req, { _id })`);
    }
  }
  if (/\.collection\.(find|update|delete|insert|bulkWrite)/.test(content)) {
    errors.push(`bare collection access prohibited in controller ${norm}`);
  }
  return errors;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);

export function runLint(rootDir = process.cwd()) {
  const allErrors = [];
  function walk(dir) {
    for (const f of readdirSync(dir)) {
      if (SKIP_DIRS.has(f)) continue;
      const full = join(dir, f);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (f.endsWith('.js') || f.endsWith('.mjs')) {
        const rel = relative(rootDir, full).replace(/\\/g, '/');
        const src = readFileSync(full, 'utf8');
        allErrors.push(...checkRunAsPlatformUsage(rel, src));
        allErrors.push(...checkControllerQueries(rel, src));
      }
    }
  }
  walk(rootDir);
  return allErrors;
}

if (process.argv[1] && process.argv[1].endsWith('lint-tenancy.mjs')) {
  const errs = runLint();
  if (errs.length > 0) {
    console.error('Tenancy lint errors found:');
    for (const err of errs) console.error('  - ' + err);
    process.exit(1);
  } else {
    console.log('Tenancy lint passed: 0 violations.');
    process.exit(0);
  }
}
