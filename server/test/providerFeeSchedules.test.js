import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Transaction from '../src/models/Transaction.js';
import CasinoRound from '../src/models/CasinoRound.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import ProviderFeeSchedule from '../src/models/ProviderFeeSchedule.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { aggregateTenantDailyStat } from '../src/services/tenantDailyStat.js';
import { findNgrRuleViolation } from '../src/platform/services/ngrRules.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/core_ip9f_provider_fee_schedules';
const tenantId = new mongoose.Types.ObjectId();
const staffId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const savedMode = process.env.TENANCY_MODE;

async function casinoRound(provider, day, bet, payout = 0) {
  return runWithTenant(tenantId, () => CasinoRound.create({
    userId,
    gameId: `${provider}-game`,
    provider,
    bet,
    payout,
    net: payout - bet,
    balanceBefore: 1_000,
    balanceAfter: 1_000 - bet + payout,
    currency: 'TRY',
    createdAt: new Date(`${day}T12:00:00.000Z`),
  }));
}

before(async () => {
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.createIndexes(),
    Transaction.createIndexes(),
    CasinoRound.createIndexes(),
    TenantDailyStat.createIndexes(),
    ProviderFeeSchedule.createIndexes(),
  ]);
  await runWithTenant(tenantId, () => User.create({
    _id: userId, username: 'provider_fee_player', email: 'provider-fee@example.com', password: 'test-password',
  }));

  await ProviderFeeSchedule.create([
    { tenantId: null, provider: 'igames', rateOfGgr: 0.10, currency: 'TRY', validFrom: new Date('2026-11-01T00:00:00.000Z'), validTo: new Date('2026-11-15T00:00:00.000Z'), createdBy: staffId },
    { tenantId: null, provider: 'igames', rateOfGgr: 0.20, currency: 'TRY', validFrom: new Date('2026-11-15T00:00:00.000Z'), createdBy: staffId },
    { tenantId: null, provider: 'inhouse', rateOfGgr: 0.05, currency: 'TRY', validFrom: new Date('2026-11-01T00:00:00.000Z'), createdBy: staffId },
    { tenantId, provider: 'inhouse', rateOfGgr: 0.08, currency: 'TRY', validFrom: new Date('2026-11-01T00:00:00.000Z'), createdBy: staffId },
  ]);
});

after(async () => {
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('ProviderFeeSchedule permits only one open schedule per tenant/provider scope', async () => {
  await ProviderFeeSchedule.create({
    tenantId: null, provider: 'unique-provider', rateOfGgr: 0.1, currency: 'TRY', validFrom: new Date('2026-11-01T00:00:00.000Z'), createdBy: staffId,
  });
  await assert.rejects(() => ProviderFeeSchedule.create({
    tenantId: null, provider: 'unique-provider', rateOfGgr: 0.2, currency: 'TRY', validFrom: new Date('2026-11-02T00:00:00.000Z'), createdBy: staffId,
  }), /E11000/);
});

test('daily provider fees use one rounded minor-unit line per provider and apply rate amendments', async () => {
  await casinoRound('igames', '2026-11-14', 101.01);
  await casinoRound('inhouse', '2026-11-14', 100);
  await casinoRound('igames', '2026-11-15', 100);
  await casinoRound('inhouse', '2026-11-15', 100);

  const beforeAmendment = await aggregateTenantDailyStat(tenantId, '2026-11-14', { currency: 'TRY' });
  assert.equal(beforeAmendment.providerFees, 18.1);
  assert.equal(beforeAmendment.providerFeesByProvider.get('igames'), 10.1);
  assert.equal(beforeAmendment.providerFeesByProvider.get('inhouse'), 8);

  const afterAmendment = await aggregateTenantDailyStat(tenantId, '2026-11-15', { currency: 'TRY' });
  assert.equal(afterAmendment.providerFees, 28);
  assert.equal(afterAmendment.providerFeesByProvider.get('igames'), 20);
  // The tenant contract overrides the platform default rate for this provider.
  assert.equal(afterAmendment.providerFeesByProvider.get('inhouse'), 8);
});

test('negative provider GGR has no fee and refunds or chargebacks do not change provider fees', async () => {
  const day = '2026-11-16';
  await casinoRound('igames', day, 100, 150);
  await casinoRound('inhouse', day, 100);
  for (const [type, amount] of [['chargeback', -50], ['refund', -40], ['reversal', -30]]) {
    await runWithTenant(tenantId, () => Transaction.create({
      userId, type, amount, balanceBefore: 100, balanceAfter: 100 + amount,
      status: 'completed', currency: 'TRY', createdAt: new Date(`${day}T10:00:00.000Z`),
    }));
  }

  const stat = await aggregateTenantDailyStat(tenantId, day, { currency: 'TRY' });
  assert.equal(stat.providerFeesByProvider.get('igames'), 0);
  assert.equal(stat.providerFeesByProvider.get('inhouse'), 8);
  assert.equal(stat.providerFees, 8);
  assert.equal(stat.chargebacks, 50);
  assert.equal(stat.chargebackCount, 1);
});

test('NGR: provider fees and the sportsbook feed fee are two costs; each category is used once', () => {
  // Either one alone may use provider_fee (existing İP-9d definitions stay valid).
  assert.equal(findNgrRuleViolation({ items: [
    { category: 'provider_fee', label: 'Casino sağlayıcı sözleşmesi', enabled: true, source: 'stat_field', params: { field: 'providerFees' } },
  ] }), null);
  assert.equal(findNgrRuleViolation({ items: [
    { category: 'provider_fee', label: 'Spor beslemesi', enabled: true, source: 'fee_plan', params: { component: 'sportsbookFee' } },
  ] }), null);
  // Both under provider_fee is refused; the second goes to a labelled 'other'.
  assert.equal(findNgrRuleViolation({ items: [
    { category: 'provider_fee', label: 'Casino sağlayıcı sözleşmesi', enabled: true, source: 'stat_field', params: { field: 'providerFees' } },
    { category: 'provider_fee', label: 'Spor beslemesi', enabled: true, source: 'fee_plan', params: { component: 'sportsbookFee' } },
  ] })?.code, 'ERR_NGR_DUPLICATE_CATEGORY');
  assert.equal(findNgrRuleViolation({ items: [
    { category: 'provider_fee', label: 'Casino sağlayıcı sözleşmesi', enabled: true, source: 'stat_field', params: { field: 'providerFees' } },
    { category: 'other', label: 'Spor beslemesi', enabled: true, source: 'fee_plan', params: { component: 'sportsbookFee' } },
  ] }), null);
});
