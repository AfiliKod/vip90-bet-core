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

const { partnerNav } = await import('../src/components/layout/Sidebar.jsx');
const PartnerStatementsListModule = await import('../src/pages/partner/PartnerStatementsList.jsx');
const PartnerStatementDetailModule = await import('../src/pages/partner/PartnerStatementDetail.jsx');

const PartnerStatementsList = PartnerStatementsListModule.default;
const PartnerStatementDetail = PartnerStatementDetailModule.default;
const { STATEMENT_STATUS_LABELS, STATEMENT_DIRECTION_LABELS, formatMoney } = PartnerStatementsListModule;
const { STATEMENT_LINE_TYPES } = PartnerStatementDetailModule;

test('Sidebar includes Komisyon ve Faturalar in partnerNav', () => {
  const paths = partnerNav.map((i) => i.path);
  assert.ok(paths.includes('/partner/statements'), 'Partner nav must have /partner/statements');
  const item = partnerNav.find((i) => i.path === '/partner/statements');
  assert.equal(item.name, 'Komisyon & Faturalar');
});

test('Partner billing pages are valid React elements', () => {
  assert.equal(typeof PartnerStatementsList, 'function');
  assert.equal(typeof PartnerStatementDetail, 'function');
});

test('PartnerStatementsList exports status labels and direction labels in Turkish', () => {
  assert.ok(STATEMENT_STATUS_LABELS.issued);
  assert.equal(STATEMENT_STATUS_LABELS.issued.text, 'Yayınlandı');
  assert.equal(STATEMENT_STATUS_LABELS.settled.text, 'Ödendi');

  assert.ok(STATEMENT_DIRECTION_LABELS.revenue_share);
  assert.ok(STATEMENT_DIRECTION_LABELS.wholesale);
});

test('PartnerStatementDetail exports standard line types in Turkish', () => {
  assert.ok(STATEMENT_LINE_TYPES.commission);
  assert.ok(STATEMENT_LINE_TYPES.adjustment);
  assert.equal(STATEMENT_LINE_TYPES.commission.label, 'Komisyon (GGR)');
  assert.equal(STATEMENT_LINE_TYPES.adjustment.label, 'Düzeltme');
});

test('formatMoney formats amounts with currency without cross-currency contamination', () => {
  const formattedTRY = formatMoney(12500.5, 'TRY');
  assert.ok(formattedTRY.includes('12.500,50') || formattedTRY.includes('12500,50'));
  assert.ok(formattedTRY.endsWith('TRY'));

  const formattedEUR = formatMoney(0, 'EUR');
  assert.ok(formattedEUR.includes('0,00'));
  assert.ok(formattedEUR.endsWith('EUR'));
});
