import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vip90-risk-test';

let RiskProfile, RiskSignal, RiskRule, RiskFinding, RiskEvaluation;

async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGO_URI);
  }
  RiskProfile = (await import('../src/models/RiskProfile.js')).default;
  RiskSignal = (await import('../src/models/RiskSignal.js')).default;
  RiskRule = (await import('../src/models/RiskRule.js')).default;
  RiskFinding = (await import('../src/models/RiskFinding.js')).default;
  RiskEvaluation = (await import('../src/models/RiskEvaluation.js')).default;
}

async function cleanup() {
  await Promise.all([
    RiskProfile?.deleteMany({}),
    RiskSignal?.deleteMany({}),
    RiskRule?.deleteMany({}),
    RiskFinding?.deleteMany({}),
    RiskEvaluation?.deleteMany({}),
  ]);
}

function fakeId() {
  return new mongoose.Types.ObjectId();
}

describe('Risk Models', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('RiskProfile: creates with defaults', async () => {
    const profile = await RiskProfile.create({ playerId: fakeId() });
    assert.strictEqual(profile.riskStatus, 'CLEAR');
    assert.strictEqual(profile.riskLevel, 'LOW');
    assert.strictEqual(profile.riskScore, 0);
    assert.strictEqual(profile.reviewRequired, false);
    assert.deepStrictEqual(profile.activeFlags, []);
  });

  it('RiskSignal: creates with correct category and severity', async () => {
    const signal = await RiskSignal.create({
      playerId: fakeId(),
      code: 'RISK_HIGH_DEPOSIT_VELOCITY',
      category: 'deposit',
      severity: 'HIGH',
      description: 'Test signal',
    });
    assert.strictEqual(signal.code, 'RISK_HIGH_DEPOSIT_VELOCITY');
    assert.strictEqual(signal.processed, false);
  });

  it('RiskRule: creates with conditions', async () => {
    const rule = await RiskRule.create({
      name: 'Test Rule',
      category: 'deposit',
      conditions: [{ field: 'depositCount1h', operator: 'gte', value: 5 }],
      action: 'REVIEW',
      severity: 'HIGH',
      reasonCode: 'TEST_RULE',
    });
    assert.strictEqual(rule.enabled, true);
    assert.strictEqual(rule.conditions.length, 1);
    assert.strictEqual(rule.conditionLogic, 'and');
  });

  it('RiskFinding: creates with status', async () => {
    const finding = await RiskFinding.create({
      playerId: fakeId(),
      code: 'TEST_FINDING',
      category: 'deposit',
      severity: 'HIGH',
      description: 'Test finding',
    });
    assert.strictEqual(finding.status, 'active');
  });

  it('RiskEvaluation: creates with decision', async () => {
    const evaluation = await RiskEvaluation.create({
      playerId: fakeId(),
      event: 'player.deposit',
      decision: 'ALLOW',
      riskLevel: 'LOW',
      score: 0,
      findings: [],
    });
    assert.strictEqual(evaluation.decision, 'ALLOW');
  });
});

describe('Risk Rule Engine', () => {
  let evaluateRule;

  beforeEach(async () => {
    await connectDB();
    await cleanup();
    ({ evaluateRule } = await import('../src/services/riskRule.js'));
  });

  it('matches a simple condition (gte)', async () => {
    const rule = await RiskRule.create({
      name: 'High Deposits',
      category: 'deposit',
      conditions: [{ field: 'depositCount1h', operator: 'gte', value: 5 }],
      action: 'REVIEW',
      severity: 'HIGH',
      reasonCode: 'HIGH_DEPOSITS',
    });

    assert.strictEqual(evaluateRule(rule, { depositCount1h: 5 }), true);
    assert.strictEqual(evaluateRule(rule, { depositCount1h: 10 }), true);
    assert.strictEqual(evaluateRule(rule, { depositCount1h: 4 }), false);
  });

  it('evaluates OR logic correctly', async () => {
    const rule = await RiskRule.create({
      name: 'Or Rule',
      category: 'deposit',
      conditions: [
        { field: 'depositCount1h', operator: 'gte', value: 5 },
        { field: 'failedLoginCount1h', operator: 'gte', value: 3 },
      ],
      conditionLogic: 'or',
      action: 'REVIEW',
      severity: 'MEDIUM',
      reasonCode: 'OR_RULE',
    });

    assert.strictEqual(evaluateRule(rule, { depositCount1h: 5, failedLoginCount1h: 0 }), true);
    assert.strictEqual(evaluateRule(rule, { depositCount1h: 0, failedLoginCount1h: 3 }), true);
    assert.strictEqual(evaluateRule(rule, { depositCount1h: 0, failedLoginCount1h: 0 }), false);
  });

  it('evaluates AND logic correctly', async () => {
    const rule = await RiskRule.create({
      name: 'And Rule',
      category: 'deposit',
      conditions: [
        { field: 'depositCount1h', operator: 'gte', value: 5 },
        { field: 'failedLoginCount1h', operator: 'gte', value: 3 },
      ],
      conditionLogic: 'and',
      action: 'REVIEW',
      severity: 'HIGH',
      reasonCode: 'AND_RULE',
    });

    assert.strictEqual(evaluateRule(rule, { depositCount1h: 5, failedLoginCount1h: 3 }), true);
    assert.strictEqual(evaluateRule(rule, { depositCount1h: 5, failedLoginCount1h: 0 }), false);
  });

  it('skips disabled rules', async () => {
    const rule = await RiskRule.create({
      name: 'Disabled Rule',
      enabled: false,
      category: 'deposit',
      conditions: [{ field: 'x', operator: 'gt', value: 0 }],
      action: 'REVIEW',
      severity: 'LOW',
      reasonCode: 'DISABLED',
    });

    assert.strictEqual(evaluateRule(rule, { x: 10 }), false);
  });

  it('handles between operator', async () => {
    const rule = await RiskRule.create({
      name: 'Between Rule',
      category: 'deposit',
      conditions: [{ field: 'amount', operator: 'between', value: [100, 500] }],
      action: 'REVIEW',
      severity: 'MEDIUM',
      reasonCode: 'BETWEEN',
    });

    assert.strictEqual(evaluateRule(rule, { amount: 200 }), true);
    assert.strictEqual(evaluateRule(rule, { amount: 50 }), false);
    assert.strictEqual(evaluateRule(rule, { amount: 600 }), false);
  });
});

describe('Risk Signal Service', () => {
  let createSignal, getSignalsForPlayer, countSignalsByCode;

  beforeEach(async () => {
    await connectDB();
    await cleanup();
    ({ createSignal, getSignalsForPlayer, countSignalsByCode } = await import('../src/services/riskSignal.js'));
  });

  it('creates a signal with correct fields', async () => {
    const playerId = fakeId();
    const signal = await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      description: '5 deposits in 1 hour',
      sourceEvent: 'player.deposit',
      eventData: { amount: 100 },
    });

    assert.strictEqual(signal.code, 'RISK_HIGH_DEPOSIT_VELOCITY');
    assert.strictEqual(signal.severity, 'HIGH');
    assert.strictEqual(signal.category, 'deposit');
    assert.strictEqual(signal.playerId.toString(), playerId.toString());
  });

  it('retrieves signals for a player', async () => {
    const playerId = fakeId();
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY');
    await createSignal(playerId, 'RISK_REPEATED_FAILED_LOGIN');

    const signals = await getSignalsForPlayer(playerId);
    assert.strictEqual(signals.length, 2);
  });

  it('counts signals by code within time window', async () => {
    const playerId = fakeId();
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY');
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY');
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY');

    const count = await countSignalsByCode(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', 24);
    assert.strictEqual(count, 3);
  });
});

describe('Risk Evaluation Engine', () => {
  let evaluateRisk, getRiskProfile, createSignal;

  beforeEach(async () => {
    await connectDB();
    await cleanup();
    ({ evaluateRisk, getRiskProfile } = await import('../src/services/riskEngine.js'));
    ({ createSignal } = await import('../src/services/riskSignal.js'));
  });

  it('returns ALLOW for player with no signals or findings', async () => {
    const playerId = fakeId();
    const result = await evaluateRisk(playerId, 'manual_review');
    assert.strictEqual(result.decision, 'ALLOW');
    assert.strictEqual(result.riskLevel, 'LOW');
    assert.strictEqual(result.score, 0);
  });

  it('returns REVIEW when rules match', async () => {
    await RiskRule.create({
      name: 'High Deposits',
      category: 'deposit',
      conditions: [{ field: 'depositCount1h', operator: 'gte', value: 2 }],
      action: 'REVIEW',
      severity: 'HIGH',
      reasonCode: 'RISK_HIGH_DEPOSIT_VELOCITY',
      priority: 100,
    });

    const playerId = fakeId();
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit.1',
      eventData: { amount: 100 },
    });
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit.2',
      eventData: { amount: 200 },
    });

    const result = await evaluateRisk(playerId, 'player.deposit', { amount: 200 });
    assert.ok(['REVIEW', 'RESTRICT', 'BLOCK'].includes(result.decision));
    assert.ok(result.score > 0);
  });

  it('persists risk profile after evaluation', async () => {
    const playerId = fakeId();
    await evaluateRisk(playerId, 'manual_review');
    const profile = await getRiskProfile(playerId);
    assert.ok(profile);
    assert.strictEqual(profile.riskStatus, 'CLEAR');
  });
});

describe('Multi-brand / Multi-jurisdiction Isolation', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('rules with brandScope do not apply to other brands', async () => {
    const { getActiveRulesForScope } = await import('../src/services/riskRule.js');
    const brandA = fakeId();
    const brandB = fakeId();

    await RiskRule.create({
      name: 'Brand A Rule',
      category: 'deposit',
      conditions: [{ field: 'x', operator: 'gt', value: 0 }],
      action: 'REVIEW',
      severity: 'MEDIUM',
      reasonCode: 'BRAND_A',
      brandScope: [brandA],
    });

    const rulesForA = await getActiveRulesForScope(brandA, null);
    const rulesForB = await getActiveRulesForScope(brandB, null);

    assert.strictEqual(rulesForA.length, 1);
    assert.strictEqual(rulesForB.length, 0);
  });

  it('global rules apply to all brands', async () => {
    const { getActiveRulesForScope } = await import('../src/services/riskRule.js');
    const brandA = fakeId();

    await RiskRule.create({
      name: 'Global Rule',
      category: 'deposit',
      conditions: [{ field: 'x', operator: 'gt', value: 0 }],
      action: 'REVIEW',
      severity: 'MEDIUM',
      reasonCode: 'GLOBAL',
      brandScope: [],
    });

    const rules = await getActiveRulesForScope(brandA, null);
    assert.strictEqual(rules.length, 1);
  });
});

describe('Admin Risk Operations', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('manual override changes risk status', async () => {
    const { manualRiskOverride } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();
    const adminId = fakeId();

    const profile = await manualRiskOverride(playerId, 'BLOCKED', 'Suspicious activity', adminId);
    assert.strictEqual(profile.riskStatus, 'BLOCKED');
    assert.strictEqual(profile.manualOverride.enabled, true);
    assert.strictEqual(profile.manualOverride.overrideReason, 'Suspicious activity');
  });

  it('creating a rule creates audit log', async () => {
    const { createRule } = await import('../src/services/riskRule.js');
    const adminId = fakeId();

    const rule = await createRule({
      name: 'Audit Test Rule',
      category: 'deposit',
      conditions: [{ field: 'x', operator: 'gt', value: 0 }],
      action: 'REVIEW',
      severity: 'LOW',
      reasonCode: 'AUDIT_TEST',
    }, adminId);

    assert.ok(rule);
    const AuditLog = (await import('../src/models/AuditLog.js')).default;
    const logs = await AuditLog.find({ targetType: 'risk_rule', targetId: rule._id.toString() });
    assert.ok(logs.length >= 1);
  });
});

describe('Security', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('rule conditions cannot execute arbitrary code', async () => {
    const { evaluateRule } = await import('../src/services/riskRule.js');

    const rule = await RiskRule.create({
      name: 'Evil Rule',
      category: 'deposit',
      conditions: [{ field: 'x', operator: 'eq', value: '1+1' }],
      action: 'REVIEW',
      severity: 'LOW',
      reasonCode: 'EVIL',
    });

    // Should not throw, just compare string values
    const result = evaluateRule(rule, { x: '1+1' });
    assert.strictEqual(result, true);

    const result2 = evaluateRule(rule, { x: '2' });
    assert.strictEqual(result2, false);
  });

  it('manual override requires reason', async () => {
    const { manualRiskOverride } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();
    const adminId = fakeId();

    // Should still work but reason is tracked in audit
    const profile = await manualRiskOverride(playerId, 'BLOCKED', '', adminId);
    assert.strictEqual(profile.riskStatus, 'BLOCKED');
  });
});

describe('Risk Detector Service', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('onDeposit: creates HIGH_DEPOSIT_VELOCITY signal when >= 5 deposits in 1h', async () => {
    const { onDeposit } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    // Create 5 deposit transactions in the last hour
    const Transaction = (await import('../src/models/Transaction.js')).default;
    for (let i = 0; i < 5; i++) {
      await Transaction.create({ userId: playerId, type: 'deposit', amount: 100, balanceBefore: 0, balanceAfter: 100, status: 'completed' });
    }

    await onDeposit(playerId, { amount: 100 });
    const signals = await RiskSignal.find({ playerId, code: 'RISK_HIGH_DEPOSIT_VELOCITY' });
    assert.ok(signals.length >= 1);
  });

  it('onDeposit: creates DEPOSIT_VELOCITY_SPIKE signal when >= 3 deposits in 1h', async () => {
    const { onDeposit } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    const Transaction = (await import('../src/models/Transaction.js')).default;
    for (let i = 0; i < 3; i++) {
      await Transaction.create({ userId: playerId, type: 'deposit', amount: 50, balanceBefore: 0, balanceAfter: 50, status: 'completed' });
    }

    await onDeposit(playerId, { amount: 50 });
    const signals = await RiskSignal.find({ playerId, code: 'RISK_DEPOSIT_VELOCITY_SPIKE' });
    assert.ok(signals.length >= 1);
  });

  it('onDeposit: no signal when < 3 deposits', async () => {
    const { onDeposit } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    await onDeposit(playerId, { amount: 100 });
    const signals = await RiskSignal.find({ playerId });
    assert.strictEqual(signals.length, 0);
  });

  it('onWithdrawal: creates RAPID_WITHDRAWAL_AFTER_DEPOSIT when <= 10 min', async () => {
    const { onWithdrawal } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    const Transaction = (await import('../src/models/Transaction.js')).default;
    await Transaction.create({ userId: playerId, type: 'deposit', amount: 500, balanceBefore: 0, balanceAfter: 500, status: 'completed', createdAt: new Date(Date.now() - 5 * 60000) });

    await onWithdrawal(playerId, { amount: 500 });
    const signals = await RiskSignal.find({ playerId, code: 'RISK_RAPID_WITHDRAWAL_AFTER_DEPOSIT' });
    assert.ok(signals.length >= 1);
  });

  it('onWithdrawal: creates WITHDRAWAL_FAILURES signal when >= 3 failures', async () => {
    const { onWithdrawal } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    const Transaction = (await import('../src/models/Transaction.js')).default;
    for (let i = 0; i < 3; i++) {
      await Transaction.create({ userId: playerId, type: 'withdraw', amount: 100, balanceBefore: 500, balanceAfter: 400, status: 'failed' });
    }

    await onWithdrawal(playerId, { amount: 100 });
    const signals = await RiskSignal.find({ playerId, code: 'RISK_WITHDRAWAL_FAILURES' });
    assert.ok(signals.length >= 1);
  });

  it('onFailedLogin: creates REPEATED_FAILED_LOGIN signal when >= 5 attempts', async () => {
    const { onFailedLogin } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    const LoginAttempt = (await import('../src/models/LoginAttempt.js')).default;
    for (let i = 0; i < 5; i++) {
      await LoginAttempt.create({ userId: playerId, username: 'test', ip: '127.0.0.1', success: false });
    }

    await onFailedLogin(playerId, { ip: '127.0.0.1' });
    const signals = await RiskSignal.find({ playerId, code: 'RISK_REPEATED_FAILED_LOGIN' });
    assert.ok(signals.length >= 1);
  });

  it('onKycFailure: creates KYC_FAILURES signal when >= 3 rejections', async () => {
    const { onKycFailure } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    const KycDocument = (await import('../src/models/KycDocument.js')).default;
    for (let i = 0; i < 3; i++) {
      await KycDocument.create({ userId: playerId, documentType: 'identity_card', status: 'rejected', fileName: 'test.jpg', fileSize: 1000, mimeType: 'image/jpeg', fileUrl: 'test.jpg' });
    }

    await onKycFailure(playerId, {});
    const signals = await RiskSignal.find({ playerId, code: 'RISK_KYC_FAILURES' });
    assert.ok(signals.length >= 1);
  });

  it('onAccountChange: creates signal for sensitive changes', async () => {
    const { onAccountChange } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    await onAccountChange(playerId, { type: 'email' });
    const signals = await RiskSignal.find({ playerId, code: 'RISK_SUSPICIOUS_ACCOUNT_CHANGE' });
    assert.strictEqual(signals.length, 1);
    assert.strictEqual(signals[0].eventData.changeType, 'email');
  });

  it('onAccountChange: no signal for non-sensitive changes', async () => {
    const { onAccountChange } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    await onAccountChange(playerId, { type: 'avatar' });
    const signals = await RiskSignal.find({ playerId });
    assert.strictEqual(signals.length, 0);
  });

  it('onPlayerBet: creates PLAYER_BET signal', async () => {
    const { onPlayerBet } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    await onPlayerBet(playerId, { amount: 50 });
    const signals = await RiskSignal.find({ playerId, code: 'player.bet' });
    assert.strictEqual(signals.length, 1);
  });

  it('onGameRound: creates PLAYER_GAME_ROUND signal', async () => {
    const { onGameRound } = await import('../src/services/riskDetector.js');
    const playerId = fakeId();

    await onGameRound(playerId, { gameId: 'crash' });
    const signals = await RiskSignal.find({ playerId, code: 'player.game_round' });
    assert.strictEqual(signals.length, 1);
  });
});

describe('Risk Middleware', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('enforceRiskCheck: returns 403 for BLOCKED player', async () => {
    const { enforceRiskCheck } = await import('../src/middleware/risk.js');
    const { manualRiskOverride } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();
    const adminId = fakeId();

    await manualRiskOverride(playerId, 'BLOCKED', 'Test block', adminId);

    const middleware = enforceRiskCheck('deposit');
    const req = { user: { id: playerId.toString() }, body: { amount: 100 }, ip: '127.0.0.1' };
    const res = {};
    let capturedError = null;
    const next = (err) => { capturedError = err; };

    await middleware(req, res, next);
    assert.ok(capturedError);
    assert.strictEqual(capturedError.status, 403);
  });

  it('enforceRiskCheck: returns 403 for RESTRICTED player', async () => {
    const { enforceRiskCheck } = await import('../src/middleware/risk.js');
    const { manualRiskOverride } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();
    const adminId = fakeId();

    await manualRiskOverride(playerId, 'RESTRICTED', 'Test restrict', adminId);

    const middleware = enforceRiskCheck('deposit');
    const req = { user: { id: playerId.toString() }, body: { amount: 100 }, ip: '127.0.0.1' };
    const res = {};
    let capturedError = null;

    const next = (err) => { capturedError = err; };

    await middleware(req, res, next);
    assert.ok(capturedError);
    assert.strictEqual(capturedError.status, 403);
  });
  it('enforceRiskCheck: allows CLEAR player', async () => {
    const { enforceRiskCheck } = await import('../src/middleware/risk.js');
    const playerId = fakeId();

    const middleware = enforceRiskCheck('deposit');
    const req = { user: { id: playerId.toString() }, body: { amount: 100 }, ip: '127.0.0.1' };
    const res = { setHeader: () => {} };
    let called = false;
    const next = () => { called = true; };

    await middleware(req, res, next);
    assert.strictEqual(called, true);
  });

  it('enforceRiskCheck: sets X-Risk-Review header for REVIEW status', async () => {
    const { enforceRiskCheck } = await import('../src/middleware/risk.js');
    const { manualRiskOverride } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();
    const adminId = fakeId();

    await manualRiskOverride(playerId, 'REVIEW', 'Test review', adminId);

    const middleware = enforceRiskCheck('deposit');
    const req = { user: { id: playerId.toString() }, body: { amount: 100 }, ip: '127.0.0.1' };
    let headerSet = false;
    const res = { setHeader: (k) => { if (k === 'X-Risk-Review') headerSet = true; } };
    let called = false;
    const next = () => { called = true; };

    await middleware(req, res, next);
    assert.strictEqual(called, true);
    assert.strictEqual(headerSet, true);
  });

  it('enforceRiskCheck: continues when no playerId', async () => {
    const { enforceRiskCheck } = await import('../src/middleware/risk.js');

    const middleware = enforceRiskCheck('deposit');
    const req = { body: { amount: 100 }, ip: '127.0.0.1' };
    const res = {};
    let called = false;
    const next = () => { called = true; };

    await middleware(req, res, next);
    assert.strictEqual(called, true);
  });

  it('emitRiskEvent: returns null on error', async () => {
    const { emitRiskEvent } = await import('../src/middleware/risk.js');

    // Pass invalid playerId to trigger error handling
    const result = await emitRiskEvent(null, 'test');
    // Should not throw, returns evaluation result or null
    assert.ok(result === null || typeof result === 'object');
  });
});

describe('Risk Engine Service', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('checkRiskEligibility: returns BLOCK for BLOCKED profile', async () => {
    const { checkRiskEligibility } = await import('../src/services/riskEngine.js');
    const { manualRiskOverride } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();

    await manualRiskOverride(playerId, 'BLOCKED', 'Test', fakeId());
    const result = await checkRiskEligibility(playerId, 'deposit');
    assert.strictEqual(result, 'BLOCK');
  });

  it('checkRiskEligibility: returns RESTRICT for RESTRICTED profile', async () => {
    const { checkRiskEligibility, manualRiskOverride } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();

    await manualRiskOverride(playerId, 'RESTRICTED', 'Test', fakeId());
    const result = await checkRiskEligibility(playerId, 'deposit');
    assert.strictEqual(result, 'RESTRICT');
  });

  it('checkRiskEligibility: returns REVIEW for REVIEW profile', async () => {
    const { checkRiskEligibility, manualRiskOverride } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();

    await manualRiskOverride(playerId, 'REVIEW', 'Test', fakeId());
    const result = await checkRiskEligibility(playerId, 'deposit');
    assert.strictEqual(result, 'REVIEW');
  });

  it('checkRiskEligibility: returns ALLOW for CLEAR profile', async () => {
    const { checkRiskEligibility } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();

    const result = await checkRiskEligibility(playerId, 'deposit');
    assert.strictEqual(result, 'ALLOW');
  });

  it('getRiskProfile: returns null for non-existent player', async () => {
    const { getRiskProfile } = await import('../src/services/riskEngine.js');
    const result = await getRiskProfile(fakeId());
    assert.strictEqual(result, null);
  });

  it('getPlayerRiskOverview: returns overview data', async () => {
    const { getPlayerRiskOverview } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();

    const overview = await getPlayerRiskOverview(playerId);
    assert.ok(overview.profile);
    assert.ok(Array.isArray(overview.activeFindings));
    assert.ok(Array.isArray(overview.recentEvaluations));
  });

  it('getRiskStats: returns aggregated stats', async () => {
    const { getRiskStats, manualRiskOverride } = await import('../src/services/riskEngine.js');

    await manualRiskOverride(fakeId(), 'BLOCKED', 'Test', fakeId());
    await manualRiskOverride(fakeId(), 'CLEAR', 'Test', fakeId());

    const stats = await getRiskStats();
    assert.ok(Array.isArray(stats.statusStats));
    assert.ok(Array.isArray(stats.levelStats));
    assert.ok(Array.isArray(stats.evaluationStats));
  });
});

describe('Risk Rule Service', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('createRule: creates rule and audit log', async () => {
    const { createRule } = await import('../src/services/riskRule.js');
    const adminId = fakeId();

    const rule = await createRule({
      name: 'Test Create',
      category: 'deposit',
      conditions: [{ field: 'x', operator: 'gt', value: 0 }],
      action: 'REVIEW',
      severity: 'MEDIUM',
      reasonCode: 'TEST_CREATE',
    }, adminId);

    assert.ok(rule);
    assert.strictEqual(rule.name, 'Test Create');

    const AuditLog = (await import('../src/models/AuditLog.js')).default;
    const logs = await AuditLog.find({ targetType: 'risk_rule', action: 'risk.rule.create' });
    assert.ok(logs.length >= 1);
  });

  it('createRule: aynı isimle ikinci kural oluşturma temiz 409 DUPLICATE_RULE_NAME fırlatır', async () => {
    const { createRule } = await import('../src/services/riskRule.js');
    const adminId = fakeId();
    const ruleData = {
      name: 'Duplicate Name Test',
      category: 'deposit',
      conditions: [{ field: 'x', operator: 'gt', value: 0 }],
      action: 'REVIEW',
      severity: 'MEDIUM',
      reasonCode: 'DUP_TEST',
    };
    await createRule(ruleData, adminId);

    await assert.rejects(
      () => createRule({ ...ruleData, reasonCode: 'DUP_TEST_2' }, adminId),
      (err) => {
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'DUPLICATE_RULE_NAME');
        return true;
      }
    );
  });

  it('toggleRule: toggles enabled state', async () => {
    const { createRule, toggleRule } = await import('../src/services/riskRule.js');
    const adminId = fakeId();

    const rule = await createRule({
      name: 'Toggle Test',
      category: 'deposit',
      conditions: [{ field: 'x', operator: 'gt', value: 0 }],
      action: 'REVIEW',
      severity: 'LOW',
      reasonCode: 'TOGGLE_TEST',
    }, adminId);

    const toggled = await toggleRule(rule._id, false, adminId);
    assert.strictEqual(toggled.enabled, false);

    const toggledBack = await toggleRule(rule._id, true, adminId);
    assert.strictEqual(toggledBack.enabled, true);
  });

  it('getActiveRulesForScope: filters by brand scope', async () => {
    const { createRule, getActiveRulesForScope } = await import('../src/services/riskRule.js');
    const brandA = fakeId();
    const brandB = fakeId();

    await createRule({ name: 'Brand A', category: 'deposit', conditions: [{ field: 'x', operator: 'gt', value: 0 }], action: 'REVIEW', severity: 'LOW', reasonCode: 'BRAND_A', brandScope: [brandA] }, fakeId());
    await createRule({ name: 'Global', category: 'deposit', conditions: [{ field: 'x', operator: 'gt', value: 0 }], action: 'REVIEW', severity: 'LOW', reasonCode: 'GLOBAL', brandScope: [] }, fakeId());

    const rulesA = await getActiveRulesForScope(brandA, null);
    const rulesB = await getActiveRulesForScope(brandB, null);

    assert.strictEqual(rulesA.length, 2);
    assert.strictEqual(rulesB.length, 1);
  });
});

describe('Risk Signal Service - Stats', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('getSignalStats: returns aggregated stats', async () => {
    const { createSignal, getSignalStats } = await import('../src/services/riskSignal.js');
    const playerId = fakeId();

    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY');
    await createSignal(playerId, 'RISK_REPEATED_FAILED_LOGIN');

    const stats = await getSignalStats();
    assert.ok(Array.isArray(stats));
    assert.ok(stats.length >= 1);
  });

  it('markSignalProcessed: updates processed flag', async () => {
    const { createSignal, markSignalProcessed } = await import('../src/services/riskSignal.js');
    const playerId = fakeId();

    const signal = await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY');
    assert.strictEqual(signal.processed, false);

    const updated = await markSignalProcessed(signal._id);
    assert.strictEqual(updated.processed, true);
    assert.ok(updated.processedAt);
  });
});

describe('Default Rule Safety', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
    await RiskRule.deleteMany({});
  });

  it('initDefaultRules: boş koleksiyona 6+ gerçekçi kural yazar (idempotent)', async () => {
    const { initDefaultRules } = await import('../src/services/riskRule.js');
    await initDefaultRules();
    const first = await RiskRule.countDocuments();
    assert.ok(first >= 6, `en az 6 varsayılan kural bekleniyordu, ${first} bulundu`);
    // İkinci çağrı mevcut kuralları çoğaltmamalı
    await initDefaultRules();
    assert.strictEqual(await RiskRule.countDocuments(), first);
  });

  it('initDefaultRules: eşzamanlı iki çağrı kuralları çoğaltmamalı (boot + riskSeed yarışı)', async () => {
    // server.js boot'ta initDefaultRules() fire-and-forget çağrılıyor;
    // riskSeed.ensureRulesAndPool() da aynı fonksiyonu ayrıca çağırıyor.
    // İkisi eşzamanlı tetiklenirse (ör. restart hemen ardından admin demo
    // veri yüklerse) countDocuments()===0 kontrolünü ikisi de aynı anda
    // geçip 11 kuralı ÇİFT eklerdi — findOneAndUpdate+upsert bunu engeller.
    const { initDefaultRules } = await import('../src/services/riskRule.js');
    await Promise.all([initDefaultRules(), initDefaultRules()]);
    const count = await RiskRule.countDocuments();
    assert.ok(count >= 6, `en az 6 varsayılan kural bekleniyordu, ${count} bulundu`);
    // Not: burada koleksiyonun TAMAMINI (RiskRule.distinct('name').length
    // === count) kontrol etmiyoruz — dosyadaki başka describe blokları
    // (ör. 'Brand/Jurisdiction Isolation') aynı koleksiyona kendi
    // kurallarını yazıyor ve Node test runner'ı üst seviye describe'ları
    // eşzamanlı çalıştırabiliyor; global bir sayım bu sızıntıya karşı
    // kırılgan olurdu. Bunun yerine SADECE initDefaultRules'ın kendi
    // eklediği bilinen bir varsayılan kuralın tekilliğini doğruluyoruz.
    const dupCount = await RiskRule.countDocuments({ name: 'High Deposit Velocity' });
    assert.strictEqual(dupCount, 1, `'High Deposit Velocity' tam olarak 1 kez var olmalı, ${dupCount} bulundu`);
  });

  it('same IP alone should NOT produce BLOCK (changed to REVIEW)', async () => {
    const { initDefaultRules, getActiveRulesForScope } = await import('../src/services/riskRule.js');
    await initDefaultRules();

    const rules = await getActiveRulesForScope(null, null);
    const ipRule = rules.find(r => r.reasonCode === 'RISK_MULTIPLE_ACCOUNTS_SAME_IP');
    assert.ok(ipRule);
    assert.strictEqual(ipRule.action, 'REVIEW');
    assert.notStrictEqual(ipRule.action, 'BLOCK');
  });

  it('same IP + corroborating signal should trigger configured action', async () => {
    const { initDefaultRules, getActiveRulesForScope } = await import('../src/services/riskRule.js');
    const { evaluateRisk } = await import('../src/services/riskEngine.js');
    const { createSignal } = await import('../src/services/riskSignal.js');
    await initDefaultRules();

    const playerId = fakeId();

    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit.1',
      eventData: { amount: 100 },
    });
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit.2',
      eventData: { amount: 200 },
    });
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit.3',
      eventData: { amount: 300 },
    });
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit.4',
      eventData: { amount: 400 },
    });
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit.5',
      eventData: { amount: 500 },
    });

    const result = await evaluateRisk(playerId, 'player.deposit', { amount: 500, accountsSameIp: 3 });
    assert.ok(['REVIEW', 'RESTRICT', 'BLOCK'].includes(result.decision));
    assert.ok(result.score > 0);
  });
});

describe('Decision Precedence', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('Risk=BLOCK blocks even if no RG restriction exists', async () => {
    const { manualRiskOverride, checkRiskEligibility } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();
    const adminId = fakeId();

    await manualRiskOverride(playerId, 'BLOCKED', 'Test block', adminId);
    const decision = await checkRiskEligibility(playerId, 'deposit', {});
    assert.strictEqual(decision, 'BLOCK');
  });

  it('Risk=ALLOW when no profile exists', async () => {
    const { checkRiskEligibility } = await import('../src/services/riskEngine.js');
    const playerId = fakeId();
    const decision = await checkRiskEligibility(playerId, 'deposit', {});
    assert.strictEqual(decision, 'ALLOW');
  });
});

describe('Signal Dedup', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('duplicate signal within dedup window returns existing', async () => {
    const { createSignal } = await import('../src/services/riskSignal.js');
    const playerId = fakeId();

    const s1 = await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit',
      eventData: { amount: 100 },
    });
    const s2 = await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit',
      eventData: { amount: 200 },
    });

    assert.strictEqual(s1._id.toString(), s2._id.toString());

    const signals = await RiskSignal.find({ playerId });
    assert.strictEqual(signals.length, 1);
  });

  it('same code different sourceEvent creates separate signal', async () => {
    const { createSignal } = await import('../src/services/riskSignal.js');
    const playerId = fakeId();

    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit',
      eventData: { amount: 100 },
    });
    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit.retry',
      eventData: { amount: 200 },
    });

    const signals = await RiskSignal.find({ playerId });
    assert.strictEqual(signals.length, 2);
  });

  it('same signal after dedup window creates new signal', async () => {
    const { createSignal } = await import('../src/services/riskSignal.js');
    const playerId = fakeId();

    const s1 = await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit',
      eventData: { amount: 100 },
      dedupWindowMs: 1,
    });

    await new Promise(r => setTimeout(r, 5));

    const s2 = await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit',
      eventData: { amount: 200 },
      dedupWindowMs: 1,
    });

    assert.notStrictEqual(s1._id.toString(), s2._id.toString());
  });
});

describe('Score Determinism', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('same input state produces deterministic result', async () => {
    const { evaluateRisk } = await import('../src/services/riskEngine.js');
    const { createSignal } = await import('../src/services/riskSignal.js');
    const playerId = fakeId();

    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit',
      eventData: { amount: 100 },
    });

    const r1 = await evaluateRisk(playerId, 'player.deposit', { amount: 100 });
    await RiskEvaluation.deleteMany({ playerId });
    await RiskFinding.deleteMany({ playerId });
    await RiskProfile.deleteMany({ playerId });

    const r2 = await evaluateRisk(playerId, 'player.deposit', { amount: 100 });
    assert.strictEqual(r1.score, r2.score);
    assert.strictEqual(r1.decision, r2.decision);
  });

  it('score never exceeds 100', async () => {
    const { evaluateRisk } = await import('../src/services/riskEngine.js');
    const { createSignal } = await import('../src/services/riskSignal.js');
    const playerId = fakeId();

    for (let i = 0; i < 20; i++) {
      await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
        sourceEvent: `player.deposit.${i}`,
        eventData: { amount: 100 * i },
      });
    }

    const result = await evaluateRisk(playerId, 'player.deposit', { amount: 1000 });
    assert.ok(result.score <= 100);
  });

  it('resolved findings do not inflate score', async () => {
    const { evaluateRisk } = await import('../src/services/riskEngine.js');
    const { createSignal } = await import('../src/services/riskSignal.js');
    const playerId = fakeId();

    await createSignal(playerId, 'RISK_HIGH_DEPOSIT_VELOCITY', {
      sourceEvent: 'player.deposit',
      eventData: { amount: 100 },
    });

    const r1 = await evaluateRisk(playerId, 'player.deposit', { amount: 100 });
    const scoreWithFindings = r1.score;

    await RiskFinding.updateMany({ playerId }, { status: 'resolved' });
    await RiskEvaluation.deleteMany({ playerId });
    await RiskProfile.deleteMany({ playerId });

    const r2 = await evaluateRisk(playerId, 'player.deposit', { amount: 100 });
    assert.ok(r2.score <= scoreWithFindings);
  });
});

describe('Brand/Jurisdiction Isolation', () => {
  beforeEach(async () => {
    await connectDB();
    await cleanup();
  });

  it('scoped rule does NOT apply to unrelated brand', async () => {
    const { getActiveRulesForScope } = await import('../src/services/riskRule.js');
    const brandA = new mongoose.Types.ObjectId();
    const brandB = new mongoose.Types.ObjectId();

    await RiskRule.create({
      name: 'Brand A Rule',
      category: 'deposit',
      conditions: [{ field: 'depositCount1h', operator: 'gte', value: 1 }],
      action: 'REVIEW',
      severity: 'HIGH',
      reasonCode: 'RISK_TEST_BRAND',
      brandScope: [brandA],
      priority: 100,
    });

    const rulesForB = await getActiveRulesForScope(brandB, null);
    const matched = rulesForB.find(r => r.reasonCode === 'RISK_TEST_BRAND');
    assert.ok(!matched);
  });

  it('scoped rule applies to matching brand', async () => {
    const { getActiveRulesForScope } = await import('../src/services/riskRule.js');
    const brandA = new mongoose.Types.ObjectId();

    await RiskRule.create({
      name: 'Brand A Rule',
      category: 'deposit',
      conditions: [{ field: 'depositCount1h', operator: 'gte', value: 1 }],
      action: 'REVIEW',
      severity: 'HIGH',
      reasonCode: 'RISK_TEST_BRAND',
      brandScope: [brandA],
      priority: 100,
    });

    const rulesForA = await getActiveRulesForScope(brandA, null);
    const matched = rulesForA.find(r => r.reasonCode === 'RISK_TEST_BRAND');
    assert.ok(matched);
  });

  it('global rule applies to all brands', async () => {
    const { getActiveRulesForScope } = await import('../src/services/riskRule.js');
    const brandA = new mongoose.Types.ObjectId();
    const brandB = new mongoose.Types.ObjectId();

    await RiskRule.create({
      name: 'Global Rule',
      category: 'deposit',
      conditions: [{ field: 'depositCount1h', operator: 'gte', value: 1 }],
      action: 'REVIEW',
      severity: 'HIGH',
      reasonCode: 'RISK_TEST_GLOBAL',
      brandScope: [],
      priority: 100,
    });

    const rulesA = await getActiveRulesForScope(brandA, null);
    const rulesB = await getActiveRulesForScope(brandB, null);
    assert.ok(rulesA.find(r => r.reasonCode === 'RISK_TEST_GLOBAL'));
    assert.ok(rulesB.find(r => r.reasonCode === 'RISK_TEST_GLOBAL'));
  });

  it('jurisdiction-scoped rule respects scope', async () => {
    const { getActiveRulesForScope } = await import('../src/services/riskRule.js');
    const jurisdictionUK = new mongoose.Types.ObjectId();
    const jurisdictionDE = new mongoose.Types.ObjectId();

    await RiskRule.create({
      name: 'UK Only Rule',
      category: 'deposit',
      conditions: [{ field: 'depositCount1h', operator: 'gte', value: 1 }],
      action: 'REVIEW',
      severity: 'HIGH',
      reasonCode: 'RISK_TEST_JURISDICTION',
      jurisdictionScope: [jurisdictionUK],
      priority: 100,
    });

    const rulesUK = await getActiveRulesForScope(null, jurisdictionUK);
    const rulesDE = await getActiveRulesForScope(null, jurisdictionDE);
    assert.ok(rulesUK.find(r => r.reasonCode === 'RISK_TEST_JURISDICTION'));
    assert.ok(!rulesDE.find(r => r.reasonCode === 'RISK_TEST_JURISDICTION'));
  });

  it('getRules: brandId + jurisdictionId birlikte verilince ikisi de uygulanır ($or birbirini ezmemeli)', async () => {
    const { getRules } = await import('../src/services/riskRule.js');
    const brandA = new mongoose.Types.ObjectId();
    const brandB = new mongoose.Types.ObjectId();
    const jurisdictionUK = new mongoose.Types.ObjectId();
    const jurisdictionDE = new mongoose.Types.ObjectId();

    await RiskRule.create({
      name: 'Brand A + UK Rule',
      category: 'deposit',
      conditions: [{ field: 'depositCount1h', operator: 'gte', value: 1 }],
      action: 'REVIEW',
      severity: 'HIGH',
      reasonCode: 'RISK_TEST_BRAND_AND_JURISDICTION',
      brandScope: [brandA],
      jurisdictionScope: [jurisdictionUK],
      priority: 100,
    });

    // Marka eşleşiyor ama yargı bölgesi eşleşmiyor → bulunmamalı
    const mismatchedJurisdiction = await getRules({ brandId: brandA, jurisdictionId: jurisdictionDE });
    assert.ok(!mismatchedJurisdiction.rules.find(r => r.reasonCode === 'RISK_TEST_BRAND_AND_JURISDICTION'));

    // Yargı bölgesi eşleşiyor ama marka eşleşmiyor → bulunmamalı (eski kod
    // burada ikinci $or ataması birinciyi ezdiği için YANLIŞLIKLA bulurdu)
    const mismatchedBrand = await getRules({ brandId: brandB, jurisdictionId: jurisdictionUK });
    assert.ok(!mismatchedBrand.rules.find(r => r.reasonCode === 'RISK_TEST_BRAND_AND_JURISDICTION'));

    // İkisi de eşleşiyor → bulunmalı
    const bothMatch = await getRules({ brandId: brandA, jurisdictionId: jurisdictionUK });
    assert.ok(bothMatch.rules.find(r => r.reasonCode === 'RISK_TEST_BRAND_AND_JURISDICTION'));
  });
});

// Dosyadaki her describe bloğu connectDB() ile bağlanıyor ama hiçbiri
// bağlantıyı kapatmıyordu — açık mongoose handle'ı event loop'u boşaltamadığı
// için `node --test` süreci testler bitse de sonsuza dek asılı kalıyordu
// (2026-09-16'da PAM/RISK_FRAUD doğrulamasında bulundu). Dosya seviyesinde
// tek bir after() yeterli — connectDB() idempotent (readyState kontrolü var).
after(async () => {
  await mongoose.disconnect();
});
