import mongoose from 'mongoose';
import PartnerStatement from '../../models/PartnerStatement.js';
import StatementLine from '../../models/StatementLine.js';

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
      return res.status(404).json({ error: 'Statement not found' });
    }

    const statement = await PartnerStatement.findOne({
      _id: req.params.id,
      partnerId,
      status: { $in: ['issued', 'settled'] },
    }).lean();

    if (!statement) {
      return res.status(404).json({ error: 'Statement not found' });
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
      return res.status(404).json({ error: 'Statement not found' });
    }

    const statement = await PartnerStatement.findOne({
      _id: req.params.id,
      partnerId,
      status: { $in: ['issued', 'settled'] },
    }).lean();

    if (!statement) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    const lines = await StatementLine.find({ statementId: statement._id })
      .sort({ date: 1 })
      .lean();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${statement.statementNumber}.csv"`);

    res.write('Date,Type,Description,Base Amount,Rate,Amount,Currency\n');
    for (const line of lines) {
      res.write(
        `"${line.date || ''}","${line.type}","${(line.description || '').replace(/"/g, '""')}",${line.baseAmount || 0},${line.rate || 0},${line.amount},"${line.currency}"\n`
      );
    }
    res.end();
  } catch (err) {
    next(err);
  }
}
