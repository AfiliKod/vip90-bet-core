import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Transaction from '../src/models/Transaction.js';
import Bet from '../src/models/Bet.js';
import CasinoRound from '../src/models/CasinoRound.js';
import CasinoSession from '../src/models/CasinoSession.js';
import InhousePlaySession from '../src/models/InhousePlaySession.js';
import BankDepositRequest from '../src/models/BankDepositRequest.js';
import CryptoDeposit from '../src/models/CryptoDeposit.js';
import SlikairPayment from '../src/models/SlikairPayment.js';
import SlikairPayout from '../src/models/SlikairPayout.js';
import InhouseCallbackReceipt from '../src/models/InhouseCallbackReceipt.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { isTenantCollection } from '../src/tenancy/tenantScoped.js';
import { listTenantIndexes } from '../src/tenancy/indexRegistry.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t2';
const T1 = new mongoose.Types.ObjectId();
const originalEnforcement = process.env.TENANCY_ENFORCEMENT;

const models = {
  Transaction,
  Bet,
  CasinoRound,
  CasinoSession,
  InhousePlaySession,
  BankDepositRequest,
  CryptoDeposit,
  SlikairPayment,
  SlikairPayout,
  InhouseCallbackReceipt,
};

const expectedIndexes = [
  ['Transaction', 'tenant_userId_createdAt'],
  ['Transaction', 'tenant_userId_type_createdAt'],
  ['Transaction', 'tenant_type_status_createdAt'],
  ['Transaction', 'tenant_createdAt'],
  ['Transaction', 'tenant_currency_createdAt'],
  ['Bet', 'tenant_userId_createdAt'],
  ['Bet', 'tenant_userId_status_createdAt'],
  ['Bet', 'tenant_status'],
  ['Bet', 'tenant_createdAt'],
  ['Bet', 'tenant_selections_eventId'],
  ['CasinoRound', 'tenant_userId_createdAt'],
  ['CasinoRound', 'tenant_gameId_createdAt'],
  ['CasinoRound', 'tenant_createdAt'],
  ['CasinoRound', 'tenant_palaceUserCode'],
  ['CasinoSession', 'tenant_userId_status'],
  ['CasinoSession', 'tenant_palaceUserCode'],
  ['CasinoSession', 'tenant_status_transferredAt'],
  ['InhousePlaySession', 'tenant_userId_status_startedAt'],
  ['InhousePlaySession', 'tenant_createdAt'],
  ['BankDepositRequest', 'tenant_userId_createdAt'],
  ['BankDepositRequest', 'tenant_status_createdAt'],
  ['CryptoDeposit', 'tenant_userId_createdAt'],
  ['CryptoDeposit', 'tenant_toAddress_status'],
  ['CryptoDeposit', 'tenant_status'],
  ['SlikairPayment', 'tenant_userId_createdAt'],
  ['SlikairPayment', 'tenant_payinId'],
  ['SlikairPayment', 'tenant_status'],
  ['SlikairPayout', 'tenant_userId_createdAt'],
  ['SlikairPayout', 'tenant_payoutId'],
  ['SlikairPayout', 'tenant_status'],
  ['SlikairPayout', 'tenant_merchantReference'],
  ['InhouseCallbackReceipt', 'tenant_operatorGameId_createdAt'],
];

before(async () => {
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (originalEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = originalEnforcement;
});

test('Money models are registered as tenant collections', () => {
  const colls = ['transactions', 'bets', 'casinorounds', 'casinosessions', 'inhouseplaysessions',
    'bankdepositrequests', 'cryptodeposits', 'slikairpayments', 'slikairpayouts', 'inhousecallbackreceipts'];
  for (const c of colls) assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);

  const registered = new Set(listTenantIndexes().map(({ modelName, options }) => `${modelName}.${options.name}`));
  for (const [modelName, indexName] of expectedIndexes) {
    assert.ok(registered.has(`${modelName}.${indexName}`), `expected ${modelName}.${indexName} in the registry`);
  }
  for (const model of Object.values(models)) {
    assert.equal(model.schema.options.autoIndex ?? undefined, undefined);
    assert.ok(model.schema.path('tenantId'));
    assert.equal(model.schema.path('tenantId').options.immutable, true);
    assert.equal(model.schema.path('tenantId').options.required, false);
    assert.equal(model.schema.indexes().some(([keys]) => Object.keys(keys)[0] === 'tenantId' && Object.keys(keys).length > 1), false);
  }
});

test('Bet, CasinoRound, and CryptoDeposit have currency field defaulting to TRY (K14)', async () => {
  const bet = await runWithTenant(T1, () =>
    Bet.create({
      userId: new mongoose.Types.ObjectId(),
      selections: [{ eventId: new mongoose.Types.ObjectId(), oddValue: 1.85 }],
      type: 'single',
      stake: 50,
      totalOdds: 1.85,
      potentialWin: 92.5,
    })
  );
  assert.equal(bet.currency, 'TRY');
  assert.equal(String(bet.tenantId), String(T1));

  const round = await runWithTenant(T1, () =>
    CasinoRound.create({
      userId: new mongoose.Types.ObjectId(),
      gameId: 'crash',
      bet: 10,
      payout: 20,
      net: 10,
      balanceBefore: 100,
      balanceAfter: 110,
    })
  );
  assert.equal(round.currency, 'TRY');
  assert.equal(String(round.tenantId), String(T1));

  const crypto = await runWithTenant(T1, () =>
    CryptoDeposit.create({
      userId: new mongoose.Types.ObjectId(),
      txHash: '0xabc123',
      toAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      usdtAmount: 100,
      creditedTRY: 3400,
    })
  );
  assert.equal(crypto.currency, 'TRY');
  assert.equal(String(crypto.tenantId), String(T1));
});
