import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import { validate } from '../middleware/validate.js';
import {
  evaluateSchema,
  overrideSchema,
  resolveFindingSchema,
  dismissFindingSchema,
  reviewFindingSchema,
  createRuleSchema,
  updateRuleSchema,
  toggleRuleSchema,
} from '../validators/risk.js';
import {
  getPlayerRisk,
  getRiskDashboard,
  manualOverride,
  resolveFinding,
  dismissFinding,
  reviewFinding,
  getFindingHistory,
  getEvaluationHistory,
  listActiveFindings,
  triggerEvaluation,
  listRules,
  getRule,
  createRiskRule,
  updateRiskRule,
  deleteRiskRule,
  toggleRiskRule,
  getRiskSignals,
} from '../controllers/risk.js';

const router = Router();

router.get('/dashboard', requireAuth, requirePermission('admin:risk:read'), getRiskDashboard);
router.get('/findings', requireAuth, requirePermission('admin:risk:read'), listActiveFindings);
router.get('/player/:playerId', requireAuth, requirePermission('admin:risk:read'), getPlayerRisk);
router.get('/player/:playerId/findings', requireAuth, requirePermission('admin:risk:read'), getFindingHistory);
router.get('/player/:playerId/evaluations', requireAuth, requirePermission('admin:risk:read'), getEvaluationHistory);
router.get('/player/:playerId/signals', requireAuth, requirePermission('admin:risk:read'), getRiskSignals);
router.post('/player/:playerId/evaluate', requireAuth, requirePermission('admin:risk:review'), validate(evaluateSchema), triggerEvaluation);
router.post('/player/:playerId/override', requireAuth, requirePermission('admin:risk:write'), validate(overrideSchema), manualOverride);

router.post('/findings/:findingId/resolve', requireAuth, requirePermission('admin:risk:review'), validate(resolveFindingSchema), resolveFinding);
router.post('/findings/:findingId/dismiss', requireAuth, requirePermission('admin:risk:review'), validate(dismissFindingSchema), dismissFinding);
router.post('/findings/:findingId/review', requireAuth, requirePermission('admin:risk:review'), validate(reviewFindingSchema), reviewFinding);

router.get('/rules', requireAuth, requirePermission('admin:risk:rules'), listRules);
router.get('/rules/:ruleId', requireAuth, requirePermission('admin:risk:rules'), getRule);
router.post('/rules', requireAuth, requirePermission('admin:risk:rules'), validate(createRuleSchema), createRiskRule);
router.put('/rules/:ruleId', requireAuth, requirePermission('admin:risk:rules'), validate(updateRuleSchema), updateRiskRule);
router.delete('/rules/:ruleId', requireAuth, requirePermission('admin:risk:rules'), deleteRiskRule);
router.patch('/rules/:ruleId/toggle', requireAuth, requirePermission('admin:risk:rules'), validate(toggleRuleSchema), toggleRiskRule);

export default router;
