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

const PartnerStatementDetailModule = await import('../src/pages/partner/PartnerStatementDetail.jsx');
const PartnerStatementDetail = PartnerStatementDetailModule.default;
const {
  STATEMENT_LINE_TYPES,
  DEDUCTION_CATEGORY_LABELS,
  renderNgrDeductionBreakdown,
} = PartnerStatementDetailModule;

function extractText(element) {
  if (element == null || typeof element === 'boolean') return '';
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(extractText).join(' ');
  if (element.props && element.props.children) {
    return extractText(element.props.children);
  }
  return '';
}

test('PartnerStatementDetail exports valid component and Turkish deduction labels', () => {
  assert.equal(typeof PartnerStatementDetail, 'function');
  assert.equal(typeof renderNgrDeductionBreakdown, 'function');

  assert.ok(DEDUCTION_CATEGORY_LABELS);
  assert.equal(DEDUCTION_CATEGORY_LABELS.bonus, 'Bonus Maliyeti');
  assert.equal(DEDUCTION_CATEGORY_LABELS.provider_fee, 'Sağlayıcı / Altyapı Ücreti');
  assert.equal(DEDUCTION_CATEGORY_LABELS.tax, 'Vergi');
  assert.equal(DEDUCTION_CATEGORY_LABELS.chargeback, 'Ters İbraz / İade');
  assert.equal(DEDUCTION_CATEGORY_LABELS.other, 'Diğer Kesinti');

  assert.ok(STATEMENT_LINE_TYPES.commission);
  assert.ok(STATEMENT_LINE_TYPES.commission_ngr);
  assert.equal(STATEMENT_LINE_TYPES.commission_ngr.label, 'Komisyon (NGR)');
});

test('renderNgrDeductionBreakdown renders full itemized breakdown matching K28 worked example', () => {
  const line = {
    _id: 'line-ngr-k28',
    tenantId: { key: 'op-alpha', name: 'Operator Alpha' },
    type: 'commission',
    date: '2026-11-15',
    currency: 'TRY',
    baseMetric: 'ngr',
    baseAmount: 8500,
    rate: 0.20,
    amount: 1700,
    description: '20% NGR Commission for 2026-11-15',
    metadata: {
      ggr: 12000,
      totalDeductions: 3500,
      ngr: 8500,
      deductions: [
        { category: 'bonus', label: 'Bonus Cost', source: 'stat_field', amount: 1500 },
        { category: 'chargeback', label: 'Chargebacks', source: 'stat_field', amount: 250 },
        { category: 'provider_fee', label: 'Sportsbook Fee', source: 'fee_plan', amount: 1000 },
        { category: 'tax', label: 'Gaming Tax', source: 'rate', amount: 600 },
        { category: 'other', label: 'Hosting Cost', source: 'fixed', amount: 150 },
      ],
      negativeBaseHandling: 'zero_floor',
      ngrDefinitionVersion: 2,
    },
  };

  const vdom = renderNgrDeductionBreakdown(line, 'TRY', true);
  assert.ok(vdom, 'renderNgrDeductionBreakdown should return a valid VDOM element');
  assert.equal(vdom.props['data-testid'], 'ngr-deduction-breakdown-row');

  const text = extractText(vdom);

  // Verification of Turkish headings and summary metrics
  assert.ok(text.includes('NGR Kesinti Dökümü'));
  assert.ok(text.includes('v2'));
  assert.ok(text.includes('Sıfır Taban (Zero Floor)'));
  assert.ok(text.includes('Brüt GGR'));
  assert.ok(text.includes('12.000,00 TRY') || text.includes('12000'));
  assert.ok(text.includes('Toplam Kesinti'));
  assert.ok(text.includes('3.500,00 TRY') || text.includes('3500'));
  assert.ok(text.includes('Net NGR Matrahı'));
  assert.ok(text.includes('8.500,00 TRY') || text.includes('8500'));
  assert.ok(text.includes('Komisyon Oranı'));
  assert.ok(text.includes('20.0%'));
  assert.ok(text.includes('Hesaplanan Hakediş'));
  assert.ok(text.includes('1.700,00 TRY') || text.includes('1700'));

  // Verification of deduction item categories, labels, and sources
  assert.ok(text.includes('Bonus Maliyeti'));
  assert.ok(text.includes('Bonus Cost'));
  assert.ok(text.includes('stat_field'));
  assert.ok(text.includes('1.500,00 TRY') || text.includes('1500'));

  assert.ok(text.includes('Ters İbraz / İade'));
  assert.ok(text.includes('Chargebacks'));
  assert.ok(text.includes('250,00 TRY') || text.includes('250'));

  assert.ok(text.includes('Sağlayıcı / Altyapı Ücreti'));
  assert.ok(text.includes('Sportsbook Fee'));
  assert.ok(text.includes('fee_plan'));
  assert.ok(text.includes('1.000,00 TRY') || text.includes('1000'));

  assert.ok(text.includes('Vergi'));
  assert.ok(text.includes('Gaming Tax'));
  assert.ok(text.includes('rate'));
  assert.ok(text.includes('600,00 TRY') || text.includes('600'));

  assert.ok(text.includes('Diğer Kesinti'));
  assert.ok(text.includes('Hosting Cost'));
  assert.ok(text.includes('fixed'));
  assert.ok(text.includes('150,00 TRY') || text.includes('150'));
});

test('renderNgrDeductionBreakdown returns null when collapsed', () => {
  const line = {
    _id: 'line-collapsed',
    baseMetric: 'ngr',
    baseAmount: 5000,
    amount: 1000,
    metadata: {
      ggr: 6000,
      totalDeductions: 1000,
      deductions: [{ category: 'bonus', label: 'Bonus', amount: 1000 }],
    },
  };

  const vdom = renderNgrDeductionBreakdown(line, 'TRY', false);
  assert.equal(vdom, null);
});

test('renderNgrDeductionBreakdown respects monocurrency display and does not mix currencies', () => {
  const eurLine = {
    _id: 'line-eur',
    type: 'commission',
    date: '2026-11-15',
    currency: 'EUR',
    baseMetric: 'ngr',
    baseAmount: 4000,
    rate: 0.25,
    amount: 1000,
    metadata: {
      ggr: 5000,
      totalDeductions: 1000,
      deductions: [
        { category: 'bonus', label: 'EUR Bonus', source: 'stat_field', amount: 1000 },
      ],
      negativeBaseHandling: 'deduct',
    },
  };

  const vdom = renderNgrDeductionBreakdown(eurLine, 'EUR', true);
  const text = extractText(vdom);

  assert.ok(text.includes('EUR'));
  assert.equal(text.includes('TRY'), false, 'EUR line must not include TRY');
  assert.equal(text.includes('USD'), false, 'EUR line must not include USD');
  assert.ok(text.includes('Mahsup Et (Deduct)'));
});

test('renderNgrDeductionBreakdown handles empty deductions gracefully', () => {
  const line = {
    _id: 'line-no-deductions',
    type: 'commission',
    currency: 'TRY',
    baseMetric: 'ngr',
    baseAmount: 10000,
    rate: 0.10,
    amount: 1000,
    metadata: {
      ggr: 10000,
      totalDeductions: 0,
      deductions: [],
    },
  };

  const vdom = renderNgrDeductionBreakdown(line, 'TRY', true);
  assert.ok(vdom);
  const text = extractText(vdom);
  assert.ok(text.includes('10.000,00 TRY') || text.includes('10000'));
});
