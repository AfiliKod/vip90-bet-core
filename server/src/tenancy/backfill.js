/**
 * G3 backfill (spec §6.3): give every legacy document that carries no tenant
 * a `tenantId`, in 10.000-document batches.
 *
 * Resumable: after each batch the checkpoint `{ lastId, processed, status }` is
 * written to `Migration{name:'tenancy-002-backfill-tenant-id'}.progress[<coll>]`,
 * so a killed process restarts from `lastId` instead of rescanning. A finished
 * collection is never touched again.
 *
 * The collections to walk come from the tenant model registry, so a model added
 * by another work package (or a premium add-on) is backfilled without touching
 * this file. `transactions_dedupe_archive` has no model and is included when it
 * exists. Indexes are not handled here — see the G4 migration.
 */
import mongoose from 'mongoose';
import Migration from '../models/Migration.js';
import Tenant from '../models/Tenant.js';
import { runAsPlatform } from './context.js';
import { getTenantModel, listTenantModelNames } from './models.js';

export const BACKFILL_MIGRATION_NAME = 'tenancy-002-backfill-tenant-id';
export const DEFAULT_BATCH_SIZE = 10_000;

/** Model-less legacy collection that holds dropped transaction copies. */
const DEDUPE_ARCHIVE_COLLECTION = 'transactions_dedupe_archive';

/** A document counts as unassigned when the field is missing or null. */
function unassignedFilter() {
  return { $or: [{ tenantId: null }, { tenantId: { $exists: false } }] };
}

/** Registered tenant collections, plus the dedupe archive when it exists. */
function collectionsToBackfill(existingCollections) {
  const names = new Set();
  for (const modelName of listTenantModelNames()) {
    names.add(getTenantModel(modelName).collection.collectionName);
  }
  if (existingCollections.has(DEDUPE_ARCHIVE_COLLECTION)) names.add(DEDUPE_ARCHIVE_COLLECTION);
  return [...names];
}

async function checkpoint(collName, entry) {
  await Migration.updateOne(
    { name: BACKFILL_MIGRATION_NAME },
    { $set: { [`progress.${collName}`]: entry } },
  );
}

/**
 * @param {{ batchSize?: number, targetTenantId?: mongoose.Types.ObjectId|string|null, onProgress?: ((report: {collection: string, processed: number}) => void|Promise<void>)|null }} [options]
 * @returns {Promise<{ collections: Record<string, { total: number, updated: number, status: string }>, durationMs: number }>}
 */
export async function backfillTenantId({
  batchSize = DEFAULT_BATCH_SIZE,
  targetTenantId = null,
  onProgress = null,
} = {}) {
  return runAsPlatform('backfill-tenant-id', async () => {
    const startMs = Date.now();

    let tenantId = targetTenantId;
    if (!tenantId) {
      const def = await Tenant.findOne({ isDefault: true }).select('_id').lean();
      if (!def) throw new Error('Cannot backfill without a default tenant (run G1 first)');
      tenantId = def._id;
    } else if (!(tenantId instanceof mongoose.Types.ObjectId)) {
      // Never store a hex string: the field is an ObjectId everywhere.
      tenantId = new mongoose.Types.ObjectId(String(tenantId));
    }

    const migrationDoc = await Migration.findOneAndUpdate(
      { name: BACKFILL_MIGRATION_NAME },
      { $setOnInsert: { name: BACKFILL_MIGRATION_NAME, version: '1.2.0' } },
      { upsert: true, new: true },
    );
    const progress = migrationDoc.progress || {};

    const db = mongoose.connection.db;
    const existingCollections = new Set((await db.listCollections().toArray()).map(c => c.name));
    const results = {};

    for (const collName of collectionsToBackfill(existingCollections)) {
      if (!existingCollections.has(collName)) continue;
      const coll = db.collection(collName);
      const total = await coll.countDocuments({});
      const collProgress = progress[collName] || { lastId: null, processed: 0, status: 'pending' };

      if (collProgress.status === 'completed') {
        results[collName] = { total, updated: collProgress.processed, status: 'completed' };
        continue;
      }

      let lastId = collProgress.lastId ? new mongoose.Types.ObjectId(collProgress.lastId) : null;
      let totalUpdated = collProgress.processed || 0;

      while (true) {
        const query = unassignedFilter();
        if (lastId) query._id = { $gt: lastId };

        const batch = await coll
          .find(query, { projection: { _id: 1 } })
          .sort({ _id: 1 })
          .limit(batchSize)
          .toArray();

        if (batch.length === 0) break;

        const ids = batch.map(doc => doc._id);
        const updateRes = await coll.updateMany({ _id: { $in: ids } }, { $set: { tenantId } });

        totalUpdated += updateRes.modifiedCount;
        lastId = ids[ids.length - 1];

        // Persisted before onProgress so a kill in the callback keeps the checkpoint.
        await checkpoint(collName, {
          lastId: String(lastId),
          processed: totalUpdated,
          status: 'in_progress',
          updatedAt: new Date(),
        });

        // Awaited so a reporter cannot race the next batch.
        if (onProgress) await onProgress({ collection: collName, processed: totalUpdated });
        if (batch.length < batchSize) break;
      }

      const remainingUnassigned = await coll.countDocuments(unassignedFilter());
      if (remainingUnassigned > 0) {
        throw new Error(`Backfill verification failed: ${collName} has ${remainingUnassigned} unassigned documents remaining`);
      }

      await checkpoint(collName, {
        lastId: lastId ? String(lastId) : null,
        processed: totalUpdated,
        status: 'completed',
        completedAt: new Date(),
      });

      results[collName] = { total, updated: totalUpdated, status: 'completed' };
    }

    return { collections: results, durationMs: Date.now() - startMs };
  });
}
