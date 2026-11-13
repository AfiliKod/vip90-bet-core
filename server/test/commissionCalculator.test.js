import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCommissionForPeriod,
  roundMoney,
  toMinorUnits,
  fromMinorUnits,
  multiplyMinorUnitsByRate,
} from '../src/platform/services/commissionCalculator.js';

test('roundMoney rounds half-up accurately to 2 decimals', () => {
  assert.equal(roundMoney(10.005), 10.01);
  assert.equal(roundMoney(10.004), 10.00);
  assert.equal(roundMoney(0.1 + 0.2), 0.30);
  assert.equal(roundMoney(-5.555), -5.55);
});

test('roundMoney avoids raw float Math.round(x * 100) / 100 bugs for tricky edge cases', () => {
  // Tricky floating-point representations where Math.round(x * 100) / 100 truncates erroneously
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(35.855), 35.86);
  assert.equal(roundMoney(1.0049999999), 1.00);
});

test('calculateCommissionForPeriod calculates revshare_ggr correctly for a single operator', () => {
  const partner = { _id: 'P1', defaultCommercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' } };
  const links = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01T00:00:00.000Z'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
  }];
  const stats = [
    { tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 2000, casinoTurnover: 50000, sportsTurnover: 10000 },
    { tenantId: 'T1', date: '2026-11-02', currency: 'TRY', casinoGgr: 8000, sportsGgrRealized: 1000, casinoTurnover: 40000, sportsTurnover: 8000 },
  ];

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans: [] });
  assert.ok(result.TRY);
  assert.equal(result.TRY.grossAmount, 3150.00); // Day 1: 12000 * 0.15 = 1800; Day 2: 9000 * 0.15 = 1350
  assert.equal(result.TRY.lines.length, 2);
  assert.equal(result.TRY.lines[0].amount, 1800.00);
  assert.equal(result.TRY.lines[1].amount, 1350.00);
});

test('calculateCommissionForPeriod handles mid-period link rate change', () => {
  const partner = { _id: 'P1' };
  const links = [
    {
      partnerId: 'P1',
      tenantId: 'T1',
      validFrom: new Date('2026-11-01T00:00:00.000Z'),
      validTo: new Date('2026-11-15T00:00:00.000Z'),
      commercialTerms: { model: 'revshare_ggr', rate: 0.10, currency: 'TRY' },
    },
    {
      partnerId: 'P1',
      tenantId: 'T1',
      validFrom: new Date('2026-11-15T00:00:00.000Z'),
      validTo: null,
      commercialTerms: { model: 'revshare_ggr', rate: 0.20, currency: 'TRY' },
    },
  ];

  const stats = [
    { tenantId: 'T1', date: '2026-11-10', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 0 },
    { tenantId: 'T1', date: '2026-11-20', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 0 },
  ];

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans: [] });
  assert.equal(result.TRY.lines[0].rate, 0.10);
  assert.equal(result.TRY.lines[0].amount, 1000.00);
  assert.equal(result.TRY.lines[1].rate, 0.20);
  assert.equal(result.TRY.lines[1].amount, 2000.00);
  assert.equal(result.TRY.grossAmount, 3000.00);
});

test('calculateCommissionForPeriod isolates currencies strictly', () => {
  const partner = { _id: 'P1' };
  const links = [
    { partnerId: 'P1', tenantId: 'T1', validFrom: new Date('2026-11-01'), validTo: null, commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' } },
    { partnerId: 'P1', tenantId: 'T2', validFrom: new Date('2026-11-01'), validTo: null, commercialTerms: { model: 'revshare_ggr', rate: 0.10, currency: 'EUR' } },
  ];
  const stats = [
    { tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 0 },
    { tenantId: 'T2', date: '2026-11-01', currency: 'EUR', casinoGgr: 5000, sportsGgrRealized: 0 },
  ];

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans: [] });
  assert.ok(result.TRY);
  assert.ok(result.EUR);
  assert.equal(result.TRY.grossAmount, 1500.00);
  assert.equal(result.EUR.grossAmount, 500.00);
});

test('calculateCommissionForPeriod computes revshare_ngr matching exact worked numeric example', () => {
  const partner = { _id: 'P1' };
  const ngrDef = {
    _id: 'ND1',
    name: 'Full Deduction NGR',
    version: 1,
    ggrComponents: ['casino', 'sports'],
    ggrAlreadyNetOf: [],
    items: [
      { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      { category: 'chargeback', label: 'Payment Chargebacks', enabled: true, source: 'stat_field', params: { field: 'chargebacks' } },
      { category: 'provider_fee', label: 'Sportsbook Odds Feed Fee', enabled: true, source: 'fee_plan', params: { component: 'sportsbookFee' } },
      { category: 'tax', label: 'Gaming Tax (5% GGR)', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.05 } },
      { category: 'other', label: 'Hosting Recovery', enabled: true, source: 'fixed', params: { amount: 150 } },
    ],
  };
  const links = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: {
      model: 'revshare_ngr',
      base: 'ngr',
      rate: 0.20,
      currency: 'TRY',
      ngrDefinitionId: 'ND1',
      ngrDefinitionVersion: 1,
      negativeBaseHandling: 'zero_floor',
    },
  }];
  const feePlans = [{
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    sportsbookFee: { model: 'turnover_percentage', turnoverRate: 0.02, currency: 'TRY' },
  }];
  const stats = [{
    tenantId: 'T1',
    date: '2026-11-15',
    currency: 'TRY',
    casinoGgr: 10000,
    sportsGgrRealized: 2000,
    sportsTurnover: 50000,
    bonusCost: 1500,
    chargebacks: 250,
  }];

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans, ngrDefinitions: [ngrDef] });

  assert.ok(result.TRY);
  assert.equal(result.TRY.grossAmount, 1700.00);
  assert.equal(result.TRY.lines.length, 1);

  const line = result.TRY.lines[0];
  assert.equal(line.type, 'commission');
  assert.equal(line.baseMetric, 'ngr');
  assert.equal(line.baseAmount, 8500.00);
  assert.equal(line.rate, 0.20);
  assert.equal(line.amount, 1700.00);

  const meta = line.metadata;
  assert.equal(meta.ggr, 12000.00);
  assert.equal(meta.totalDeductions, 3500.00);
  assert.equal(meta.ngr, 8500.00);
  assert.equal(meta.deductions.length, 5);
  assert.equal(meta.deductions.find((deduction) => deduction.category === 'bonus').amount, 1500.00);
  assert.equal(meta.deductions.find((deduction) => deduction.category === 'chargeback').amount, 250.00);
  assert.equal(meta.deductions.find((deduction) => deduction.category === 'provider_fee').amount, 1000.00);
  assert.equal(meta.deductions.find((deduction) => deduction.category === 'tax').amount, 600.00);
  assert.equal(meta.deductions.find((deduction) => deduction.category === 'other').amount, 150.00);
});

test('calculateCommissionForPeriod runtime guard rejects duplicate deduction category and source', () => {
  const partner = { _id: 'P1' };
  const links = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ngr', base: 'ngr', rate: 0.15, currency: 'TRY', ngrDefinitionId: 'ND_BAD' },
  }];
  const stats = [{ tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: 1000, bonusCost: 100 }];

  const duplicateCategory = {
    _id: 'ND_BAD',
    version: 1,
    ggrComponents: ['casino'],
    items: [
      { category: 'bonus', label: 'Bonus 1', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      { category: 'bonus', label: 'Bonus 2', enabled: true, source: 'rate', params: { target: 'ggr', rate: 0.05 } },
    ],
  };
  assert.throws(
    () => calculateCommissionForPeriod({ partner, links, stats, feePlans: [], ngrDefinitions: [duplicateCategory] }),
    (err) => err.code === 'ERR_NGR_DOUBLE_DEDUCTION'
  );

  const duplicateSource = {
    _id: 'ND_BAD',
    version: 1,
    ggrComponents: ['casino'],
    items: [
      { category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
      { category: 'other', label: 'Bonus Adjustment', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } },
    ],
  };
  assert.throws(
    () => calculateCommissionForPeriod({ partner, links, stats, feePlans: [], ngrDefinitions: [duplicateSource] }),
    (err) => err.code === 'ERR_NGR_DOUBLE_DEDUCTION'
  );
});

test('calculateCommissionForPeriod deducts fixed per_chargeback fees by that day\'s chargeback count', () => {
  const ngrDefinition = {
    _id: 'ND_CHARGEBACK_FEE', version: 1, ggrComponents: ['casino'], items: [
      { category: 'other', label: 'PSP chargeback handling fee', enabled: true, source: 'fixed', params: { amount: 15, period: 'per_chargeback' } },
    ],
  };
  const result = calculateCommissionForPeriod({
    partner: { _id: 'P1' },
    links: [{ tenantId: 'T1', validFrom: new Date('2026-11-01'), commercialTerms: { model: 'revshare_ngr', base: 'ngr', rate: 1, currency: 'TRY', ngrDefinitionId: 'ND_CHARGEBACK_FEE' } }],
    stats: [{ tenantId: 'T1', date: '2026-11-15', currency: 'TRY', casinoGgr: 100, chargebackCount: 3 }],
    ngrDefinitions: [ngrDefinition],
  });
  assert.equal(result.TRY.lines[0].baseAmount, 55);
  assert.equal(result.TRY.lines[0].metadata.deductions[0].amount, 45);
});

test('calculateCommissionForPeriod handles negative NGR with zero_floor and deduct strategies', () => {
  const partner = { _id: 'P1' };
  const ngrDef = {
    _id: 'ND1',
    name: 'Standard NGR',
    version: 1,
    ggrComponents: ['casino'],
    items: [{ category: 'bonus', label: 'Bonus Cost', enabled: true, source: 'stat_field', params: { field: 'bonusCost' } }],
  };
  const stats = [{ tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: 1000, bonusCost: 1500 }];
  const linksFloor = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ngr', base: 'ngr', rate: 0.20, currency: 'TRY', ngrDefinitionId: 'ND1', negativeBaseHandling: 'zero_floor' },
  }];

  const resFloor = calculateCommissionForPeriod({ partner, links: linksFloor, stats, feePlans: [], ngrDefinitions: [ngrDef] });
  assert.equal(resFloor.TRY.lines[0].baseAmount, -500.00);
  assert.equal(resFloor.TRY.lines[0].amount, 0.00);

  const linksDeduct = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ngr', base: 'ngr', rate: 0.20, currency: 'TRY', ngrDefinitionId: 'ND1', negativeBaseHandling: 'deduct' },
  }];
  const resDeduct = calculateCommissionForPeriod({ partner, links: linksDeduct, stats, feePlans: [], ngrDefinitions: [ngrDef] });
  assert.equal(resDeduct.TRY.lines[0].baseAmount, -500.00);
  assert.equal(resDeduct.TRY.lines[0].amount, -100.00);
});

test('calculateCommissionForPeriod handles negative GGR with zero_floor and deduct strategies', () => {
  const partner = { _id: 'P1' };
  const linksZeroFloor = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY', negativeGgrHandling: 'zero_floor' },
  }];
  const stats = [{ tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: -5000, sportsGgrRealized: 0 }];

  const resFloor = calculateCommissionForPeriod({ partner, links: linksZeroFloor, stats, feePlans: [] });
  assert.equal(resFloor.TRY.lines[0].amount, 0.00);

  const linksDeduct = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY', negativeGgrHandling: 'deduct' },
  }];
  const resDeduct = calculateCommissionForPeriod({ partner, links: linksDeduct, stats, feePlans: [] });
  assert.equal(resDeduct.TRY.lines[0].amount, -750.00);
});

test('calculateCommissionForPeriod computes K20 sportsbook odds feed fees', () => {
  const partner = { _id: 'P1' };
  const links = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
  }];
  const feePlans = [{
    tenantId: 'T1',
    validFrom: new Date('2026-11-01'),
    validTo: null,
    sportsbookFee: { model: 'both', fixedMonthlyFee: 1000, turnoverRate: 0.02, currency: 'TRY' },
  }];
  const stats = [
    { tenantId: 'T1', date: '2026-11-01', currency: 'TRY', casinoGgr: 10000, sportsGgrRealized: 2000, sportsTurnover: 50000 },
  ];

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans });
  const lines = result.TRY.lines;
  const sportsLine = lines.find((l) => l.type === 'sportsbook_fee');
  assert.ok(sportsLine);
  assert.equal(sportsLine.amount, 1000.00); // 50000 * 0.02 = 1000 turnover fee
});

test('calculateCommissionForPeriod avoids floating-point drift on long sums of small amounts', () => {
  // Reviewer correction #10:
  // 10,000 days with small amount (0.47 TRY GGR at 15% rate).
  // 0.47 TRY = 47 cents. 47 * 0.15 = 7.05 cents -> rounded half away from zero = 7 cents (0.07 TRY).
  // In raw float arithmetic, adding 0.07 ten thousand times drifts to 700.000000000091.
  // Integer minor unit calculation maintains exactness: 70000 cents = 700.00 TRY.
  const partner = { _id: 'P1' };
  const links = [{
    partnerId: 'P1',
    tenantId: 'T1',
    validFrom: new Date('2020-01-01'),
    validTo: null,
    commercialTerms: { model: 'revshare_ggr', rate: 0.15, currency: 'TRY' },
  }];

  const count = 10000;
  const stats = new Array(count);
  for (let i = 0; i < count; i++) {
    stats[i] = {
      tenantId: 'T1',
      date: '2026-11-01',
      currency: 'TRY',
      casinoGgr: 0.47,
      sportsGgrRealized: 0,
    };
  }

  const result = calculateCommissionForPeriod({ partner, links, stats, feePlans: [] });
  assert.equal(result.TRY.lines.length, count);
  assert.equal(result.TRY.lines[0].amount, 0.07);
  // Verify grossAmount and netAmount have zero floating point drift
  assert.equal(result.TRY.grossAmount, 700.00);
  assert.equal(result.TRY.netAmount, 700.00);
});

test('statement line rounding performs half away from zero exactly once per line', () => {
  // Half away from zero: +0.5 -> +1, -0.5 -> -1
  // 10 cents * 0.15 = 1.5 cents -> 2 cents (0.02 TRY)
  assert.equal(multiplyMinorUnitsByRate(10, 0.15), 2);
  assert.equal(fromMinorUnits(multiplyMinorUnitsByRate(10, 0.15)), 0.02);

  // -10 cents * 0.15 = -1.5 cents -> -2 cents (-0.02 TRY)
  assert.equal(multiplyMinorUnitsByRate(-10, 0.15), -2);
  assert.equal(fromMinorUnits(multiplyMinorUnitsByRate(-10, 0.15)), -0.02);

  // 10 cents * 0.14 = 1.4 cents -> 1 cent (0.01 TRY)
  assert.equal(multiplyMinorUnitsByRate(10, 0.14), 1);
  assert.equal(fromMinorUnits(multiplyMinorUnitsByRate(10, 0.14)), 0.01);

  // -10 cents * 0.14 = -1.4 cents -> -1 cent (-0.01 TRY)
  assert.equal(multiplyMinorUnitsByRate(-10, 0.14), -1);
  assert.equal(fromMinorUnits(multiplyMinorUnitsByRate(-10, 0.14)), -0.01);
});
