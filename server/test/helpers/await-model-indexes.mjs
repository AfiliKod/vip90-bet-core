/**
 * Test-only preload (`node --test --import ./server/test/helpers/await-model-indexes.mjs`).
 *
 * Mongoose builds indexes in the background after connect. On a fresh database a
 * test can run before a unique or TTL index exists and pass or fail by timing
 * (seen in CI: duplicate-key, TTL and first-transaction-write tests). After every
 * mongoose.connect() this waits for the indexes of every model loaded so far.
 * Index build errors are left to the tests that look for them.
 */
import mongoose from 'mongoose';

const originalConnect = mongoose.connect.bind(mongoose);

mongoose.connect = async function connectAndAwaitIndexes(...args) {
  const result = await originalConnect(...args);
  await Promise.all(Object.values(mongoose.models).map((model) => model.init().catch(() => {})));
  return result;
};
