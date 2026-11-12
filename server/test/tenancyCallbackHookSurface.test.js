import test from 'node:test';
import assert from 'node:assert/strict';
import * as tenancy from '../src/tenancy/index.js';
import { _resetTenancyRegistriesForTests } from '../src/tenancy/provisioning.js';

test('tenancy index re-exports required credential and callback attribution primitives', () => {
  assert.equal(typeof tenancy.registerTenantCredentialSchema, 'function');
  assert.equal(typeof tenancy.getTenantCredentialSchema, 'function');
  assert.equal(typeof tenancy.listTenantCredentialSchemas, 'function');
  assert.equal(typeof tenancy.runWithTenant, 'function');
  assert.equal(typeof tenancy.runAsPlatform, 'function');
  assert.equal(typeof tenancy.defineTenantModel, 'function');
  assert.equal(typeof tenancy.tenantFilter, 'function');
  assert.equal(typeof tenancy.findPaymentForCallback, 'function');
  assert.equal(typeof tenancy.findPayoutForCallback, 'function');
});

test('registerTenantCredentialSchema accepts valid module schema and validates duplicate rejection', () => {
  _resetTenancyRegistriesForTests();
  tenancy.registerTenantCredentialSchema('test_module', {
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true, required: true },
      { key: 'callbackToken', label: 'Callback Token', secret: true },
    ],
  });

  const registered = tenancy.getTenantCredentialSchema('test_module');
  assert.ok(registered);
  assert.equal(registered.moduleId, 'test_module');
  assert.equal(registered.fields.length, 2);

  assert.throws(
    () => tenancy.registerTenantCredentialSchema('test_module', { fields: [{ key: 'k1', label: 'L1' }] }),
    /already registered/
  );
});
