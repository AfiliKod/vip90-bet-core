import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import TenantDailyStat from '../src/models/TenantDailyStat.js';
import OperatorFeePlan from '../src/models/OperatorFeePlan.js';
import { getSportsbookOddsReport } from '../src/platform/services/platformReportsService.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t5_temporal';

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Promise.all([TenantDailyStat.createIndexes(), OperatorFeePlan.createIndexes()]);
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('each day uses the fee plan valid on that day; the fixed fee uses the plan at period end', async () => {
  const createdBy = new mongoose.Types.ObjectId();
  const tenant = await Tenant.create({ key: 'temporal-op', name: 'Temporal' });
  // 1% until Nov 15, then 2% plus a fixed fee.
  await OperatorFeePlan.create({
    tenantId: tenant._id, validFrom: new Date('2026-11-01T00:00:00Z'), validTo: new Date('2026-11-15T00:00:00Z'),
    sportsbookFee: { model: 'turnover_percentage', turnoverRate: 0.01, fixedMonthlyFee: 0, currency: 'TRY' }, createdBy,
  });
  await OperatorFeePlan.create({
    tenantId: tenant._id, validFrom: new Date('2026-11-15T00:00:00Z'), validTo: null,
    sportsbookFee: { model: 'both', turnoverRate: 0.02, fixedMonthlyFee: 500, currency: 'TRY' }, createdBy,
  });
  await TenantDailyStat.create([
    { tenantId: tenant._id, date: '2026-11-10', currency: 'TRY', sportsTurnover: 1000, sportsGgrRealized: 100 },
    { tenantId: tenant._id, date: '2026-11-20', currency: 'TRY', sportsTurnover: 1000, sportsGgrRealized: 100 },
  ]);

  const { report } = await getSportsbookOddsReport({ from: '2026-11-01', to: '2026-11-30', currency: 'TRY' });
  const row = report.find((r) => r.tenantId === String(tenant._id));
  assert.equal(row.turnoverFee, 30); // 1000 × 1% + 1000 × 2%
  assert.equal(row.fixedFee, 500);
  assert.equal(row.totalFee, 530);
});
