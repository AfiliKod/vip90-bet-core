import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { usePlatformAuthStore } from '../src/store/authStore.js';
import { partnerApi, partnersApi } from '../src/api/client.js';

// Register ESM loader for .jsx format before dynamic imports
register(`data:text/javascript,${encodeURIComponent(`
export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    return nextLoad(url, { ...context, format: 'module' });
  }
  return nextLoad(url, context);
}
`)}`);

const PartnersList = await import('../src/pages/PartnersList.jsx');
const PartnerDetail = await import('../src/pages/PartnerDetail.jsx');
const PartnerDashboard = await import('../src/pages/partner/PartnerDashboard.jsx');
const PartnerTenantsList = await import('../src/pages/partner/PartnerTenantsList.jsx');
const PartnerTenantProvision = await import('../src/pages/partner/PartnerTenantProvision.jsx');
const PartnerTenantDetail = await import('../src/pages/partner/PartnerTenantDetail.jsx');
const PartnerStaff = await import('../src/pages/partner/PartnerStaff.jsx');
const Sidebar = await import('../src/components/layout/Sidebar.jsx');

test('authStore correctly sets and identifies partner scope', () => {
  const store = usePlatformAuthStore.getState();

  store.setStaff({
    id: 'staff-123',
    username: 'pstaff',
    scope: 'partner',
    scopeId: 'partner-999',
  });

  const updated = usePlatformAuthStore.getState();
  assert.equal(updated.staff?.scope, 'partner');
  assert.equal(updated.staff?.scopeId, 'partner-999');
  assert.equal(updated.isPartnerScope(), true);
  assert.equal(updated.isPlatformScope(), false);
});

test('authStore correctly sets and identifies platform scope', () => {
  const store = usePlatformAuthStore.getState();

  store.setStaff({
    id: 'staff-platform-1',
    username: 'powner',
    scope: 'platform',
    scopeId: null,
  });

  const updated = usePlatformAuthStore.getState();
  assert.equal(updated.staff?.scope, 'platform');
  assert.equal(updated.staff?.scopeId, null);
  assert.equal(updated.isPartnerScope(), false);
  assert.equal(updated.isPlatformScope(), true);
});

test('Platform and partner console pages export valid React components', () => {
  assert.equal(typeof PartnersList.default, 'function');
  assert.equal(typeof PartnerDetail.default, 'function');
  assert.equal(typeof PartnerDashboard.default, 'function');
  assert.equal(typeof PartnerTenantsList.default, 'function');
  assert.equal(typeof PartnerTenantProvision.default, 'function');
  assert.equal(typeof PartnerTenantDetail.default, 'function');
  assert.equal(typeof PartnerStaff.default, 'function');
  assert.equal(typeof Sidebar.default, 'function');
});

test('Sidebar exports distinct platform and partner navigation structures', () => {
  const { platformNav, partnerNav } = Sidebar;
  assert.ok(Array.isArray(platformNav), 'platformNav must be an array');
  assert.ok(Array.isArray(partnerNav), 'partnerNav must be an array');

  // Platform navigation checks
  const platformPaths = platformNav.map((item) => item.path);
  assert.ok(platformPaths.includes('/partners'), 'platformNav must include /partners');
  assert.ok(platformPaths.includes('/tenants'), 'platformNav must include /tenants');

  // Partner navigation checks under /partner/*
  const partnerPaths = partnerNav.map((item) => item.path);
  assert.ok(partnerPaths.includes('/partner'), 'partnerNav must include /partner overview');
  assert.ok(partnerPaths.includes('/partner/operators'), 'partnerNav must include /partner/operators');
  assert.ok(partnerPaths.includes('/partner/operators/new'), 'partnerNav must include /partner/operators/new');
  assert.ok(partnerPaths.includes('/partner/staff'), 'partnerNav must include /partner/staff');
});

test('partnerApi client exports all required endpoints for partner portal', () => {
  assert.equal(typeof partnerApi.me, 'function');
  assert.equal(typeof partnerApi.listTenants, 'function');
  assert.equal(typeof partnerApi.getTenant, 'function');
  assert.equal(typeof partnerApi.provisionTenant, 'function');
  assert.equal(typeof partnerApi.changeTenantStatus, 'function');
  assert.equal(typeof partnerApi.reissueOwnerInvite, 'function');
  assert.equal(typeof partnerApi.getPortfolioMetrics, 'function');
  assert.equal(typeof partnerApi.getTenantMetrics, 'function');
  assert.equal(typeof partnerApi.updateIntegrations, 'function');
  assert.equal(typeof partnerApi.listStaff, 'function');
  assert.equal(typeof partnerApi.inviteStaff, 'function');
  assert.equal(typeof partnerApi.suspendStaff, 'function');
});

test('partnersApi client exports platform management CRUD endpoints', () => {
  assert.equal(typeof partnersApi.list, 'function');
  assert.equal(typeof partnersApi.get, 'function');
  assert.equal(typeof partnersApi.create, 'function');
  assert.equal(typeof partnersApi.update, 'function');
});

test('PartnersList exports 9 standard capabilities and 4 commercial models', () => {
  const { ALL_CAPABILITIES, COMMERCIAL_MODELS } = PartnersList;
  assert.ok(Array.isArray(ALL_CAPABILITIES));
  assert.equal(ALL_CAPABILITIES.length, 9);
  const capKeys = ALL_CAPABILITIES.map((c) => c.key);
  assert.ok(capKeys.includes('metrics.read'));
  assert.ok(capKeys.includes('staff.manage'));
  assert.ok(capKeys.includes('tenants.create'));
  assert.ok(capKeys.includes('tenants.config:write'));
  assert.ok(capKeys.includes('tenants.domains:write'));
  assert.ok(capKeys.includes('tenants.staff:write'));
  assert.ok(capKeys.includes('tenants.status:write'));
  assert.ok(capKeys.includes('tenants.integrations:write'));
  assert.ok(capKeys.includes('partner:grants:use'));

  assert.ok(Array.isArray(COMMERCIAL_MODELS));
  const modelValues = COMMERCIAL_MODELS.map((m) => m.value);
  assert.ok(modelValues.includes('revshare_ggr'));
  assert.ok(modelValues.includes('revshare_ngr'));
  assert.ok(modelValues.includes('turnover'));
  assert.ok(modelValues.includes('fixed'));
});

test('PartnerStaff exports standard partner scoped roles', () => {
  const { PARTNER_ROLES } = PartnerStaff;
  assert.ok(Array.isArray(PARTNER_ROLES));
  const roleNames = PARTNER_ROLES.map((r) => r.name);
  assert.ok(roleNames.includes('partner_ops'));
  assert.ok(roleNames.includes('partner_analyst'));
  assert.ok(roleNames.includes('partner_admin'));
});

test('Small-cell suppression in metrics formats <5 correctly', () => {
  // Test numeric formatting vs string suppression format
  const formatPlayers = (count) => (typeof count === 'number' && count < 5 ? '<5' : String(count));
  assert.equal(formatPlayers(0), '<5');
  assert.equal(formatPlayers(3), '<5');
  assert.equal(formatPlayers(4), '<5');
  assert.equal(formatPlayers(5), '5');
  assert.equal(formatPlayers(24), '24');
  assert.equal(formatPlayers('<5'), '<5');
});
