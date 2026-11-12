import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTenancyStartup } from '../src/config/tenancy.js';

test('validateTenancyStartup enforces AUDIT_RETENTION_DAYS >= 1825 in multi mode', () => {
  const problemsLow = validateTenancyStartup({
    TENANCY_MODE: 'multi',
    JWT_STAFF_SECRET: 'secret-key-staff',
    OPERATOR_SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
    AUDIT_RETENTION_DAYS: '365',
  });

  assert.ok(problemsLow.some(p => p.includes('AUDIT_RETENTION_DAYS must be at least 1825')));

  const problemsValid = validateTenancyStartup({
    TENANCY_MODE: 'multi',
    JWT_STAFF_SECRET: 'secret-key-staff',
    OPERATOR_SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
    AUDIT_RETENTION_DAYS: '1825',
  });

  assert.equal(problemsValid.length, 0);
});
