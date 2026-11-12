import mongoose from 'mongoose';
import PartnerStatement from '../../models/PartnerStatement.js';
import StatementLine from '../../models/StatementLine.js';
import { csvText, csvNumber } from '../utils/csv.js';
import { createError } from '../../middleware/error.js';

export async function listPartnerStatements(req, res, next) {
  try {
    const partnerId = req.staff.scopeId;
    const statements = await PartnerStatement.find({
      partnerId,
      status: { $in: ['issued', 'settled'] },
    })
      .sort({ periodStart: -1 })
      .lean();

    res.json({ statements });
  } catch (err) {
    next(err);
  }
}

export async function getPartnerStatement(req, res, next) {
  try {
    const partnerId = req.staff.scopeId;
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return next(createError(404, 'NOT_FOUND', 'Statement not found'));
    }

    const statement = await PartnerStatement.findOne({
      _id: req.params.id,
      partnerId,
      status: { $in: ['issued', 'settled'] },
    }).lean();

    if (!statement) {
      return next(createError(404, 'NOT_FOUND', 'Statement not found'));
    }

    const lines = await StatementLine.find({ statementId: statement._id })
      .populate('tenantId', 'key name')
      .sort({ date: 1 })
      .lean();

    res.json({ statement, lines });
  } catch (err) {
    next(err);
  }
}

export async function exportPartnerStatementCsv(req, res, next) {
  try {
    const partnerId = req.staff.scopeId;
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return next(createError(404, 'NOT_FOUND', 'Statement not found'));
    }

    const statement = await PartnerStatement.findOne({
      _id: req.params.id,
      partnerId,
      status: { $in: ['issued', 'settled'] },
    }).lean();

    if (!statement) {
      return next(createError(404, 'NOT_FOUND', 'Statement not found'));
    }

    const lines = await StatementLine.find({ statementId: statement._id })
      .sort({ date: 1 })
      .lean();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${statement.statementNumber}.csv"`);

    res.write('Date,Type,Description,Base Amount,Rate,Amount,Currency\n');
    for (const line of lines) {
      res.write(
        `${[csvText(line.date || ''), csvText(line.type), csvText(line.description), csvNumber(line.baseAmount || 0),
          csvNumber(line.rate || 0), csvNumber(line.amount), csvText(line.currency)].join(',')}\n`
      );
    }
    res.end();
  } catch (err) {
    next(err);
  }
}
