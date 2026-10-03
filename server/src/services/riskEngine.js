import RiskProfile, { RISK_LEVEL, RISK_STATUS } from '../models/RiskProfile.js';
import RiskEvaluation, { EVALUATION_DECISION } from '../models/RiskEvaluation.js';
import RiskFinding, { FINDING_STATUS } from '../models/RiskFinding.js';
import { getSignalsForPlayer, getRecentSignals, countSignalsByCode, markSignalProcessed } from './riskSignal.js';
import { getActiveRulesForScope, evaluateRule } from './riskRule.js';
import { logAuditEvent } from './audit.js';

const SEVERITY_WEIGHTS = {
  LOW: 5,
  MEDIUM: 15,
  HIGH: 30,
  CRITICAL: 50,
};

const DECISION_THRESHOLDS = {
  [RISK_LEVEL.LOW]: { min: 0, max: 25, decision: EVALUATION_DECISION.ALLOW },
  [RISK_LEVEL.MEDIUM]: { min: 26, max: 50, decision: EVALUATION_DECISION.REVIEW },
  [RISK_LEVEL.HIGH]: { min: 51, max: 75, decision: EVALUATION_DECISION.RESTRICT },
  [RISK_LEVEL.CRITICAL]: { min: 76, max: 100, decision: EVALUATION_DECISION.BLOCK },
};

function calculateRiskLevel(score) {
  if (score >= 76) return RISK_LEVEL.CRITICAL;
  if (score >= 51) return RISK_LEVEL.HIGH;
  if (score >= 26) return RISK_LEVEL.MEDIUM;
  return RISK_LEVEL.LOW;
}

function determineDecision(score, activeFindings) {
  const level = calculateRiskLevel(score);
  return DECISION_THRESHOLDS[level].decision;
}

function buildSignalContext(signals, recentSignals) {
  const ctx = {};
  for (const signal of recentSignals) {
    const key = `${signal.code}_count`;
    ctx[key] = (ctx[key] || 0) + 1;
  }
  const depositSignals = recentSignals.filter(s => s.category === 'deposit');
  ctx.depositCount1h = depositSignals.filter(s => {
    const diff = Date.now() - new Date(s.createdAt).getTime();
    return diff < 3600000;
  }).length;

  const withdrawalSignals = recentSignals.filter(s => s.category === 'withdrawal');
  if (withdrawalSignals.length > 0 && depositSignals.length > 0) {
    const lastDeposit = depositSignals[0];
    const lastWithdrawal = withdrawalSignals[0];
    const diffMs = new Date(lastWithdrawal.createdAt).getTime() - new Date(lastDeposit.createdAt).getTime();
    ctx.minutesSinceDeposit = Math.floor(diffMs / 60000);
  }

  const failedLogins = recentSignals.filter(s => s.code === 'RISK_REPEATED_FAILED_LOGIN');
  ctx.failedLoginCount1h = failedLogins.length;

  const kycFailures = recentSignals.filter(s => s.code === 'RISK_KYC_FAILURES');
  ctx.kycFailureCount = kycFailures.length;

  return ctx;
}

export async function evaluateRisk(playerId, event, context = {}, opts = {}) {
  const { isSeed = false, suppressActivity = false } = opts;
  const start = Date.now();

  const profile = await RiskProfile.findOne({ playerId }) || await RiskProfile.create({ playerId });
  const signals = await getSignalsForPlayer(playerId);
  const recentSignals = await getRecentSignals(playerId, 24);
  const signalContext = buildSignalContext(signals, recentSignals);
  const fullContext = { ...signalContext, ...context };

  const rules = await getActiveRulesForScope(profile.brandId, profile.jurisdictionId);
  const findings = [];
  let totalScore = 0;

  for (const rule of rules) {
    const matched = evaluateRule(rule, fullContext);
    if (matched) {
      const finding = await RiskFinding.create({
        playerId,
        brandId: profile.brandId,
        jurisdictionId: profile.jurisdictionId,
        code: rule.reasonCode,
        category: rule.category,
        severity: rule.severity,
        description: rule.description,
        sourceEvent: event,
        ruleId: rule._id,
        metadata: { context: fullContext },
        isSeed,
      });
      findings.push({
        code: rule.reasonCode,
        severity: rule.severity,
        category: rule.category,
        ruleId: rule._id,
      });
      totalScore += SEVERITY_WEIGHTS[rule.severity] || 10;
    }
  }

  const activeFindings = await RiskFinding.countDocuments({ playerId, status: FINDING_STATUS.ACTIVE });
  totalScore = Math.min(100, totalScore + activeFindings * 2);

  const riskLevel = calculateRiskLevel(totalScore);
  const decision = determineDecision(totalScore, findings);

  if (findings.length > 0 && !suppressActivity) {
    try {
      const { logActivity } = await import('./activityFeed.js');
      await logActivity({
        type: 'risk_flag', userId: playerId, status: 'open',
        summary: `Risk bayrağı: ${findings.map(f => f.code).join(', ')}`,
        data: { findings, totalScore },
      });
    } catch (e) {
      console.error('[activity] risk_flag error:', e.message);
    }
  }

  const updateData = {
    riskScore: totalScore,
    riskLevel,
    riskStatus: decision === EVALUATION_DECISION.ALLOW ? RISK_STATUS.CLEAR
      : decision === EVALUATION_DECISION.REVIEW ? RISK_STATUS.REVIEW
      : decision === EVALUATION_DECISION.RESTRICT ? RISK_STATUS.RESTRICTED
      : RISK_STATUS.BLOCKED,
    activeFlags: findings.map(f => f.code),
    reviewRequired: decision === EVALUATION_DECISION.REVIEW,
    lastEvaluatedAt: new Date(),
    evaluatedBy: 'system',
    reason: event,
  };

  await RiskProfile.findOneAndUpdate({ playerId }, updateData, { upsert: true });

  for (const signal of recentSignals.filter(s => !s.processed)) {
    await markSignalProcessed(signal._id);
  }

  const evaluation = await RiskEvaluation.create({
    playerId,
    brandId: profile.brandId,
    jurisdictionId: profile.jurisdictionId,
    event,
    context: fullContext,
    decision,
    riskLevel,
    score: totalScore,
    findings,
    signalsProcessed: recentSignals.length,
    rulesEvaluated: rules.length,
    rulesMatched: findings.length,
    evaluationDurationMs: Date.now() - start,
    isSeed,
  });

  if (decision !== EVALUATION_DECISION.ALLOW) {
    await logAuditEvent({
      actorId: null,
      actorType: 'system',
      actorUsername: 'system',
      action: `risk.evaluation.${decision.toLowerCase()}`,
      category: 'system',
      targetType: 'player',
      targetId: playerId,
      after: { decision, riskLevel, score: totalScore, findings: findings.map(f => f.code) },
      reason: event,
    });
  }

  return {
    decision,
    riskLevel,
    score: totalScore,
    findings,
    requiredAction: decision !== EVALUATION_DECISION.ALLOW ? decision : null,
  };
}

export async function checkRiskEligibility(playerId, action, context = {}) {
  const profile = await RiskProfile.findOne({ playerId });
  if (!profile) return EVALUATION_DECISION.ALLOW;

  if (profile.riskStatus === RISK_STATUS.BLOCKED) return EVALUATION_DECISION.BLOCK;
  if (profile.riskStatus === RISK_STATUS.RESTRICTED) return EVALUATION_DECISION.RESTRICT;
  if (profile.riskStatus === RISK_STATUS.REVIEW) return EVALUATION_DECISION.REVIEW;

  return EVALUATION_DECISION.ALLOW;
}

export async function getRiskProfile(playerId) {
  return RiskProfile.findOne({ playerId });
}

export async function getPlayerRiskOverview(playerId) {
  const profile = await RiskProfile.findOne({ playerId });
  const activeFindings = await RiskFinding.find({ playerId, status: FINDING_STATUS.ACTIVE }).sort({ severity: -1 });
  const recentEvaluations = await RiskEvaluation.find({ playerId }).sort({ createdAt: -1 }).limit(10);

  return {
    profile: profile || { riskStatus: RISK_STATUS.CLEAR, riskLevel: RISK_LEVEL.LOW, riskScore: 0 },
    activeFindings,
    recentEvaluations,
  };
}

export async function manualRiskOverride(playerId, status, reason, adminId) {
  const before = await RiskProfile.findOne({ playerId }).lean();
  const profile = await RiskProfile.findOneAndUpdate(
    { playerId },
    {
      riskStatus: status,
      manualOverride: {
        enabled: true,
        overriddenBy: adminId,
        overrideReason: reason,
        overriddenAt: new Date(),
      },
      lastEvaluatedAt: new Date(),
      evaluatedBy: `admin:${adminId}`,
    },
    { upsert: true, new: true }
  );

  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: 'admin',
    action: 'risk.manual_override',
    category: 'system',
    targetType: 'player',
    targetId: playerId,
    before: before || {},
    after: profile.toObject(),
    reason,
  });

  return profile;
}

export async function getRiskStats(brandId = null, jurisdictionId = null) {
  const match = {};
  if (brandId) match.brandId = brandId;
  if (jurisdictionId) match.jurisdictionId = jurisdictionId;

  const [statusStats, levelStats, evaluationStats] = await Promise.all([
    RiskProfile.aggregate([
      { $match: match },
      { $group: { _id: '$riskStatus', count: { $sum: 1 } } },
    ]),
    RiskProfile.aggregate([
      { $match: match },
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    ]),
    RiskEvaluation.aggregate([
      { $match: match },
      { $group: { _id: '$decision', count: { $sum: 1 } } },
    ]),
  ]);

  return { statusStats, levelStats, evaluationStats };
}
