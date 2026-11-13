import PartnerStatement from '../../models/PartnerStatement.js';
import StatementLine from '../../models/StatementLine.js';
import TenantDailyStat from '../../models/TenantDailyStat.js';
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';
import OperatorFeePlan from '../../models/OperatorFeePlan.js';
import Partner from '../../models/Partner.js';
import NgrDefinition from '../../models/NgrDefinition.js';
import mongoose from 'mongoose';
import { runAsPlatform } from '../../tenancy/context.js';
import { createError } from '../../middleware/error.js';
import {
  calculateCommissionForPeriod,
  roundMoney,
  toMinorUnits,
  fromMinorUnits,
  multiplyMinorUnitsByRate,
  findActiveLink,
  findActiveFeePlan,
} from './commissionCalculator.js';
import { writePlatformLevelAudit } from './platformAudit.js';



/**
 * Assert that an NGR definition version is not referenced by an issued statement.
 * If referenced, throws a 409 ERR_NGR_DEFINITION_IN_USE error.
 *
 * @param {string|mongoose.Types.ObjectId} definitionId
 * @param {number} version
 */
export async function assertNgrDefinitionNotIssued(definitionId, version) {
  const targetId = mongoose.Types.ObjectId.isValid(definitionId)
    ? new mongoose.Types.ObjectId(definitionId)
    : definitionId;
  const inUse = await PartnerStatement.exists({
    'metadata.ngrDefinitionsUsed': {
      $elemMatch: {
        id: { $in: [targetId, String(definitionId)] },
        version: Number(version),
      },
    },
    status: { $in: ['issued', 'settled'] },
  });
  if (inUse) {
    const err = createError(
      409,
      'ERR_NGR_DEFINITION_IN_USE',
      'NGR definition version is referenced by an issued statement and cannot be modified.'
    );
    throw err;
  }
}

export async function generatePartnerStatements({ partnerId, periodStart, periodEnd, staffId, req }) {
  return runAsPlatform('billing-statement-generation', async () => {
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      const err = createError(404, 'NOT_FOUND', 'Partner not found');
      throw err;
    }

    const issuedExisting = await PartnerStatement.findOne({
      partnerId,
      periodStart,
      periodEnd,
      status: { $in: ['issued', 'settled'] },
    });
    if (issuedExisting) {
      const err = createError(409, 'ERR_STATEMENT_ALREADY_ISSUED', 'Statement for this period has already been issued and is immutable.');
      throw err;
    }

    const links = await PartnerOperatorLink.find({ partnerId }).lean();
    const tenantIds = links.map((link) => link.tenantId);
    const stats = await TenantDailyStat.find({
      tenantId: { $in: tenantIds },
      date: { $gte: periodStart, $lte: periodEnd },
    }).lean();
    const feePlans = await OperatorFeePlan.find({ tenantId: { $in: tenantIds } }).lean();

    // Fetch referenced NgrDefinition records for any links or partner terms where base === 'ngr' or model === 'revshare_ngr'
    const candidateTerms = [
      partner.defaultCommercialTerms,
      ...links.map((link) => link.commercialTerms),
    ].filter(Boolean);

    const ngrDefIds = new Set();
    for (const terms of candidateTerms) {
      if ((terms.base === 'ngr' || terms.model === 'revshare_ngr') && terms.ngrDefinitionId) {
        ngrDefIds.add(String(terms.ngrDefinitionId));
      }
    }

    let ngrDefinitions = [];
    if (ngrDefIds.size > 0) {
      const baseDefs = await NgrDefinition.find({
        _id: { $in: Array.from(ngrDefIds) },
      }).lean();
      ngrDefinitions = [...baseDefs];

      const additionalQueries = [];
      for (const terms of candidateTerms) {
        if ((terms.base === 'ngr' || terms.model === 'revshare_ngr') && terms.ngrDefinitionId && terms.ngrDefinitionVersion) {
          const matched = baseDefs.find((d) => String(d._id) === String(terms.ngrDefinitionId));
          if (matched && matched.version !== terms.ngrDefinitionVersion) {
            additionalQueries.push({ name: matched.name, version: terms.ngrDefinitionVersion });
          }
        }
      }
      if (additionalQueries.length > 0) {
        const extraDefs = await NgrDefinition.find({ $or: additionalQueries }).lean();
        for (const extra of extraDefs) {
          if (!ngrDefinitions.some((d) => String(d._id) === String(extra._id))) {
            ngrDefinitions.push(extra);
          }
        }
      }
    }

    const calculationsByCurrency = calculateCommissionForPeriod({
      partner,
      links,
      stats,
      feePlans,
      ngrDefinitions,
    });

    const statements = [];

    for (const [currency, data] of Object.entries(calculationsByCurrency)) {
      const statementNumber = `STMT-${periodStart.slice(0, 7)}-${partner.key.toUpperCase()}-${currency}`;
      let statement = await PartnerStatement.findOne({
        partnerId,
        periodStart,
        periodEnd,
        currency,
        status: 'draft',
      });

      if (!statement) {
        statement = new PartnerStatement({
          statementNumber,
          partnerId,
          periodStart,
          periodEnd,
          currency,
          status: 'draft',
          createdBy: staffId,
        });
      }

      statement.grossAmount = data.grossAmount;
      statement.netAmount = roundMoney(data.grossAmount + (statement.adjustmentsAmount || 0));
      statement.finalAmount = statement.netAmount;
      statement.linesCount = data.lines.length;

      // Track all NGR definitions used by lines in this statement
      const ngrDefsUsedMap = new Map();
      for (const line of data.lines) {
        if (line.metadata?.ngrDefinitionId) {
          const key = `${line.metadata.ngrDefinitionId}:${line.metadata.ngrDefinitionVersion}`;
          if (!ngrDefsUsedMap.has(key)) {
            const defDoc = ngrDefinitions.find(
              (d) => String(d._id) === String(line.metadata.ngrDefinitionId) &&
                     (line.metadata.ngrDefinitionVersion == null || d.version === line.metadata.ngrDefinitionVersion)
            );
            ngrDefsUsedMap.set(key, {
              id: line.metadata.ngrDefinitionId,
              version: line.metadata.ngrDefinitionVersion || defDoc?.version || 1,
              name: defDoc?.name || null,
            });
          }
        }
      }

      for (const terms of candidateTerms) {
        if (terms?.ngrDefinitionId && (terms.base === 'ngr' || terms.model === 'revshare_ngr')) {
          const defDoc = ngrDefinitions.find((d) => String(d._id) === String(terms.ngrDefinitionId));
          if (defDoc) {
            const version = terms.ngrDefinitionVersion || defDoc.version;
            const key = `${defDoc._id}:${version}`;
            if (!ngrDefsUsedMap.has(key)) {
              ngrDefsUsedMap.set(key, {
                id: defDoc._id,
                version,
                name: defDoc.name,
              });
            }
          }
        }
      }

      const ngrDefinitionsUsed = Array.from(ngrDefsUsedMap.values());
      statement.metadata = {
        ...(statement.metadata || {}),
        ...(ngrDefinitionsUsed.length > 0 ? { ngrDefinitionsUsed } : {}),
      };

      await statement.save();

      await StatementLine.deleteMany({ statementId: statement._id, type: { $ne: 'adjustment' } });

      const linesToInsert = data.lines.map((line) => ({
        ...line,
        statementId: statement._id,
        partnerId,
      }));
      if (linesToInsert.length > 0) {
        await StatementLine.insertMany(linesToInsert);
      }

      statements.push(statement);
    }

    {
      // Audited also when a scheduled job generates (no HTTP request).
      const auditReq = req || { staff: { id: staffId || null, username: 'billing-job' }, headers: {}, ip: null };
      await writePlatformLevelAudit(auditReq, 'billing:statement:generate', {
        targetType: 'partner',
        targetId: String(partnerId),
        metadata: { periodStart, periodEnd, count: statements.length },
      });
    }

    return statements;
  });
}

export async function issueStatement({ statementId, staffId, req }) {
  const statement = await PartnerStatement.findById(statementId);
  if (!statement) {
    const err = createError(404, 'NOT_FOUND', 'Statement not found');
    throw err;
  }

  if (statement.status !== 'draft') {
    const err = createError(409, 'ERR_INVALID_STATUS', 'Only draft statements can be issued');
    throw err;
  }

  statement.status = 'issued';
  statement.issuedAt = new Date();
  statement.issuedBy = staffId;
  await statement.save();

  if (req) {
    await writePlatformLevelAudit(req, 'billing:statement:issue', {
      targetType: 'partner_statement',
      targetId: String(statementId),
      metadata: { statementNumber: statement.statementNumber, netAmount: statement.netAmount },
    });
  }

  return statement;
}

export async function addStatementAdjustment({ statementId, amount, description, reason, staffId, req }) {
  const statement = await PartnerStatement.findById(statementId);
  if (!statement) {
    const err = createError(404, 'NOT_FOUND', 'Statement not found');
    throw err;
  }

  if (statement.status === 'voided') {
    const err = createError(409, 'ERR_STATEMENT_VOIDED', 'Cannot add adjustments to voided statement');
    throw err;
  }

  const adjLine = await StatementLine.create({
    statementId: statement._id,
    partnerId: statement.partnerId,
    type: 'adjustment',
    currency: statement.currency,
    baseMetric: 'manual',
    baseAmount: 0,
    rate: 0,
    amount: roundMoney(amount),
    description,
    reason,
    createdBy: staffId,
  });

  statement.adjustmentsAmount = roundMoney(statement.adjustmentsAmount + adjLine.amount);
  statement.netAmount = roundMoney(statement.grossAmount + statement.adjustmentsAmount);
  statement.finalAmount = statement.netAmount;
  statement.linesCount += 1;
  await statement.save();

  if (req) {
    await writePlatformLevelAudit(req, 'billing:statement:adjust', {
      targetType: 'partner_statement',
      targetId: String(statementId),
      reason,
      metadata: { adjustmentAmount: adjLine.amount, netAmount: statement.netAmount },
    });
  }

  return statement;
}

export async function voidStatement({ statementId, reason, staffId, req }) {
  const statement = await PartnerStatement.findById(statementId);
  if (!statement) {
    const err = createError(404, 'NOT_FOUND', 'Statement not found');
    throw err;
  }

  statement.status = 'voided';
  statement.voidedAt = new Date();
  statement.voidedBy = staffId;
  statement.voidReason = reason;
  await statement.save();

  if (req) {
    await writePlatformLevelAudit(req, 'billing:statement:void', {
      targetType: 'partner_statement',
      targetId: String(statementId),
      reason,
      metadata: { statementNumber: statement.statementNumber },
    });
  }

  return statement;
}
