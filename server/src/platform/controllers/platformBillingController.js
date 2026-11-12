import OperatorFeePlan from '../../models/OperatorFeePlan.js';
import PartnerStatement from '../../models/PartnerStatement.js';
import StatementLine from '../../models/StatementLine.js';
import {
  generatePartnerStatements,
  issueStatement,
  addStatementAdjustment,
  voidStatement,
} from '../services/billingService.js';
import { writePlatformLevelAudit } from '../services/platformAudit.js';
import { csvText, csvNumber } from '../utils/csv.js';
import { createError } from '../../middleware/error.js';

export async function listOperatorFeePlans(req, res, next) {
  try {
    const plans = await OperatorFeePlan.find({ validTo: null }).populate('tenantId', 'key name').lean();
    res.json({ plans });
  } catch (err) {
    next(err);
  }
}

export async function createOrUpdateFeePlan(req, res, next) {
  try {
    const { tenantId, sportsbookFee, platformFee, notes } = req.body;
    if (!tenantId) return next(createError(400, 'TENANTID_IS_REQUIRED', 'tenantId is required'));

    // Close any active fee plan for this tenant before opening its replacement.
    await OperatorFeePlan.updateMany(
      { tenantId, validTo: null },
      { validTo: new Date(), endedBy: req.staff.id }
    );

    const plan = await OperatorFeePlan.create({
      tenantId,
      sportsbookFee,
      platformFee,
      notes,
      createdBy: req.staff.id,
    });

    await writePlatformLevelAudit(req, 'billing:fee_plan:create', {
      targetType: 'fee_plan',
      targetId: String(plan._id),
      metadata: { tenantId, sportsbookFee },
    });

    res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
}

export async function listStatements(req, res, next) {
  try {
    const { partnerId, status, period } = req.query;
    const filter = {};
    if (partnerId) filter.partnerId = partnerId;
    if (status) filter.status = status;
    if (period) filter.periodStart = { $regex: `^${period}` };

    const statements = await PartnerStatement.find(filter)
      .populate('partnerId', 'key name')
      .sort({ periodStart: -1, createdAt: -1 })
      .lean();

    res.json({ statements });
  } catch (err) {
    next(err);
  }
}

export async function getStatement(req, res, next) {
  try {
    const statement = await PartnerStatement.findOne({ _id: req.params.id })
      .populate('partnerId', 'key name')
      .lean();
    if (!statement) return res.status(404).json({ error: 'Statement not found' });

    const lines = await StatementLine.find({ statementId: statement._id })
      .populate('tenantId', 'key name')
      .sort({ date: 1, type: 1 })
      .lean();

    res.json({ statement, lines });
  } catch (err) {
    next(err);
  }
}

export async function generateStatementsHandler(req, res, next) {
  try {
    const { partnerId, periodStart, periodEnd } = req.body;
    if (!partnerId || !periodStart || !periodEnd) {
      return next(createError(400, 'PARTNERID_PERIODSTART_AND_PERIODEND_ARE_REQUIRED', 'partnerId, periodStart, and periodEnd are required'));
    }

    const statements = await generatePartnerStatements({
      partnerId,
      periodStart,
      periodEnd,
      staffId: req.staff.id,
      req,
    });

    res.json({ statements });
  } catch (err) {
    next(err);
  }
}

export async function issueStatementHandler(req, res, next) {
  try {
    const statement = await issueStatement({
      statementId: req.params.id,
      staffId: req.staff.id,
      req,
    });
    res.json({ statement });
  } catch (err) {
    next(err);
  }
}

export async function addAdjustmentHandler(req, res, next) {
  try {
    const { amount, description, reason } = req.body;
    if (amount === undefined || !description) {
      return next(createError(400, 'AMOUNT_AND_DESCRIPTION_ARE_REQUIRED', 'amount and description are required'));
    }

    const statement = await addStatementAdjustment({
      statementId: req.params.id,
      amount,
      description,
      reason,
      staffId: req.staff.id,
      req,
    });

    res.json({ statement });
  } catch (err) {
    next(err);
  }
}

export async function voidStatementHandler(req, res, next) {
  try {
    const { reason } = req.body;
    if (!reason) return next(createError(400, 'REASON_IS_REQUIRED', 'reason is required'));

    const statement = await voidStatement({
      statementId: req.params.id,
      reason,
      staffId: req.staff.id,
      req,
    });

    res.json({ statement });
  } catch (err) {
    next(err);
  }
}

export async function exportStatementCsvHandler(req, res, next) {
  try {
    const statement = await PartnerStatement.findOne({ _id: req.params.id }).lean();
    if (!statement) return res.status(404).json({ error: 'Statement not found' });

    const lines = await StatementLine.find({ statementId: statement._id }).lean();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${statement.statementNumber}.csv"`);

    res.write('Date,Type,Tenant,Description,Base Amount,Rate,Amount,Currency\n');
    for (const line of lines) {
      res.write(
        `${[csvText(line.date || ''), csvText(line.type), csvText(line.tenantId || ''), csvText(line.description),
          csvNumber(line.baseAmount || 0), csvNumber(line.rate || 0), csvNumber(line.amount), csvText(line.currency)].join(',')}\n`
      );
    }
    res.end();
  } catch (err) {
    next(err);
  }
}
