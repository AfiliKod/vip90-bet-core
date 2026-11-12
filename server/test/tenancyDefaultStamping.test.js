import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { defineTenantModel } from '../src/tenancy/models.js';
import { runAsPlatform, runWithTenant } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';

// Own test database; never read MONGODB_URI (it may point to a real database).
const BASE = (process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017').replace(/\/+$/, '');
const DB_URI = `${BASE}/vip90_test_ip2_t11`;
const Widget = defineTenantModel('TenancyDefaultStampingWidget', new mongoose.Schema({ name: String, x: Number }));

describe('single-mode default tenant stamping', () => {
  const savedMode = process.env.TENANCY_MODE;
  const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

  before(async () => {
    await mongoose.connect(DB_URI);
    await mongoose.connection.dropDatabase();
    await Widget.init();
  });
  after(async () => {
    setDefaultTenantId(null);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (savedMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = savedMode;
    if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
    else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
  });
  beforeEach(async () => {
    process.env.TENANCY_MODE = 'single';
    process.env.TENANCY_ENFORCEMENT = 'off';
    setDefaultTenantId(null);
    await Widget.deleteMany({});
  });

  it('single + off stamps create() and insertMany() without context', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    setDefaultTenantId(String(tenantId));

    const created = await Widget.create({ name: 'created' });
    const inserted = await Widget.insertMany([{ name: 'first' }, { name: 'second' }]);

    assert.equal(String(created.tenantId), String(tenantId));
    assert.ok(inserted.every((doc) => String(doc.tenantId) === String(tenantId)));
  });

  it('single + off stamps upserts but leaves non-upsert updates untouched', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    setDefaultTenantId(tenantId);
    await Widget.collection.insertOne({ name: 'existing', x: 0 });

    const upserted = await Widget.findOneAndUpdate({ name: 'upserted' }, { $set: { x: 1 } }, { upsert: true, new: true });
    await Widget.updateOne({ name: 'existing' }, { $set: { x: 2 } });
    const existing = await Widget.collection.findOne({ name: 'existing' });

    assert.equal(String(upserted.tenantId), String(tenantId));
    assert.equal(existing.tenantId, undefined);
  });

  it('keeps an explicit tenantId on create', async () => {
    setDefaultTenantId(new mongoose.Types.ObjectId());
    const explicitTenantId = new mongoose.Types.ObjectId();

    const created = await Widget.create({ name: 'explicit', tenantId: explicitTenantId });

    assert.equal(String(created.tenantId), String(explicitTenantId));
  });

  it('tenant context retains its existing enforcement behavior instead of default stamping', async () => {
    const defaultTenantId = new mongoose.Types.ObjectId();
    const otherTenantId = new mongoose.Types.ObjectId();
    setDefaultTenantId(defaultTenantId);

    const off = await runWithTenant(otherTenantId, () => Widget.create({ name: 'off' }));
    process.env.TENANCY_ENFORCEMENT = 'enforce';
    const enforced = await runWithTenant(otherTenantId, () => Widget.create({ name: 'enforced' }));

    assert.equal(off.tenantId, undefined); // Enforcement off is the existing no-op behavior.
    assert.equal(String(enforced.tenantId), String(otherTenantId));
  });

  it('does not stamp in multi mode', async () => {
    setDefaultTenantId(new mongoose.Types.ObjectId());
    process.env.TENANCY_MODE = 'multi';
    process.env.TENANCY_ENFORCEMENT = 'enforce';

    const created = await runAsPlatform('test multi-mode default stamping', () => Widget.create({ name: 'multi' }));

    assert.equal(created.tenantId, undefined);
  });

  it('does not stamp before the default tenant id is set', async () => {
    const created = await Widget.create({ name: 'unbooted' });

    assert.equal(created.tenantId, undefined);
  });
});
