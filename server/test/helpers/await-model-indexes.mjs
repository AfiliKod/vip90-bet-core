/**
 * Test-only preload (`node --test --import ./server/test/helpers/await-model-indexes.mjs`).
 *
 * 1. Mongoose builds indexes in the background after connect. On a fresh database a
 *    test can run before a unique or TTL index exists and pass or fail by timing
 *    (seen in CI: duplicate-key, TTL and first-transaction-write tests). After every
 *    mongoose.connect() this waits for the indexes of every model loaded so far.
 *    Index build errors are left to the tests that look for them.
 *
 * 2. Outside CI, several checkouts (git worktrees) of this repository may run the
 *    suite at the same time against one local MongoDB. Test files use fixed database
 *    names, so parallel runs overwrite each other's data and fail at random. Unless
 *    CI is set, every database name gets a short suffix derived from the checkout
 *    path (override with TEST_DB_SUFFIX; set it to an empty string to disable).
 */
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

function dbSuffix() {
  if (process.env.TEST_DB_SUFFIX !== undefined) return process.env.TEST_DB_SUFFIX;
  if (process.env.CI) return '';
  return `_w${createHash('sha1').update(process.cwd()).digest('hex').slice(0, 6)}`;
}

/** Append the suffix to the database name of a mongodb:// URI (keeps query string). */
export function isolateUri(uri, suffix = dbSuffix()) {
  if (!suffix || typeof uri !== 'string') return uri;
  const match = uri.match(/^(mongodb(?:\+srv)?:\/\/[^/]+\/)([^?]*)(\?.*)?$/);
  if (!match) return uri;
  const [, prefix, db, query = ''] = match;
  if (!db || db.endsWith(suffix)) return uri;
  return `${prefix}${db}${suffix}${query}`;
}

const originalConnect = mongoose.connect.bind(mongoose);

mongoose.connect = async function connectAndAwaitIndexes(uri, ...rest) {
  const result = await originalConnect(isolateUri(uri), ...rest);
  await Promise.all(Object.values(mongoose.models).map((model) => model.init().catch(() => {})));
  return result;
};
