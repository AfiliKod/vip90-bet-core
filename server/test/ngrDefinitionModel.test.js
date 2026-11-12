import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import NgrDefinition from '../src/models/NgrDefinition.js';
import StaffAccount from '../src/models/StaffAccount.js';
import { PERMISSION_DEFS } from '../src/services/permissions.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9d_t1';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await NgrDefinition.createIndexes();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('NgrDefinition creates a valid definition and enforces version compound unique index', async () => {
  const staff = await StaffAccount.create({ email: 'ngrowner@example.com', username: 'ngrowner', password: 'pwd', status: 'active' });

  const def1 = await NgrDefinition.create({
    name: 'Standard NGR',
    version: 1,
    description: 'Default tiered NGR calculation',
    ggrComponents: ['casino', 'sports'],
    items: [
      { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      { category: 'chargeback', label: 'Chargebacks', enabled: true, source: 'stat_field', params: { field: 'chargebacks' } },
    ],
    createdBy: staff._id,
  });

  assert.equal(def1.name, 'Standard NGR');
  assert.equal(def1.version, 1);
  assert.equal(def1.items.length, 2);
  assert.ok(def1.legalRetentionUntil >= new Date(Date.now() + 4 * 365 * 86400 * 1000));

  // Duplicate (name, version) must fail with E11000
  await assert.rejects(
    () => NgrDefinition.create({
      name: 'Standard NGR',
      version: 1,
      items: [],
      createdBy: staff._id,
    }),
    /E11000/
  );

  // Version 2 succeeds
  const def2 = await NgrDefinition.create({
    name: 'Standard NGR',
    version: 2,
    items: [
      { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
    ],
    createdBy: staff._id,
  });
  assert.equal(def2.version, 2);
});

test('NgrDefinition pre-save validation rejects duplicate category among enabled items', async () => {
  const staff = await StaffAccount.create({ email: 'catowner@example.com', username: 'catowner', password: 'pwd', status: 'active' });

  await assert.rejects(
    () => NgrDefinition.create({
      name: 'Duplicate Category Test',
      version: 1,
      items: [
        { category: 'bonus', label: 'Bonus Cost 1', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
        { category: 'bonus', label: 'Bonus Cost 2', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.05 } },
      ],
      createdBy: staff._id,
    }),
    (err) => err.code === 'ERR_NGR_DUPLICATE_CATEGORY'
  );
});

test('NgrDefinition allows multiple "other" items only when labels are distinct', async () => {
  const staff = await StaffAccount.create({ email: 'otherowner@example.com', username: 'otherowner', password: 'pwd', status: 'active' });

  // Distinct labels should succeed
  const def = await NgrDefinition.create({
    name: 'Multiple Other Test',
    version: 1,
    items: [
      { category: 'other', label: 'Hosting Fee', enabled: true, source: 'fixed', params: { amount: 100 } },
      { category: 'other', label: 'Licensing Admin', enabled: true, source: 'fixed', params: { amount: 50 } },
    ],
    createdBy: staff._id,
  });
  assert.equal(def.items.length, 2);

  // Duplicate label in "other" must be rejected
  await assert.rejects(
    () => NgrDefinition.create({
      name: 'Duplicate Other Label Test',
      version: 1,
      items: [
        { category: 'other', label: 'Hosting Fee', enabled: true, source: 'fixed', params: { amount: 100 } },
        { category: 'other', label: 'Hosting Fee', enabled: true, source: 'fixed', params: { amount: 200 } },
      ],
      createdBy: staff._id,
    }),
    (err) => err.code === 'ERR_NGR_DUPLICATE_LABEL'
  );
});

test('NgrDefinition pre-save validation rejects duplicate source keys across items', async () => {
  const staff = await StaffAccount.create({ email: 'srcowner@example.com', username: 'srcowner', password: 'pwd', status: 'active' });

  await assert.rejects(
    () => NgrDefinition.create({
      name: 'Duplicate Source Test',
      version: 1,
      items: [
        { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
        { category: 'other', label: 'Extra Bonus Adjustment', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      ],
      createdBy: staff._id,
    }),
    (err) => err.code === 'ERR_NGR_DUPLICATE_SOURCE'
  );
});

test('NgrDefinition rejects deductions targeting components already in ggrAlreadyNetOf', async () => {
  const staff = await StaffAccount.create({ email: 'netowner@example.com', username: 'netowner', password: 'pwd', status: 'active' });

  await assert.rejects(
    () => NgrDefinition.create({
      name: 'Already Net Of Test',
      version: 1,
      ggrAlreadyNetOf: ['bonus'],
      items: [
        { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      ],
      createdBy: staff._id,
    }),
    (err) => err.code === 'ERR_NGR_ALREADY_NET_OF'
  );
});

test('Permissions catalogue includes platform:billing:manage and platform:billing:read', () => {
  const keys = new Set(PERMISSION_DEFS.map((p) => p.key));
  assert.ok(keys.has('platform:billing:manage'));
  assert.ok(keys.has('platform:billing:read'));
});

test('two rate-based deductions of different categories on GGR are allowed', async () => {
  const { default: NgrDefinition } = await import('../src/models/NgrDefinition.js');
  const def = new NgrDefinition({
    name: 'rates-on-ggr', version: 1, createdBy: new (await import('mongoose')).default.Types.ObjectId(), ggrComponents: ['casino', 'sports'],
    items: [
      { category: 'tax', label: 'Gaming tax', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.15 } },
      { category: 'provider_fee', label: 'Content fee', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.1 } },
    ],
  });
  await def.validate();
});

test('an other-category item reading bonusCost is refused when GGR is already net of bonuses', async () => {
  const { default: NgrDefinition } = await import('../src/models/NgrDefinition.js');
  const def = new NgrDefinition({
    name: 'bonus-sneak', version: 1, ggrComponents: ['casino'], ggrAlreadyNetOf: ['bonus'],
    items: [{ category: 'other', label: 'Promo cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } }],
  });
  await assert.rejects(def.validate(), { code: 'ERR_NGR_ALREADY_NET_OF' });
});
