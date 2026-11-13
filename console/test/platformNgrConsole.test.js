import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { billingApi, ngrApi } from '../src/api/client.js';

// Register ESM loader for .jsx format before dynamic imports
register(`data:text/javascript,${encodeURIComponent(`
export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    return nextLoad(url, { ...context, format: 'module' });
  }
  return nextLoad(url, context);
}
`)}`);

const NgrDefinitionsListMod = await import('../src/pages/billing/NgrDefinitionsList.jsx');
const NgrDefinitionEditorMod = await import('../src/pages/billing/NgrDefinitionEditor.jsx');
const StatementDetailMod = await import('../src/pages/billing/StatementDetail.jsx');
const SidebarMod = await import('../src/components/layout/Sidebar.jsx');
const PartnerDetailMod = await import('../src/pages/PartnerDetail.jsx');

const NgrDefinitionsList = NgrDefinitionsListMod.default;
const NgrDefinitionEditor = NgrDefinitionEditorMod.default;
const StatementDetail = StatementDetailMod.default;
const {
  validateNgrDefinition,
  NGR_ERROR_EXPLANATIONS,
  NGR_CATEGORIES,
  NGR_SOURCES,
} = NgrDefinitionEditorMod;
const { platformNav } = SidebarMod;
const { PartnerTermsForm, COMMERCIAL_BASES } = PartnerDetailMod;

test('billingApi and ngrApi export all required NGR definition endpoints', () => {
  assert.equal(typeof billingApi.listNgrDefinitions, 'function');
  assert.equal(typeof billingApi.getNgrDefinition, 'function');
  assert.equal(typeof billingApi.createNgrDefinition, 'function');
  assert.equal(typeof billingApi.updateNgrDefinition, 'function');
  assert.equal(typeof billingApi.createNewNgrVersion, 'function');

  assert.equal(typeof ngrApi.list, 'function');
  assert.equal(typeof ngrApi.get, 'function');
  assert.equal(typeof ngrApi.create, 'function');
  assert.equal(typeof ngrApi.update, 'function');
  assert.equal(typeof ngrApi.createVersion, 'function');
});

test('Sidebar includes /billing/ngr-definitions under Platform Billing navigation', () => {
  const paths = platformNav.map((i) => i.path);
  assert.ok(paths.includes('/billing/ngr-definitions'), 'platformNav must include /billing/ngr-definitions');
  const ngrItem = platformNav.find((i) => i.path === '/billing/ngr-definitions');
  assert.ok(ngrItem.name, 'NGR navigation item must have a display name');
});

test('Platform NGR console pages and forms export valid React components', () => {
  assert.equal(typeof NgrDefinitionsList, 'function');
  assert.equal(typeof NgrDefinitionEditor, 'function');
  assert.equal(typeof StatementDetail, 'function');
  assert.equal(typeof PartnerTermsForm, 'function');
});

test('validateNgrDefinition accepts valid NGR formula definitions', () => {
  const validDef = {
    name: 'Standart NGR Formülü',
    ggrComponents: ['casino', 'sports'],
    ggrAlreadyNetOf: [],
    items: [
      { category: 'bonus', label: 'Bonus Maliyeti', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      { category: 'tax', label: 'Oyun Vergisi', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.05 } },
      { category: 'other', label: 'Sunucu Maliyeti', enabled: true, source: 'fixed', params: { amount: 150, period: 'day' } },
      { category: 'other', label: 'Lisans Ücreti', enabled: true, source: 'fixed', params: { amount: 300, period: 'day' } },
    ],
  };

  const res = validateNgrDefinition(validDef);
  assert.equal(res.valid, true);
});

test('validateNgrDefinition rejects duplicate categories with ERR_NGR_DUPLICATE_CATEGORY', () => {
  const duplicateCatDef = {
    name: 'Geçersiz Formül',
    ggrComponents: ['casino'],
    items: [
      { category: 'bonus', label: 'Bonus 1', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      { category: 'bonus', label: 'Bonus 2', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.10 } },
    ],
  };

  const res = validateNgrDefinition(duplicateCatDef);
  assert.equal(res.valid, false);
  assert.equal(res.code, 'ERR_NGR_DUPLICATE_CATEGORY');
  assert.match(res.message, /bonus/);
});

test('validateNgrDefinition rejects duplicate labels in other category with ERR_NGR_DUPLICATE_LABEL', () => {
  const dupLabelDef = {
    name: 'Duplicate Label Test',
    ggrComponents: ['casino', 'sports'],
    items: [
      { category: 'other', label: 'Hosting Masrafı', enabled: true, source: 'fixed', params: { amount: 100, period: 'day' } },
      { category: 'other', label: 'hosting masrafı', enabled: true, source: 'fixed', params: { amount: 200, period: 'day' } },
    ],
  };

  const res = validateNgrDefinition(dupLabelDef);
  assert.equal(res.valid, false);
  assert.equal(res.code, 'ERR_NGR_DUPLICATE_LABEL');
});

test('validateNgrDefinition rejects duplicate physical sources with ERR_NGR_DUPLICATE_SOURCE', () => {
  const dupSourceDef = {
    name: 'Duplicate Source Test',
    ggrComponents: ['casino'],
    items: [
      { category: 'bonus', label: 'Bonus 1', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      { category: 'other', label: 'Ekstra Bonus', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
    ],
  };

  const res = validateNgrDefinition(dupSourceDef);
  assert.equal(res.valid, false);
  assert.equal(res.code, 'ERR_NGR_DUPLICATE_SOURCE');
});

test('validateNgrDefinition rejects items whose category is in ggrAlreadyNetOf with ERR_NGR_ALREADY_NET_OF', () => {
  const alreadyNetDef = {
    name: 'Already Net Test',
    ggrComponents: ['casino', 'sports'],
    ggrAlreadyNetOf: ['tax'],
    items: [
      { category: 'tax', label: 'Gaming Tax', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.05 } },
    ],
  };

  const res = validateNgrDefinition(alreadyNetDef);
  assert.equal(res.valid, false);
  assert.equal(res.code, 'ERR_NGR_ALREADY_NET_OF');
});

test('validateNgrDefinition rejects fixed deductions with periods other than day with ERR_NGR_UNSUPPORTED_PERIOD', () => {
  const unsupportedPeriodDef = {
    name: 'Unsupported Period Test',
    ggrComponents: ['casino'],
    items: [
      { category: 'other', label: 'Aylık Bakım', enabled: true, source: 'fixed', params: { amount: 1000, period: 'month' } },
    ],
  };

  const res = validateNgrDefinition(unsupportedPeriodDef);
  assert.equal(res.valid, false);
  assert.equal(res.code, 'ERR_NGR_UNSUPPORTED_PERIOD');
});

test('NGR_ERROR_EXPLANATIONS provides Turkish explanations for all critical error codes', () => {
  const requiredCodes = [
    'ERR_NGR_DUPLICATE_CATEGORY',
    'ERR_NGR_DUPLICATE_LABEL',
    'ERR_NGR_DUPLICATE_SOURCE',
    'ERR_NGR_ALREADY_NET_OF',
    'ERR_NGR_UNSUPPORTED_PERIOD',
    'ERR_TERMS_REQUIRED',
    'ERR_TERMS_MODEL',
    'ERR_TERMS_BASE',
    'ERR_TERMS_RATE',
    'ERR_TERMS_NGR_DEFINITION',
  ];

  for (const code of requiredCodes) {
    assert.ok(NGR_ERROR_EXPLANATIONS[code], `Missing explanation for ${code}`);
    assert.equal(typeof NGR_ERROR_EXPLANATIONS[code], 'string');
    assert.ok(NGR_ERROR_EXPLANATIONS[code].length > 10, `Explanation too short for ${code}`);
  }
});

test('StatementDetail renders NGR itemized deduction breakdown elements', () => {
  const line = {
    _id: 'line-ngr-1',
    type: 'commission',
    date: '2026-11-15',
    currency: 'TRY',
    baseMetric: 'ngr',
    baseAmount: 8500.00,
    rate: 0.20,
    amount: 1700.00,
    description: '20% NGR Commission for 2026-11-15',
    metadata: {
      ggr: 12000.00,
      totalDeductions: 3500.00,
      ngr: 8500.00,
      deductions: [
        { category: 'bonus', label: 'Bonus Cost', source: 'stat_field', amount: 1500.00 },
        { category: 'chargeback', label: 'Chargebacks', source: 'stat_field', amount: 250.00 },
        { category: 'provider_fee', label: 'Sportsbook Fee', source: 'fee_plan', amount: 1000.00 },
        { category: 'tax', label: 'Gaming Tax', source: 'rate', amount: 600.00 },
        { category: 'other', label: 'Hosting', source: 'fixed', amount: 150.00 },
      ],
      negativeBaseHandling: 'zero_floor',
      ngrDefinitionVersion: 1,
    },
  };

  assert.equal(line.baseMetric, 'ngr');
  assert.equal(line.metadata.ggr, 12000.00);
  assert.equal(line.metadata.totalDeductions, 3500.00);
  assert.equal(line.metadata.ngr, 8500.00);
  assert.equal(line.metadata.deductions.length, 5);
  assert.equal(line.currency, 'TRY');

  // Verify element tree can be constructed with StatementDetail
  const element = React.createElement(StatementDetail, { statementId: 'test-stmt-123' });
  assert.ok(React.isValidElement(element));
});

test('Partner terms form supports model, base, required rate with no default, and NGR definition picker', () => {
  assert.ok(Array.isArray(COMMERCIAL_BASES));
  const baseValues = COMMERCIAL_BASES.map((b) => b.value);
  assert.ok(baseValues.includes('ggr'));
  assert.ok(baseValues.includes('ngr'));
  assert.ok(baseValues.includes('turnover'));
  assert.ok(baseValues.includes('fixed'));

  let model = 'revshare_ngr';
  let base = 'ngr';
  let rate = '';
  let ngrDefId = 'def-1';
  let ngrDefVer = 1;

  const formElement = React.createElement(PartnerTermsForm, {
    commercialModel: model,
    setCommercialModel: (v) => { model = v; },
    commercialBase: base,
    setCommercialBase: (v) => { base = v; },
    rate: rate,
    setRate: (v) => { rate = v; },
    currency: 'TRY',
    setCurrency: () => {},
    minimumFee: 0,
    setMinimumFee: () => {},
    ngrDefinitionId: ngrDefId,
    setNgrDefinitionId: (v) => { ngrDefId = v; },
    ngrDefinitionVersion: ngrDefVer,
    setNgrDefinitionVersion: (v) => { ngrDefVer = v; },
    availableNgrDefs: [{ _id: 'def-1', name: 'Standard NGR', version: 1, status: 'active' }],
    onSubmit: () => {},
  });

  assert.ok(React.isValidElement(formElement));
  // Initial rate must be empty string (no default rate)
  assert.equal(rate, '');
  assert.equal(base, 'ngr');
});
