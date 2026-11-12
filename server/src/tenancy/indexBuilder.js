import mongoose from 'mongoose';
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { runAsPlatform, tenantContext } from './context.js';
import { getTenantModel } from './models.js';
import { listTenantIndexes } from './indexRegistry.js';

export const INDEX_MIGRATION_NAME = 'tenancy-003-compound-indexes';

function getCollectionForModel(modelName) {
  const conn = tenantContext.get()?.connection ?? mongoose.connection;
  try {
    const model = getTenantModel(modelName);
    return model.collection;
  } catch {
    if (conn.models[modelName]) return conn.models[modelName].collection;
    if (mongoose.models[modelName]) return mongoose.models[modelName].collection;
    const collName = mongoose.pluralize() ? mongoose.pluralize()(modelName) : `${modelName.toLowerCase()}s`;
    return conn.collection(collName);
  }
}

const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'models');

/**
 * Import every model file so their registerTenantIndexes calls run. The
 * migration CLI does not load the app, so without this the registry could be
 * empty and the migration would be recorded as done without building anything.
 */
export async function loadAllModels(dir = MODELS_DIR) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.js')).sort();
  for (const f of files) await import(pathToFileURL(join(dir, f)).href);
  return files.length;
}

/**
 * Builds compound tenant indexes online from indexRegistry without dropping legacy unique indexes.
 * Never calls syncIndexes / ensureIndexes.
 *
 * @param {{ background?: boolean }} opts
 * @returns {Promise<{ created: string[], preserved: string[] }>}
 */
export async function buildCompoundIndexes({ background = true } = {}) {
  await loadAllModels();
  return runAsPlatform('build-compound-indexes', async () => {
    const tenantIndexes = listTenantIndexes();
    if (tenantIndexes.length === 0) {
      throw new Error('[tenancy] G4: no tenant indexes registered after loading models; refusing to mark the migration done');
    }
    const created = [];
    const preserved = [];

    const byModel = new Map();
    for (const entry of tenantIndexes) {
      const list = byModel.get(entry.modelName) ?? [];
      list.push(entry);
      byModel.set(entry.modelName, list);
    }

    for (const [modelName, specs] of byModel) {
      const coll = getCollectionForModel(modelName);

      let existing = [];
      try {
        existing = await coll.listIndexes().toArray();
      } catch (err) {
        if (err.code !== 26 && err.codeName !== 'NamespaceNotFound') {
          throw err;
        }
      }

      const existingKeyHashes = new Set(existing.map(idx => JSON.stringify(idx.key)));
      const existingNames = new Set(existing.map(idx => idx.name));

      for (const { keys, options } of specs) {
        const keyHash = JSON.stringify(keys);
        if (existingKeyHashes.has(keyHash) || (options?.name && existingNames.has(options.name))) {
          preserved.push(`${modelName}:${JSON.stringify(keys)}`);
          continue;
        }

        const opts = { ...options, background };
        await coll.createIndex(keys, opts);
        created.push(`${modelName}:${JSON.stringify(keys)}`);
        existingKeyHashes.add(keyHash);
        if (options?.name) existingNames.add(options.name);
      }
    }

    return { created, preserved };
  });
}
