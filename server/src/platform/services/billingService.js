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

if (!StatementLine.schema.path('baseMetric').enumValues.includes('ngr')) {
  StatementLine.schema.path('baseMetric').enum('ngr');
}

/**
 * Fallback NGR calculation for when calculator has not yet implemented NGR.
 * Calculates daily NGR, itemized deductions, and commission lines in integer minor units.
 */
function calculateNgrFallback({ partner, links = [], stats = [], feePlans = [], ngrDefinitions = [] }) {
  const byCurrency = {};

  for (const stat of stats) {
    const currency = stat.currency || 'TRY';
    if (!byCurrency[currency]) {
      byCurrency[currency] = {
        currency,
        lines: [],
        grossAmount: 0,
        netAmount: 0,
        _grossAmountCents: 0,
      };
    }

    const link = findActiveLink(links, stat.tenantId, stat.date);
    const terms = link?.commercialTerms || partner?.commercialTerms || partner?.defaultCommercialTerms || { model: 'revshare_ggr', rate: 0.15 };

    if (terms.model === 'revshare_ngr' || terms.base === 'ngr') {
      const ngrDef = ngrDefinitions.find((def) => (
        String(def._id) === String(terms.ngrDefinitionId) &&
        (terms.ngrDefinitionVersion == null || def.version === terms.ngrDefinitionVersion)
      ));
      if (!ngrDef) {
        const err = new Error('NGR definition was not found for the configured commercial terms.');
        err.code = 'ERR_NGR_DEFINITION_NOT_FOUND';
        throw err;
      }

      const components = Array.isArray(ngrDef.ggrComponents) && ngrDef.ggrComponents.length > 0
        ? new Set(ngrDef.ggrComponents)
        : new Set(['casino', 'sports']);
      const casinoGgrCents = components.has('casino') ? toMinorUnits(stat.casinoGgr || 0) : 0;
      const sportsGgrCents = components.has('sports') ? toMinorUnits(stat.sportsGgrRealized || 0) : 0;
      const casinoTurnoverCents = components.has('casino') ? toMinorUnits(stat.casinoTurnover || 0) : 0;
      const sportsTurnoverCents = components.has('sports') ? toMinorUnits(stat.sportsTurnover || 0) : 0;

      const ggrCents = casinoGgrCents + sportsGgrCents;
      const turnoverCents = casinoTurnoverCents + sportsTurnoverCents;

      const feePlan = findActiveFeePlan(feePlans, stat.tenantId, stat.date);
      const deductions = [];
      let totalDeductionsCents = 0;

      for (const item of (ngrDef.items || []).filter((i) => i?.enabled)) {
        let amountCents = 0;
        if (item.source === 'stat_field') {
          amountCents = toMinorUnits(stat[item.params?.field] || 0);
        } else if (item.source === 'fee_plan' && item.params?.component === 'sportsbookFee') {
          const sb = feePlan?.sportsbookFee;
          if (sb && (sb.model === 'turnover_percentage' || sb.model === 'both')) {
            amountCents = multiplyMinorUnitsByRate(toMinorUnits(stat.sportsTurnover || 0), sb.turnoverRate || 0);
          }
        } else if (item.source === 'rate') {
          const targetCents = item.params?.target === 'turnover' ? turnoverCents : ggrCents;
          amountCents = multiplyMinorUnitsByRate(targetCents, item.params?.rate || 0);
        } else if (item.source === 'fixed' && (item.params?.period ?? 'day') === 'day') {
          amountCents = toMinorUnits(item.params?.amount || 0);
        }

        totalDeductionsCents += amountCents;
        deductions.push({
          category: item.category,
          label: item.label,
          source: item.source,
          amount: fromMinorUnits(amountCents),
        });
      }

      const ngrCents = ggrCents - totalDeductionsCents;
      const negativeBaseHandling = terms.negativeBaseHandling || terms.negativeGgrHandling || 'zero_floor';
      const effectiveNgrCents = ngrCents < 0 && negativeBaseHandling === 'zero_floor' ? 0 : ngrCents;
      const rate = terms.rate ?? 0.15;
      const commissionCents = multiplyMinorUnitsByRate(effectiveNgrCents, rate);

      byCurrency[currency].lines.push({
        tenantId: stat.tenantId,
        linkId: link?._id || null,
        type: 'commission',
        date: stat.date,
        currency,
        baseMetric: 'ngr',
        baseAmount: fromMinorUnits(ngrCents),
        rate,
        amount: fromMinorUnits(commissionCents),
        description: `${Number((rate * 100).toPrecision(12))}% NGR Commission for ${stat.date}`,
        metadata: {
          ggr: fromMinorUnits(ggrCents),
          totalDeductions: fromMinorUnits(totalDeductionsCents),
          ngr: fromMinorUnits(ngrCents),
          deductions,
          negativeBaseHandling,
          ngrDefinitionId: ngrDef._id,
          ngrDefinitionVersion: ngrDef.version,
        },
      });

      byCurrency[currency]._grossAmountCents += commissionCents;
      byCurrency[currency].grossAmount = fromMinorUnits(byCurrency[currency]._grossAmountCents);
    }
  }

  for (const curr of Object.keys(byCurrency)) {
    const group = byCurrency[curr];
    group.netAmount = group.grossAmount;
    delete group._grossAmountCents;
  }

  return byCurrency;
}

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
      partner.commercialTerms,
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

    let calculationsByCurrency;
    try {
      calculationsByCurrency = calculateCommissionForPeriod({
        partner,
        links,
        stats,
        feePlans,
        ngrDefinitions,
      });
    } catch (err) {
      if (err.code === 'ERR_NGR_NOT_IMPLEMENTED') {
        calculationsByCurrency = calculateNgrFallback({
          partner,
          links,
          stats,
          feePlans,
          ngrDefinitions,
        });
      } else {
        throw err;
      }
    }

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
