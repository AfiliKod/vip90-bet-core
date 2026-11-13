import mongoose from 'mongoose';
import PartnerStatement from '../../models/PartnerStatement.js';
import StatementLine from '../../models/StatementLine.js';
import { csvText, csvNumber } from '../utils/csv.js';
import { createError } from '../../middleware/error.js';

if (!StatementLine.schema.path('baseMetric').enumValues.includes('ngr')) {
  StatementLine.schema.path('baseMetric').enum('ngr');
}

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

    res.write('Date,Type,Description,GGR,Deductions,NGR Base,Rate,Amount,Currency\n');
    for (const line of lines) {
      const ggr = line.metadata?.ggr != null
        ? line.metadata.ggr
        : (line.baseMetric === 'ggr' ? (line.baseAmount || 0) : '');

      const deductions = line.metadata?.totalDeductions != null
        ? line.metadata.totalDeductions
        : (Array.isArray(line.metadata?.deductions)
            ? line.metadata.deductions.reduce((sum, d) => sum + (d.amount || 0), 0)
            : (line.baseMetric === 'ngr' ? 0 : (line.baseMetric === 'ggr' ? 0 : '')));

      const ngrBase = line.baseMetric === 'ngr'
        ? (line.baseAmount ?? 0)
        : (line.baseMetric === 'ggr' ? (line.baseAmount || 0) : '');

      res.write(
        `${[
          csvText(line.date || ''),
          csvText(line.type),
          csvText(line.description),
          csvNumber(ggr),
          csvNumber(deductions),
          csvNumber(ngrBase),
          csvNumber(line.rate || 0),
          csvNumber(line.amount),
          csvText(line.currency),
        ].join(',')}\n`
      );
    }
    res.end();
  } catch (err) {
    next(err);
  }
}
