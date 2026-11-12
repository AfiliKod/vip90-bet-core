import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const TENNANCY_DIR = path.resolve('server/src/tenancy');

const EXPECTED = [
  'tenantContext',
  'runWithTenant',
  'runAsPlatform',
  'getCurrentTenantId',
  'TenantScopeError',
  'resolveConnection',
  'setConnectionResolver',
  'tenantScoped',
  'tenantLookup',
  'defineTenantModel',
  'getTenantModel',
  'forEachTenant',
  'registerTenantProvisioningHook',
  'runTenantProvisioningHooks',
  'registerTenantCredentialSchema',
  'getTenantCredentialSchema',
  'listTenantCredentialSchemas',
  'StaffAccount',
  'RoleAssignment',
  'resolveTenantHost',
  'requireStaff',
  'requireStaffPermission',
  'signStaffAccess',
];

const tenancyIndexPath = path.join(TENNANCY_DIR, 'index.js');

describe('tenancy index', () => {
  test('exports the documented surface and nothing test-only', async () => {
    const mod = await import(tenancyIndexPath);
    assert.deepEqual(Object.keys(mod).sort(), [...EXPECTED].sort());
  });

  test('no file under server/src/tenancy imports premium', () => {
    const files = fs.readdirSync(TENNANCY_DIR);
    const jsFiles = files.filter((f) => f.endsWith('.js') && f !== 'index.js');
    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(TENNANCY_DIR, file), 'utf8');
      const matches = content.match(/from ['"]([^'"]*)['"]/g) || [];
      for (const m of matches) {
        const inner = m.match(/from ['"]([^'"]*)['"]$/);
        if (inner && inner[1].includes('premium')) {
          throw new Error(`File ${file} imports premium: ${m}`);
        }
      }
    }
  });
});