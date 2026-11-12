/**
 * G6 settings migration (spec §6.3): categorize legacy Setting rows into
 * platform / tenant scopes and build the compound unique index
 * { tenantId, scope, brandId, key }. The legacy global key_1 unique index is
 * never dropped — single mode keeps it. Idempotent: guarded by the
 * Migration{name:'tenancy-005-settings'} record, safe to re-run.
 */
import mongoose from 'mongoose';
import '../models/Setting.js';
import '../models/Tenant.js';
import '../models/Migration.js';
import { runAsPlatform } from './context.js';
import { listTenantIndexes } from './indexRegistry.js';

export const SETTINGS_MIGRATION_NAME = 'tenancy-005-settings';
export const SETTINGS_MIGRATION_VERSION = '1.4.0';

/** Keys that stay platform-wide (spec §4.5); alert.* / platform.* prefixes also qualify. */
export const PLATFORM_KEYS = Object.freeze([
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'ALERT_WEBHOOK_URL',
  'ALERT_EMAIL_TO',
  'oddsFeed.apiKey',
  'license.key',
  'ai.apiKey',
  'sentry.dsn',
  'turnstile.siteKey',
  'turnstile.secretKey',
  'demoData.live.config',
]);

const PLATFORM_KEY_REGEX = /^(alert\.|platform\.)/;

/** Builds the registered Setting compound indexes online; never drops legacy indexes. */
async function buildSettingCompoundIndexes(coll) {
  const specs = listTenantIndexes().filter(i => i.modelName === 'Setting');
  if (specs.length === 0) {
    throw new Error('[tenancy] G6: no Setting indexes registered; refusing to mark the migration done');
  }
  let existing = [];
  try {
    existing = await coll.listIndexes().toArray();
  } catch (err) {
    if (err.code !== 26 && err.codeName !== 'NamespaceNotFound') throw err;
  }
  const existingNames = new Set(existing.map(i => i.name));
  const existingKeyHashes = new Set(existing.map(i => JSON.stringify(i.key)));
  let built = false;
  for (const { keys, options } of specs) {
    if (existingNames.has(options.name) || existingKeyHashes.has(JSON.stringify(keys))) continue;
    await coll.createIndex(keys, { ...options, background: true });
    built = true;
  }
  return built;
}

/**
 * @param {{ connection?: mongoose.Connection, logger?: { info?: Function } }} [options]
 * @returns {Promise<{ processed: number, compoundIndexBuilt: boolean, alreadyRan: boolean }>}
 */
export async function runSettingsMigration({ connection = mongoose.connection, logger = console } = {}) {
  const Migration = connection.model('Migration');
  const Tenant = connection.model('Tenant');
  const Setting = connection.model('Setting');

  const existing = await Migration.findOne({ name: SETTINGS_MIGRATION_NAME }).select('_id').lean();
  if (existing) return { processed: 0, compoundIndexBuilt: false, alreadyRan: true };

  return runAsPlatform('settings-migration', async () => {
    const coll = connection.collection(Setting.collection.collectionName);

    // Spec G6: the new compound unique is built first; legacy key_1 stays in place.
    const compoundIndexBuilt = await buildSettingCompoundIndexes(coll);

    const legacy = { scope: { $exists: false } };
    const platformKeys = [...PLATFORM_KEYS];
    const platformQuery = {
      ...legacy,
      $or: [{ key: { $in: platformKeys } }, { key: { $regex: PLATFORM_KEY_REGEX } }],
    };
    const tenantQuery = {
      ...legacy,
      key: { $nin: platformKeys, $not: PLATFORM_KEY_REGEX },
    };

    const platformRes = await coll.updateMany(platformQuery, { $set: { scope: 'platform', tenantId: null, brandId: null } });
    let processed = platformRes.modifiedCount ?? 0;

    // Multi-mode installs have no default tenant; only legacy tenant rows need one.
    const tenantCount = await coll.countDocuments(tenantQuery);
    if (tenantCount > 0) {
      const def = await Tenant.findOne({ isDefault: true }).select('_id').lean();
      if (!def) throw new Error('[tenancy] G6: cannot scope legacy settings without a default tenant (run G1 first)');
      const tenantRes = await coll.updateMany(tenantQuery, { $set: { scope: 'tenant', tenantId: def._id, brandId: null } });
      processed += tenantRes.modifiedCount ?? 0;
    }

    try {
      await Migration.updateOne(
        { name: SETTINGS_MIGRATION_NAME },
        { $setOnInsert: { name: SETTINGS_MIGRATION_NAME, version: SETTINGS_MIGRATION_VERSION } },
        { upsert: true },
      );
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // A concurrent boot recorded it first.
      return { processed, compoundIndexBuilt, alreadyRan: true };
    }

    logger.info?.(`[tenancy] G6: ${processed} setting rows scoped; compound index ${compoundIndexBuilt ? 'built' : 'already present'}`);
    return { processed, compoundIndexBuilt, alreadyRan: false };
  });
}