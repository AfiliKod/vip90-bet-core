import { it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentTenantId } from '../src/tenancy/context.js';
import {
  registerTenantProvisioningHook,
  runTenantProvisioningHooks,
  registerTenantCredentialSchema,
  getTenantCredentialSchema,
  listTenantCredentialSchemas,
  _resetTenancyRegistriesForTests,
} from '../src/tenancy/provisioning.js';

const T1 = '0123456789abcdef01234567';

beforeEach(() => _resetTenancyRegistriesForTests());

it('runs hooks in order inside the tenant context', async () => {
  const calls = [];
  registerTenantProvisioningHook((t) => calls.push(['a', String(getCurrentTenantId())]), { name: 'a' });
  registerTenantProvisioningHook(async () => calls.push(['b']), { name: 'b' });
  const out = await runTenantProvisioningHooks({ _id: T1 });
  assert.deepEqual(calls, [['a', String(T1)], ['b']]);
  assert.deepEqual(out, [{ name: 'a', ok: true }, { name: 'b', ok: true }]);
});

it('unregister removes the hook', async () => {
  const off = registerTenantProvisioningHook(() => { throw new Error('x'); }, { name: 'x' });
  off();
  assert.deepEqual(await runTenantProvisioningHooks({ _id: T1 }), []);
});

it('a failing hook stops provisioning with a named error', async () => {
  let ranSecond = false;
  registerTenantProvisioningHook(() => { throw new Error('no operator'); }, { name: 'inhouse' });
  registerTenantProvisioningHook(() => { ranSecond = true; }, { name: 'later' });
  await assert.rejects(runTenantProvisioningHooks({ _id: T1 }), /Provisioning hook "inhouse" failed: no operator/);
  assert.equal(ranSecond, false);
});

it('rejects non-function hooks', () => assert.throws(() => registerTenantProvisioningHook(1), TypeError));

it('credential schemas register once per module', () => {
  registerTenantCredentialSchema('igames', { fields: [{ key: 'agentCode', label: 'Agent', required: true }, { key: 'token', label: 'Token', secret: true }] });
  assert.equal(getTenantCredentialSchema('igames').fields.length, 2);
  assert.equal(getTenantCredentialSchema('none'), null);
  assert.throws(() => registerTenantCredentialSchema('igames', { fields: [{ key: 'x', label: 'x' }] }), /already registered/);
  assert.throws(() => registerTenantCredentialSchema('m2', { fields: [] }), /fields/);
  assert.throws(() => registerTenantCredentialSchema('m3', { fields: [{ key: 'a', label: 'a' }, { key: 'a', label: 'b' }] }), /duplicate/i);
  assert.deepEqual(listTenantCredentialSchemas().map((s) => s.moduleId), ['igames']);
});
