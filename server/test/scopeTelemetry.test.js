import test from 'node:test';
import assert from 'node:assert/strict';
import { ScopeTelemetryService } from '../src/platform/services/scopeTelemetry.js';

test('ScopeTelemetryService tracks clean days and reports N6 gate status', async () => {
  const telemetry = new ScopeTelemetryService();

  // Simulate clean run
  const statusClean = telemetry.evaluateGates({
    stagingDaysActive: 14,
    stagingViolations: 0,
    prodDaysActive: 7,
    prodViolations: 0,
  });

  assert.equal(statusClean.staging.gatePassed, true);
  assert.equal(statusClean.staging.consecutiveCleanDays, 14);
  assert.equal(statusClean.production.gatePassed, true);
  assert.equal(statusClean.production.consecutiveCleanDays, 7);
});

test('ScopeTelemetryService resets clean day counter when violations occur', async () => {
  const telemetry = new ScopeTelemetryService();

  const statusViolated = telemetry.evaluateGates({
    stagingDaysActive: 14,
    stagingViolations: 3,
    prodDaysActive: 7,
    prodViolations: 0,
  });

  assert.equal(statusViolated.staging.gatePassed, false);
  assert.equal(statusViolated.staging.consecutiveCleanDays, 0);
  assert.equal(statusViolated.staging.totalViolations, 3);
});
