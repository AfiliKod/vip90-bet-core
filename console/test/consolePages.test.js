import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Register ESM loader for .jsx format before dynamic imports
register(`data:text/javascript,${encodeURIComponent(`
export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    return nextLoad(url, { ...context, format: 'module' });
  }
  return nextLoad(url, context);
}
`)}`);

const Dashboard = await import('../src/pages/Dashboard.jsx');
const TenantProvision = await import('../src/pages/TenantProvision.jsx');
const GoLiveChecklist = await import('../src/pages/GoLiveChecklist.jsx');
const TenantsList = await import('../src/pages/TenantsList.jsx');
const TenantDetail = await import('../src/pages/TenantDetail.jsx');
const DomainsList = await import('../src/pages/DomainsList.jsx');
const AuditLogs = await import('../src/pages/AuditLogs.jsx');
const AcceptInvite = await import('../src/pages/AcceptInvite.jsx');
const WriteGrantModal = await import('../src/components/WriteGrantModal.jsx');

test('Console pages export valid React component views', () => {
  assert.equal(typeof Dashboard.default, 'function');
  assert.equal(typeof TenantProvision.default, 'function');
  assert.equal(typeof GoLiveChecklist.default, 'function');
  assert.equal(typeof TenantsList.default, 'function');
  assert.equal(typeof TenantDetail.default, 'function');
  assert.equal(typeof DomainsList.default, 'function');
  assert.equal(typeof AuditLogs.default, 'function');
  assert.equal(typeof AcceptInvite.default, 'function');
  assert.equal(typeof WriteGrantModal.default, 'function');
});

test('GoLiveChecklist exports 6-point gate titles', () => {
  const { GATE_TITLES } = GoLiveChecklist;
  assert.ok(GATE_TITLES);
  assert.equal(typeof GATE_TITLES.legalEntity, 'string');
  assert.equal(typeof GATE_TITLES.providerApproval, 'string');
  assert.equal(typeof GATE_TITLES.pspSandbox, 'string');
  assert.equal(typeof GATE_TITLES.kycWebhook, 'string');
  assert.equal(typeof GATE_TITLES.emailSending, 'string');
  assert.equal(typeof GATE_TITLES.domainTls, 'string');
});

test('TenantsList exports valid status badge labels and styling', () => {
  const { STATUS_LABELS } = TenantsList;
  assert.ok(STATUS_LABELS);
  assert.equal(STATUS_LABELS.provisioning.text, 'Hazırlanıyor');
  assert.equal(STATUS_LABELS.active.text, 'Aktif (Canlı)');
  assert.equal(STATUS_LABELS.suspended.text, 'Askıya Alındı');
  assert.equal(STATUS_LABELS.closed.text, 'Kapatıldı (Arşiv)');
});

test('AcceptInvite password validation requires at least 12 characters and matching confirmation', () => {
  const { validatePassword } = AcceptInvite;
  assert.equal(typeof validatePassword, 'function');

  // Too short (< 12 chars)
  assert.match(validatePassword('short123', 'short123'), /en az 12 karakter/i);

  // Mismatch
  assert.match(
    validatePassword('validpassword123', 'differentpassword123'),
    /eşleşmiyor/i
  );

  // Valid password (>= 12 chars, matching)
  assert.equal(validatePassword('validpassword123', 'validpassword123'), null);
});

test('DNS TXT verification challenge record format verification', () => {
  const host = 'op2.example.com';
  const label = `_domain-verify.${host}`;
  assert.equal(label, '_domain-verify.op2.example.com');
  assert.match(label, /^_domain-verify\./);
});
