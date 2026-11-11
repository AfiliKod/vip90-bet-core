import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Counter from '../../src/models/Counter.js';
import { nextDepositIndex } from '../../src/services/cryptoSettings.js';
import { assignDepositIndex } from '../../src/routes/crypto.js';
import { migrateCryptoIndex, parseArgs, UNIQUE_INDEX_NAME } from '../../scripts/migrate-crypto-index.mjs';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v17_deposit_index_test';
const quiet = { log() {}, warn() {}, error() {} };

function rawUser(i, idx) {
  return {
    username: `v17u${i}_${Date.now()}`, email: `v17u${i}_${Date.now()}@example.test`,
    password: 'x', cryptoDepositIndex: idx,
  };
}

let connected = false;
try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
const opts = { skip: !connected && 'MongoDB not available' };
after(async () => { if (connected) { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); } });

describe('V17 deposit index allocation', () => {

  beforeEach(async () => {
    if (!connected) return;
    await User.collection.deleteMany({});
    await Counter.collection.deleteMany({});
    await User.collection.dropIndex(UNIQUE_INDEX_NAME).catch(() => {});
  });

  it('starts at 1 on an empty database (index 0 is the hot wallet)', opts, async () => {
    assert.equal(await nextDepositIndex(), 1);
    assert.equal(await nextDepositIndex(), 2);
  });

  it('never hands out an index already used by an existing user (no migration run)', opts, async () => {
    await User.collection.insertMany([1, 2, 3, 4, 5].map(i => rawUser(i, i)).concat([rawUser(9, null)]));
    assert.equal(await nextDepositIndex(), 6);
    // A later legacy assignment above the counter is still respected.
    await User.collection.insertOne(rawUser(20, 20));
    assert.equal(await nextDepositIndex(), 21);
  });

  it('concurrent allocations are unique', opts, async () => {
    await User.collection.insertMany([1, 2, 3].map(i => rawUser(i, i)));
    const got = await Promise.all(Array.from({ length: 20 }, () => nextDepositIndex()));
    assert.equal(new Set(got).size, 20);
    assert.ok(got.every(n => n >= 4 && n <= 23));
  });
});

describe('V17 assignDepositIndex same-user race', () => {
  beforeEach(async () => {
    if (!connected) return;
    await User.collection.deleteMany({});
    await Counter.collection.deleteMany({});
  });

  it('two concurrent requests for one user get the same, stored index', opts, async () => {
    await User.collection.insertMany([1, 2].map(i => rawUser(i, i)));
    const { insertedId } = await User.collection.insertOne(rawUser(3, null));
    // Each request loads its own copy of the user, both still with a null index.
    const [u1, u2] = await Promise.all([User.findById(insertedId), User.findById(insertedId)]);
    const [a, b] = await Promise.all([assignDepositIndex(u1), assignDepositIndex(u2)]);
    assert.equal(a, b);
    assert.ok(a >= 3);
    assert.equal((await User.collection.findOne({ _id: insertedId })).cryptoDepositIndex, a);
    // An already assigned index is returned unchanged.
    assert.equal(await assignDepositIndex(await User.findById(insertedId)), a);
  });
});

describe('V17 migrate-crypto-index', () => {
  const indexNames = async () => (await User.collection.listIndexes().toArray()).map(i => i.name);

  beforeEach(async () => {
    if (!connected) return;
    await User.collection.deleteMany({});
    await Counter.collection.deleteMany({});
    await User.collection.dropIndex(UNIQUE_INDEX_NAME).catch(() => {});
  });

  it('parses --commit and --fix; dry-run is the default', () => {
    assert.deepEqual(parseArgs([]), { dryRun: true, fix: false });
    assert.deepEqual(parseArgs(['--commit', '--fix']), { dryRun: false, fix: true });
  });

  it('dry-run reports but changes nothing', opts, async () => {
    await User.collection.insertMany([1, 2, 7].map(i => rawUser(i, i)));
    const r = await migrateCryptoIndex({ logger: quiet });
    assert.equal(r.maxIndex, 7);
    assert.equal(r.indexCreated, false);
    assert.equal(await Counter.collection.findOne({ _id: 'cryptoDepositIndex' }), null);
    assert.ok(!(await indexNames()).includes(UNIQUE_INDEX_NAME));
  });

  it('seeds the counter from the current max, is idempotent and creates the partial unique index', opts, async () => {
    await User.collection.insertMany([1, 2, 7].map(i => rawUser(i, i)).concat([rawUser(8, null)]));
    const r1 = await migrateCryptoIndex({ dryRun: false, logger: quiet });
    assert.equal(r1.maxIndex, 7);
    assert.equal(r1.indexCreated, true);
    assert.equal((await Counter.collection.findOne({ _id: 'cryptoDepositIndex' })).seq, 7);

    const r2 = await migrateCryptoIndex({ dryRun: false, logger: quiet });
    assert.equal(r2.indexCreated, false);
    assert.equal((await Counter.collection.findOne({ _id: 'cryptoDepositIndex' })).seq, 7);

    const idx = (await User.collection.listIndexes().toArray()).find(i => i.name === UNIQUE_INDEX_NAME);
    assert.equal(idx.unique, true);
    assert.deepEqual(idx.partialFilterExpression, { cryptoDepositIndex: { $type: 'number' } });
    // nulls are not constrained, numbers are
    await User.collection.insertOne(rawUser(30, null));
    await assert.rejects(User.collection.insertOne(rawUser(31, 7)), /duplicate key/);
    assert.equal(await nextDepositIndex(), 8);
  });

  it('with duplicates and no --fix: reports them and does not create the unique index', opts, async () => {
    await User.collection.insertMany([rawUser(1, 1), rawUser(2, 3), rawUser(3, 3)]);
    const r = await migrateCryptoIndex({ dryRun: false, logger: quiet });
    assert.equal(r.duplicates.length, 1);
    assert.equal(r.duplicates[0].index, 3);
    assert.equal(r.duplicates[0].userIds.length, 2);
    assert.equal(r.indexCreated, false);
    assert.ok(!(await indexNames()).includes(UNIQUE_INDEX_NAME));
  });

  it('--fix keeps the oldest holder, reassigns the others above the max and creates the index', opts, async () => {
    const [a, b, c] = [rawUser(1, 3), rawUser(2, 3), rawUser(3, 5)];
    const { insertedIds } = await User.collection.insertMany([a, b, c]);
    const r = await migrateCryptoIndex({ dryRun: false, fix: true, logger: quiet });
    assert.equal(r.reassigned.length, 1);
    assert.equal(String(r.reassigned[0].userId), String(insertedIds[1]));
    assert.equal(r.reassigned[0].from, 3);
    assert.equal(r.reassigned[0].to, 6);
    assert.equal((await User.collection.findOne({ _id: insertedIds[0] })).cryptoDepositIndex, 3);
    assert.equal((await User.collection.findOne({ _id: insertedIds[1] })).cryptoDepositIndex, 6);
    assert.equal(r.indexCreated, true);
  });
});
