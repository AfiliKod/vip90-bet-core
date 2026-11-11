// Seeds the atomic crypto deposit-index counter and adds a partial unique index on
// User.cryptoDepositIndex (V17).
// Usage: node scripts/migrate-crypto-index.mjs [--commit] [--fix]   (default: dry-run)
// Loads server/.env (MONGODB_URI); run with the same env as the server.
// Idempotent. Duplicate indices are always reported; without --fix the unique index is
// NOT created. --fix keeps the oldest holder of a duplicated index and gives the others
// fresh indices from the counter (their deposit address changes — check the report).
// The existing sparse `cryptoDepositIndex_1` index from the schema is left in place.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { config as loadEnv } from 'dotenv';
import User from '../src/models/User.js';
import Counter from '../src/models/Counter.js';
import { nextDepositIndex } from '../src/services/cryptoSettings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UNIQUE_INDEX_NAME = 'cryptoDepositIndex_unique';
const COUNTER_ID = 'cryptoDepositIndex';
const PARTIAL = { cryptoDepositIndex: { $type: 'number' } };

async function findDuplicates() {
  const groups = await User.collection.aggregate([
    { $match: PARTIAL },
    { $sort: { _id: 1 } },
    { $group: { _id: '$cryptoDepositIndex', userIds: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  return groups.map(g => ({ index: g._id, userIds: g.userIds }));
}

async function maxIndex() {
  const last = await User.collection.find(PARTIAL, { projection: { cryptoDepositIndex: 1 } })
    .sort({ cryptoDepositIndex: -1 }).limit(1).next();
  return Math.max(0, last?.cryptoDepositIndex ?? 0);
}

export async function migrateCryptoIndex({ dryRun = true, fix = false, logger = console } = {}) {
  const mode = dryRun ? 'dry-run' : 'commit';
  const max = await maxIndex();
  const before = await Counter.collection.findOne({ _id: COUNTER_ID });
  logger.log?.(`[crypto-index] ${mode}: max user index=${max}, counter=${before?.seq ?? 'none'}`);
  if (!dryRun) await Counter.collection.updateOne({ _id: COUNTER_ID }, { $max: { seq: max } }, { upsert: true });

  const duplicates = await findDuplicates();
  const reassigned = [];
  for (const d of duplicates) {
    logger.warn?.(`[crypto-index] duplicate index ${d.index}: users ${d.userIds.map(String).join(', ')}`);
  }

  if (duplicates.length && fix && !dryRun) {
    for (const d of duplicates) {
      // Oldest holder (lowest _id) keeps the index.
      for (const userId of d.userIds.slice(1)) {
        const to = await nextDepositIndex();
        const res = await User.collection.updateOne(
          { _id: userId, cryptoDepositIndex: d.index },
          { $set: { cryptoDepositIndex: to } },
        );
        if (res.modifiedCount) {
          reassigned.push({ userId, from: d.index, to });
          logger.warn?.(`[crypto-index] user ${String(userId)}: index ${d.index} -> ${to} (deposit address changed)`);
        }
      }
    }
  }

  const remaining = reassigned.length ? await findDuplicates() : duplicates;
  const existing = (await User.collection.listIndexes().toArray()).some(i => i.name === UNIQUE_INDEX_NAME);
  let indexCreated = false;
  if (existing) {
    logger.log?.(`[crypto-index] ${UNIQUE_INDEX_NAME} already exists`);
  } else if (remaining.length) {
    logger.warn?.(`[crypto-index] ${remaining.length} duplicate index group(s); unique index NOT created${fix ? '' : ' (rerun with --fix --commit)'}`);
  } else if (dryRun) {
    logger.log?.(`[crypto-index] dry-run: would create ${UNIQUE_INDEX_NAME}`);
  } else {
    await User.collection.createIndex(
      { cryptoDepositIndex: 1 },
      { name: UNIQUE_INDEX_NAME, unique: true, partialFilterExpression: PARTIAL },
    );
    indexCreated = true;
    logger.log?.(`[crypto-index] created ${UNIQUE_INDEX_NAME}`);
  }

  return { maxIndex: max, duplicates, reassigned, indexCreated };
}

export function parseArgs(argv) {
  return { dryRun: !argv.includes('--commit'), fix: argv.includes('--fix') };
}

export async function main({ argv = process.argv.slice(2), envPath = join(__dirname, '..', '.env') } = {}) {
  const { dryRun, fix } = parseArgs(argv);
  loadEnv({ path: envPath });
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set (server/.env or environment); refusing to use a default database');
  await mongoose.connect(uri, { autoIndex: false });
  try {
    const r = await migrateCryptoIndex({ dryRun, fix });
    if (r.duplicates.length && !(fix && !dryRun)) process.exitCode = 2;
  } finally { await mongoose.disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
