import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { billingApi, reportsApi } from '../src/api/client.js';

// Register ESM loader for .jsx format before dynamic imports
register(`data:text/javascript,${encodeURIComponent(`
export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    return nextLoad(url, { ...context, format: 'module' });
  }
  return nextLoad(url, context);
}
`)}`);

const BillingDashboardMod = await import('../src/pages/billing/BillingDashboard.jsx');
const StatementsListMod = await import('../src/pages/billing/StatementsList.jsx');
const StatementDetailMod = await import('../src/pages/billing/StatementDetail.jsx');
const OperatorFeePlansMod = await import('../src/pages/billing/OperatorFeePlans.jsx');
const PlatformReportsMod = await import('../src/pages/reports/PlatformReports.jsx');
const SidebarMod = await import('../src/components/layout/Sidebar.jsx');

const BillingDashboard = BillingDashboardMod.default;
const StatementsList = StatementsListMod.default;
const StatementDetail = StatementDetailMod.default;
const OperatorFeePlans = OperatorFeePlansMod.default;
const PlatformReports = PlatformReportsMod.default;
const platformNav = SidebarMod.platformNav;

test('Sidebar includes Billing and Reports in platformNav', () => {
  const paths = platformNav.map((i) => i.path);
  assert.ok(paths.includes('/billing'), 'Platform nav must have /billing');
  assert.ok(paths.includes('/reports'), 'Platform nav must have /reports');
});

test('Billing and Reports page components are valid React elements', () => {
  assert.equal(typeof BillingDashboard, 'function');
  assert.equal(typeof StatementsList, 'function');
  assert.equal(typeof StatementDetail, 'function');
  assert.equal(typeof OperatorFeePlans, 'function');
  assert.equal(typeof PlatformReports, 'function');
});

test('billingApi client exports all required platform billing endpoints', () => {
  assert.equal(typeof billingApi.listPlans, 'function');
  assert.equal(typeof billingApi.savePlan, 'function');
  assert.equal(typeof billingApi.listStatements, 'function');
  assert.equal(typeof billingApi.getStatement, 'function');
  assert.equal(typeof billingApi.generateStatements, 'function');
  assert.equal(typeof billingApi.issueStatement, 'function');
  assert.equal(typeof billingApi.addAdjustment, 'function');
  assert.equal(typeof billingApi.voidStatement, 'function');
});

test('reportsApi client exports all required platform report endpoints', () => {
  assert.equal(typeof reportsApi.getCrossTenant, 'function');
  assert.equal(typeof reportsApi.getSportsbook, 'function');
  assert.equal(typeof reportsApi.getPartnerBalances, 'function');
});

test('formatMoney helper formats amounts with specified currency without cross-currency summing', () => {
  const { formatMoney } = BillingDashboardMod;
  assert.equal(typeof formatMoney, 'function');
  assert.match(formatMoney(15000.5, 'TRY'), /15\.000,50 TRY/);
  assert.match(formatMoney(250.75, 'EUR'), /250,75 EUR/);
  assert.match(formatMoney(0, 'USD'), /0,00 USD/);
  assert.match(formatMoney(null, 'TRY'), /0\.00 TRY/);
});

test('Statement status and direction mappings are properly exported', () => {
  const { STATEMENT_STATUS_MAP, DIRECTION_MAP } = BillingDashboardMod;
  assert.ok(STATEMENT_STATUS_MAP.draft);
  assert.ok(STATEMENT_STATUS_MAP.issued);
  assert.ok(STATEMENT_STATUS_MAP.settled);
  assert.ok(STATEMENT_STATUS_MAP.voided);
  assert.equal(STATEMENT_STATUS_MAP.draft.label, 'Taslak');
  assert.equal(STATEMENT_STATUS_MAP.issued.label, 'Kesildi');

  assert.ok(DIRECTION_MAP.revenue_share);
  assert.ok(DIRECTION_MAP.wholesale);
});

test('Statement line types and sportsbook models are properly defined', () => {
  const { LINE_TYPE_MAP } = StatementDetailMod;
  assert.ok(LINE_TYPE_MAP.commission);
  assert.ok(LINE_TYPE_MAP.sportsbook_fee);
  assert.ok(LINE_TYPE_MAP.fixed_fee);
  assert.ok(LINE_TYPE_MAP.adjustment);
  assert.ok(LINE_TYPE_MAP.minimum_fee_topup);

  const { SPORTSBOOK_MODEL_OPTIONS, PLATFORM_FEE_MODEL_OPTIONS } = OperatorFeePlansMod;
  assert.ok(Array.isArray(SPORTSBOOK_MODEL_OPTIONS));
  assert.ok(Array.isArray(PLATFORM_FEE_MODEL_OPTIONS));
  const sModels = SPORTSBOOK_MODEL_OPTIONS.map((o) => o.value);
  assert.ok(sModels.includes('none'));
  assert.ok(sModels.includes('fixed'));
  assert.ok(sModels.includes('turnover_percentage'));
  assert.ok(sModels.includes('both'));
});
