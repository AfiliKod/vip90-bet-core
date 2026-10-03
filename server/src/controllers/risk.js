import { broadcastAdminCounts } from '../services/adminCounts.js';
import RiskProfile, { RISK_STATUS } from '../models/RiskProfile.js';
import RiskFinding, { FINDING_STATUS } from '../models/RiskFinding.js';
import RiskEvaluation from '../models/RiskEvaluation.js';
import RiskSignal from '../models/RiskSignal.js';
import { getPlayerRiskOverview, manualRiskOverride, getRiskStats, evaluateRisk } from '../services/riskEngine.js';
import { createRule, updateRule, deleteRule, toggleRule, getRules, getRuleById, initDefaultRules } from '../services/riskRule.js';
import Rule from '../models/RiskRule.js';
import { getSignalStats } from '../services/riskSignal.js';
import { logAuditEvent } from '../services/audit.js';
import { createError } from '../middleware/error.js';

export async function getPlayerRisk(req, res, next) {
  try {
    const { playerId } = req.params;
    const overview = await getPlayerRiskOverview(playerId);
    res.json(overview);
  } catch (err) {
    next(err);
  }
}

export async function getRiskDashboard(req, res, next) {
  try {
    const { brandId, jurisdictionId } = req.query;
    const [riskStats, signalStats, pendingReviews] = await Promise.all([
      getRiskStats(brandId || null, jurisdictionId || null),
      getSignalStats(brandId || null, jurisdictionId || null),
      RiskProfile.countDocuments({ riskStatus: RISK_STATUS.REVIEW }),
    ]);
    res.json({ riskStats, signalStats, pendingReviews });
  } catch (err) {
    next(err);
  }
}

export async function manualOverride(req, res, next) {
  try {
    const { playerId } = req.params;
    const { status, reason } = req.validated;

    const beforeProfile = await RiskProfile.findOne({ playerId }).lean();
    const before = beforeProfile ? { riskStatus: beforeProfile.riskStatus } : null;

    const profile = await manualRiskOverride(playerId, status, reason, req.user.id);

    await logAuditEvent({
      actorId: req.user.id,
      actorType: 'admin',
      actorUsername: req.user.username || 'admin',
      action: 'risk.override',
      category: 'system',
      targetType: 'player',
      targetId: playerId,
      before,
      after: { riskStatus: status, reason },
      reason,
    });

    res.json(profile);
  } catch (err) {
    next(err);
  }
}

export async function resolveFinding(req, res, next) {
  try {
    const { findingId } = req.params;
    const { resolution } = req.body;
    const finding = await RiskFinding.findByIdAndUpdate(
      findingId,
      {
        status: FINDING_STATUS.RESOLVED,
        resolvedBy: req.user.id,
        resolvedAt: new Date(),
        resolutionReason: resolution || 'Resolved by admin',
      },
      { new: true }
    );
    if (!finding) throw createError(404, 'NOT_FOUND', 'Finding not found');

    await logAuditEvent({
      actorId: req.user.id,
      actorType: 'admin',
      action: 'risk.finding.resolve',
      category: 'system',
      targetType: 'risk_finding',
      targetId: findingId,
      after: { status: 'resolved', resolution },
    });

    // `active` -> resolved/dismissed/reviewed: risk rozeti anında düşsün.
    broadcastAdminCounts();
    res.json(finding);
  } catch (err) {
    next(err);
  }
}

export async function dismissFinding(req, res, next) {
  try {
    const { findingId } = req.params;
    const { reason } = req.validated;

    const existing = await RiskFinding.findById(findingId).lean();
    if (!existing) throw createError(404, 'NOT_FOUND', 'Finding not found');

    const finding = await RiskFinding.findByIdAndUpdate(
      findingId,
      {
        status: FINDING_STATUS.DISMISSED,
        resolvedBy: req.user.id,
        resolvedAt: new Date(),
        resolutionReason: reason || 'Dismissed by admin',
      },
      { new: true }
    );

    await logAuditEvent({
      actorId: req.user.id,
      actorType: 'admin',
      actorUsername: req.user.username || 'admin',
      action: 'risk.finding.dismiss',
      category: 'system',
      targetType: 'risk_finding',
      targetId: findingId,
      before: { status: existing.status },
      after: { status: 'dismissed', reason },
      reason,
    });

    // `active` -> resolved/dismissed/reviewed: risk rozeti anında düşsün.
    broadcastAdminCounts();
    res.json(finding);
  } catch (err) {
    next(err);
  }
}

export async function reviewFinding(req, res, next) {
  try {
    const { findingId } = req.params;
    const { note } = req.body;
    const finding = await RiskFinding.findByIdAndUpdate(
      findingId,
      {
        status: FINDING_STATUS.REVIEWED,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        reviewNote: note || '',
      },
      { new: true }
    );
    if (!finding) throw createError(404, 'NOT_FOUND', 'Finding not found');

    await logAuditEvent({
      actorId: req.user.id,
      actorType: 'admin',
      action: 'risk.finding.review',
      category: 'system',
      targetType: 'risk_finding',
      targetId: findingId,
      after: { status: 'reviewed', note },
    });

    // `active` -> resolved/dismissed/reviewed: risk rozeti anında düşsün.
    broadcastAdminCounts();
    res.json(finding);
  } catch (err) {
    next(err);
  }
}

export async function getFindingHistory(req, res, next) {
  try {
    const { playerId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [findings, total] = await Promise.all([
      RiskFinding.find({ playerId }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      RiskFinding.countDocuments({ playerId }),
    ]);
    res.json({ findings, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

/**
 * Dashboard "yüksek riskli aktivite" listesi (docs/admin-redesign §F3).
 * Oyuncu bazlı değil, TÜM aktif bulguları severity'ye göre sıralar.
 */
export async function listActiveFindings(req, res, next) {
  try {
    const { brandId, jurisdictionId } = req.query;
    const limit = Math.min(Number(req.query.limit) || 5, 50);
    const filter = { status: FINDING_STATUS.ACTIVE };
    if (brandId) filter.brandId = brandId;
    if (jurisdictionId) filter.jurisdictionId = jurisdictionId;

    // Önce popüler oyuncu sayısı (kilit) çözülür, sonra bulgular.
    const findings = await RiskFinding.find(filter)
      .select('playerId code category severity description status createdAt')
      .sort({ severity: 1, createdAt: -1 })
      .limit(limit)
      .populate('playerId', 'username email createdAt')
      .lean();

    res.json({ findings });
  } catch (err) {
    next(err);
  }
}

export async function getEvaluationHistory(req, res, next) {
  try {
    const { playerId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [evaluations, total] = await Promise.all([
      RiskEvaluation.find({ playerId }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      RiskEvaluation.countDocuments({ playerId }),
    ]);
    res.json({ evaluations, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

export async function triggerEvaluation(req, res, next) {
  try {
    const { playerId } = req.params;
    const { event = 'manual_review', context = {} } = req.body;
    const result = await evaluateRisk(playerId, event, context);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Rule management
export async function listRules(req, res, next) {
  try {
    const { category, enabled, page, limit } = req.query;
    const result = await getRules({ category, enabled, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getRule(req, res, next) {
  try {
    const rule = await getRuleById(req.params.ruleId);
    if (!rule) throw createError(404, 'NOT_FOUND', 'Rule not found');
    res.json(rule);
  } catch (err) {
    next(err);
  }
}

export async function createRiskRule(req, res, next) {
  try {
    const rule = await createRule(req.validated, req.user.id);

    await logAuditEvent({
      actorId: req.user.id,
      actorType: 'admin',
      actorUsername: req.user.username || 'admin',
      action: 'risk.rule.create',
      category: 'system',
      targetType: 'risk_rule',
      targetId: rule._id.toString(),
      after: { name: rule.name, category: rule.category, action: rule.action, severity: rule.severity },
    });

    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
}

export async function updateRiskRule(req, res, next) {
  try {
    const existing = await Rule.findById(req.params.ruleId).lean();
    const rule = await updateRule(req.params.ruleId, req.validated, req.user.id);

    await logAuditEvent({
      actorId: req.user.id,
      actorType: 'admin',
      actorUsername: req.user.username || 'admin',
      action: 'risk.rule.update',
      category: 'system',
      targetType: 'risk_rule',
      targetId: req.params.ruleId,
      before: existing ? { name: existing.name, enabled: existing.enabled } : null,
      after: { name: rule.name, enabled: rule.enabled },
    });

    res.json(rule);
  } catch (err) {
    next(err);
  }
}

export async function deleteRiskRule(req, res, next) {
  try {
    await deleteRule(req.params.ruleId, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function toggleRiskRule(req, res, next) {
  try {
    const { enabled } = req.body;
    const rule = await toggleRule(req.params.ruleId, enabled, req.user.id);
    res.json(rule);
  } catch (err) {
    next(err);
  }
}

export async function getRiskSignals(req, res, next) {
  try {
    const { playerId } = req.params;
    const { category, severity, limit } = req.query;
    const signals = await (await import('../services/riskSignal.js')).getSignalsForPlayer(playerId, { category, severity, limit: Number(limit) || 50 });
    res.json(signals);
  } catch (err) {
    next(err);
  }
}
