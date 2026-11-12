import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tenantFilter } from '../src/tenancy/tenantFilter.js';
import { TenantScopeError } from '../src/tenancy/errors.js';

function withMode(mode, fn) {
  const prev = process.env.TENANCY_MODE;
  process.env.TENANCY_MODE = mode;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prev;
  }
}

test('single mode: filter unchanged even when the request carries the default tenant', () => {
  withMode('single', () => {
    assert.deepEqual(tenantFilter({ tenant: { id: 'T1' } }, { _id: 'x' }), { _id: 'x' });
  });
});

test('multi mode: filter carries the request tenant', () => {
  withMode('multi', () => {
    assert.deepEqual(tenantFilter({ tenant: { id: 'T1' } }, { _id: 'x', status: 'pending' }), { _id: 'x', status: 'pending', tenantId: 'T1' });
  });
});

test('multi mode: a request without a tenant is refused', () => {
  withMode('multi', () => {
    assert.throws(() => tenantFilter({}, { _id: 'x' }), TenantScopeError);
  });
});

test('scopeTenantId: null in single mode, the tenant in multi mode', async () => {
  const { scopeTenantId } = await import('../src/tenancy/tenantFilter.js');
  withMode('single', () => assert.equal(scopeTenantId({ tenant: { id: 'T1' } }), null));
  withMode('multi', () => assert.equal(scopeTenantId({ tenant: { id: 'T1' } }), 'T1'));
  withMode('multi', () => assert.throws(() => scopeTenantId({}), TenantScopeError));
});
