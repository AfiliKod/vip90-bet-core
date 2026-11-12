import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerTenantIndexes, listTenantIndexes, _resetTenantIndexes } from '../src/tenancy/indexRegistry.js';

beforeEach(() => _resetTenantIndexes());

const uniq = { keys: { tenantId: 1, username: 1 }, options: { name: 'tenant_username_uniq', unique: true } };

test('registers and lists indexes in order', () => {
  registerTenantIndexes('User', [uniq, { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } }]);
  registerTenantIndexes('Bet', [{ keys: { tenantId: 1, userId: 1 }, options: { name: 'tenant_userId' } }]);
  assert.deepEqual(listTenantIndexes().map(i => `${i.modelName}.${i.options.name}`),
    ['User.tenant_username_uniq', 'User.tenant_createdAt', 'Bet.tenant_userId']);
});

test('re-registering the same definition is a no-op', () => {
  registerTenantIndexes('User', [uniq]);
  registerTenantIndexes('User', [uniq]);
  assert.equal(listTenantIndexes().length, 1);
});

test('conflicting definition with the same name throws', () => {
  registerTenantIndexes('User', [uniq]);
  assert.throws(() => registerTenantIndexes('User', [{ keys: { tenantId: 1, email: 1 }, options: { name: 'tenant_username_uniq', unique: true } }]), /conflicting/);
});

test('keys must start with tenantId and names with tenant_', () => {
  assert.throws(() => registerTenantIndexes('User', [{ keys: { username: 1, tenantId: 1 }, options: { name: 'tenant_x' } }]), TypeError);
  assert.throws(() => registerTenantIndexes('User', [{ keys: { tenantId: 1, username: 1 }, options: { name: 'username_1' } }]), TypeError);
  assert.throws(() => registerTenantIndexes('User', []), TypeError);
});
