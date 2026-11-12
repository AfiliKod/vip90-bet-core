import { it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  tenantContext,
  runWithTenant,
  runAsPlatform,
  getCurrentTenantId,
} from '../src/tenancy/context.js';
import { resolveConnection, setConnectionResolver } from '../src/tenancy/connections.js';
import { TenantScopeError } from '../src/tenancy/errors.js';

const HEX = '0123456789abcdef01234567';
const HEX2 = '89abcdef0123456789abcdef';

it('get() is undefined outside any run', () => assert.equal(tenantContext.get(), undefined));
it('runWithTenant normalises a hex string to ObjectId', () => runWithTenant(HEX, () => {
  const ctx = tenantContext.get();
  assert.ok(ctx.tenantId instanceof mongoose.Types.ObjectId);
  assert.equal(String(ctx.tenantId), HEX);
  assert.equal(ctx.mode, 'tenant');
  assert.equal(ctx.actor.kind, 'system');
  assert.ok(Object.isFrozen(ctx));
}));
it('runWithTenant rejects null and garbage ids', () => {
  assert.throws(() => runWithTenant(null, () => {}), TypeError);
  assert.throws(() => runWithTenant('nope', () => {}), TypeError);
});
it('returns fn result, including promises', async () => {
  assert.equal(await runWithTenant(HEX, async () => 42), 42);
});
it('context survives await, Promise.all and setTimeout', async () => {
  await runWithTenant(HEX, async () => {
    await new Promise((r) => setTimeout(r, 5));
    const ids = await Promise.all([1, 2].map(async () => String(getCurrentTenantId())));
    assert.deepEqual(ids, [HEX, HEX]);
  });
});
it('concurrent runs do not see each other', async () => {
  const seen = await Promise.all([HEX, HEX2].map((id) => runWithTenant(id, async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 10));
    return String(getCurrentTenantId());
  })));
  assert.deepEqual(seen, [HEX, HEX2]);
});
it('runAsPlatform requires a reason and sets platform mode', () => {
  assert.throws(() => runAsPlatform('', () => {}), TypeError);
  assert.throws(() => runAsPlatform(undefined, () => {}), TypeError);
  runAsPlatform('test: settle loop', () => {
    assert.equal(tenantContext.get().mode, 'platform');
    assert.equal(getCurrentTenantId(), null);
    assert.equal(tenantContext.get().reason, 'test: settle loop');
  });
});
it('nested platform inside tenant restores tenant afterwards', () => runWithTenant(HEX, () => {
  runAsPlatform('nested', () => assert.equal(getCurrentTenantId(), null));
  assert.equal(String(getCurrentTenantId()), HEX);
}));
it('connection comes from the resolver', () => {
  const other = mongoose.createConnection();
  setConnectionResolver((id) => (String(id) === HEX2 ? other : mongoose.connection));
  try {
    runWithTenant(HEX2, () => assert.equal(tenantContext.get().connection, other));
    runWithTenant(HEX, () => assert.equal(tenantContext.get().connection, mongoose.connection));
  } finally { setConnectionResolver(null); }
  assert.equal(resolveConnection(new mongoose.Types.ObjectId(HEX2)), mongoose.connection);
});
it('TenantScopeError carries code, status and details', () => {
  const e = new TenantScopeError('x', { model: 'W', op: 'find', reason: 'cross_tenant' });
  assert.equal(e.code, 'TENANT_SCOPE'); assert.equal(e.status, 500);
  assert.equal(e.model, 'W'); assert.equal(e.op, 'find'); assert.equal(e.reason, 'cross_tenant');
  assert.ok(e instanceof Error);
});
