/**
 * Pure Commission & Sportsbook Fee Calculator Engine.
 *
 * Implements pure calculations for daily partner commissions, mid-period link rate changes,
 * negative GGR handling strategies, and K20 Sportsbook odds feed turnover fees.
 *
 * Ground Rules & Precision Model:
 * 1. Integer minor units (cents): Input amounts are converted to integer minor units once to avoid
 *    float representation inaccuracies.
 * 2. Rational arithmetic: Sums and multiplications are conducted in integer minor units / rationals.
 * 3. Rounding rule: Statement lines are rounded exactly once using half-away-from-zero rounding
 *    (+0.5 -> +1, -0.5 -> -1), preventing multi-step float rounding drift.
 * 4. Currency isolation: All lines and figures are strictly segregated per currency.
 */

/**
 * Monetary rounding helper: rounds half-up to specified decimal places (default 2).
 * Does not rely on `Math.round(x * 100) / 100` on raw floats to avoid floating-point
 * representation issues (such as 1.005 * 100 = 100.49999999999999).
 *
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {number}
 */
export function roundMoney(value, decimals = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const exp = Number(`${value}e${decimals}`);
  const rounded = Math.round(exp);
  return Number(`${rounded}e-${decimals}`);
}

/**
 * Convert a major currency amount (e.g. 10.50 TRY) to integer minor units (1050 cents).
 * Uses exponential conversion to prevent floating-point multiplication errors.
 *
 * @param {number} value
 * @returns {number} Integer cents
 */
export function toMinorUnits(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Number(`${value}e2`));
}

/**
 * Convert integer minor units (1050 cents) back to major currency units (10.50).
 *
 * @param {number} cents
 * @returns {number}
 */
export function fromMinorUnits(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) {
    return 0;
  }
  return Number(`${cents}e-2`);
}

/**
 * Convert a decimal rate into an exact rational { num, den } where both are integers.
 * E.g., 0.15 -> { num: 15, den: 100 }, 0.015 -> { num: 15, den: 1000 }.
 *
 * @param {number} num
 * @returns {{ num: number, den: number }}
 */
export function toRational(num) {
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return { num: 0, den: 1 };
  }
  if (Number.isInteger(num)) {
    return { num, den: 1 };
  }
  const s = String(num);
  const dot = s.indexOf('.');
  if (dot === -1) {
    return { num, den: 1 };
  }
  const dec = s.length - dot - 1;
  const den = 10 ** dec;
  const n = Math.round(Number(`${num}e${dec}`));
  return { num: n, den };
}

/**
 * Divide integer numerator by integer denominator, rounding half away from zero.
 * (e.g. +1.5 -> +2, -1.5 -> -2, +0.5 -> +1, -0.5 -> -1).
 *
 * @param {number} num Numerator
 * @param {number} den Denominator
 * @returns {number} Rounded integer
 */
export function divideRationalHalfAwayFromZero(num, den) {
  if (!den) return 0;
  const sign = (num < 0) ^ (den < 0) ? -1 : 1;
  const absNum = Math.abs(num);
  const absDen = Math.abs(den);
  const quotient = Math.floor(absNum / absDen);
  const rem = absNum % absDen;
  const rounded = rem * 2 >= absDen ? quotient + 1 : quotient;
  return sign * rounded;
}

/**
 * Multiply integer minor units (cents) by a numeric rate using rational arithmetic,
 * and round exactly once per statement line half away from zero.
 *
 * @param {number} cents Integer minor units
 * @param {number} rate Numeric rate (e.g. 0.15)
 * @returns {number} Rounded integer minor units
 */
export function multiplyMinorUnitsByRate(cents, rate) {
  const r = toRational(rate);
  return divideRationalHalfAwayFromZero(cents * r.num, r.den);
}

/**
 * Helper to extract ISO day boundaries (dayStart inclusive, dayEnd exclusive).
 */
function getDayBounds(dateInput) {
  let str;
  if (dateInput instanceof Date) {
    str = dateInput.toISOString().slice(0, 10);
  } else if (typeof dateInput === 'string') {
    str = dateInput.slice(0, 10);
  } else {
    str = String(dateInput).slice(0, 10);
  }
  const dayStart = new Date(`${str}T00:00:00.000Z`).getTime();
  const dayEnd = dayStart + 86400000;
  return { dayStart, dayEnd, dateStr: str };
}

/**
 * Resolve link active on a specific day (validFrom inclusive, validTo exclusive).
 *
 * @param {Array<object>} links
 * @param {string|object} tenantId
 * @param {string|Date} dateStr
 * @returns {object|undefined}
 */
export function findActiveLink(links = [], tenantId, dateStr) {
  if (!links || !Array.isArray(links)) return undefined;
  const { dayStart, dayEnd } = getDayBounds(dateStr);

  return links.find((link) => {
    if (String(link.tenantId) !== String(tenantId)) return false;
    const from = new Date(link.validFrom).getTime();
    const to = link.validTo ? new Date(link.validTo).getTime() : null;
    return from < dayEnd && (to === null || to > dayStart);
  });
}

/**
 * Resolve fee plan active on a specific day.
 *
 * @param {Array<object>} feePlans
 * @param {string|object} tenantId
 * @param {string|Date} dateStr
 * @returns {object|undefined}
 */
export function findActiveFeePlan(feePlans = [], tenantId, dateStr) {
  if (!feePlans || !Array.isArray(feePlans)) return undefined;
  const { dayStart, dayEnd } = getDayBounds(dateStr);

  return feePlans.find((plan) => {
    if (String(plan.tenantId) !== String(tenantId)) return false;
    const from = new Date(plan.validFrom).getTime();
    const to = plan.validTo ? new Date(plan.validTo).getTime() : null;
    return from < dayEnd && (to === null || to > dayStart);
  });
}

/**
 * Reject an NGR definition that would deduct the same cost more than once.
 * This mirrors model validation because this pure calculator may be called
 * with plain objects that did not pass through Mongoose.
 *
 * @param {object} ngrDef
 * @throws {Error} when enabled deductions overlap
 */
export function assertNoDoubleDeduction(ngrDef) {
  const enabledItems = (ngrDef?.items || []).filter((item) => item?.enabled);
  const categories = new Set();
  const otherLabels = new Set();
  const sources = new Set();
  const alreadyNetOf = new Set(ngrDef?.ggrAlreadyNetOf || []);

  const fail = (message) => {
    const err = new Error(message);
    err.code = 'ERR_NGR_DOUBLE_DEDUCTION';
    throw err;
  };

  for (const item of enabledItems) {
    if (alreadyNetOf.has(item.category)) {
      fail(`Category "${item.category}" is already net in GGR.`);
    }

    if (item.category === 'other') {
      const label = String(item.label || '').trim().toLowerCase();
      if (otherLabels.has(label)) {
        fail(`Duplicate label "${item.label}" in category "other".`);
      }
      otherLabels.add(label);
    } else {
      if (categories.has(item.category)) {
        fail(`Category "${item.category}" is deducted more than once.`);
      }
      categories.add(item.category);
    }

    let sourceKey = null;
    if (item.source === 'stat_field' && item.params?.field) {
      sourceKey = `stat_field:${item.params.field}`;
    } else if (item.source === 'fee_plan' && item.params?.component) {
      sourceKey = `fee_plan:${item.params.component}`;
    } else if (item.source === 'rate' && item.params?.target) {
      sourceKey = `rate:${item.params.target}`;
    }

    if (sourceKey) {
      if (sources.has(sourceKey)) {
        fail(`Source "${sourceKey}" is used more than once.`);
      }
      sources.add(sourceKey);
    }
  }
}

function resolveNgrDefinition(ngrDefinitions, terms) {
  return ngrDefinitions.find((definition) => (
    String(definition._id) === String(terms.ngrDefinitionId)
    && (terms.ngrDefinitionVersion == null || definition.version === terms.ngrDefinitionVersion)
  ));
}

function getNgrComponentCents(stat, ggrComponents) {
  const components = Array.isArray(ggrComponents) && ggrComponents.length > 0
    ? new Set(ggrComponents)
    : new Set(['casino', 'sports']);
  const casinoGgrCents = components.has('casino') ? toMinorUnits(stat.casinoGgr || 0) : 0;
  const sportsGgrCents = components.has('sports') ? toMinorUnits(stat.sportsGgrRealized || 0) : 0;
  const casinoTurnoverCents = components.has('casino') ? toMinorUnits(stat.casinoTurnover || 0) : 0;
  const sportsTurnoverCents = components.has('sports') ? toMinorUnits(stat.sportsTurnover || 0) : 0;

  return {
    ggrCents: casinoGgrCents + sportsGgrCents,
    turnoverCents: casinoTurnoverCents + sportsTurnoverCents,
  };
}

function calculateSportsbookFeeCents(feePlan, sportsTurnoverCents) {
  const sportsbookFee = feePlan?.sportsbookFee;
  if (!sportsbookFee || !['turnover_percentage', 'both'].includes(sportsbookFee.model)) {
    return 0;
  }
  return multiplyMinorUnitsByRate(sportsTurnoverCents, sportsbookFee.turnoverRate || 0);
}

/**
 * Calculate commission and fees for a set of TenantDailyStat entries.
 * Pure function: never mutates inputs or performs database calls.
 *
 * Calculations convert each input value to integer minor units (cents) once,
 * sum in integer minor units, and round line amounts exactly once using half away
 * from zero. Running totals are accumulated in integer cents to eliminate float drift.
 *
 * @param {object} params
 * @param {object} [params.partner]
 * @param {Array<object>} [params.links=[]]
 * @param {Array<object>} [params.stats=[]]
 * @param {Array<object>} [params.feePlans=[]]
 * @param {Array<object>} [params.ngrDefinitions=[]]
 * @returns {Record<string, { currency: string, lines: Array<object>, grossAmount: number, netAmount: number }>}
 */
export function calculateCommissionForPeriod({ partner, links = [], stats = [], feePlans = [], ngrDefinitions = [] }) {
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
    const terms = link?.commercialTerms || partner?.defaultCommercialTerms || { model: 'revshare_ggr', rate: 0.15 };

    const model = terms.model || (terms.base === 'turnover' ? 'turnover' : 'revshare_ggr');

    // 1. Commission line calculation
    if (model === 'revshare_ngr' || terms.base === 'ngr') {
      const ngrDef = resolveNgrDefinition(ngrDefinitions, terms);
      if (!ngrDef) {
        const err = new Error('NGR definition was not found for the configured commercial terms.');
        err.code = 'ERR_NGR_DEFINITION_NOT_FOUND';
        throw err;
      }
      assertNoDoubleDeduction(ngrDef);

      const { ggrCents, turnoverCents } = getNgrComponentCents(stat, ngrDef.ggrComponents);
      const feePlan = findActiveFeePlan(feePlans, stat.tenantId, stat.date);
      const deductions = [];
      let totalDeductionsCents = 0;

      for (const item of (ngrDef.items || []).filter((candidate) => candidate?.enabled)) {
        let amountCents = 0;
        if (item.source === 'stat_field') {
          amountCents = toMinorUnits(stat[item.params?.field] || 0);
        } else if (item.source === 'fee_plan' && item.params?.component === 'sportsbookFee') {
          amountCents = calculateSportsbookFeeCents(feePlan, toMinorUnits(stat.sportsTurnover || 0));
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
    } else if (model === 'revshare_ggr' || terms.base === 'ggr') {
      const casinoGgrCents = toMinorUnits(stat.casinoGgr || 0);
      const sportsGgrCents = toMinorUnits(stat.sportsGgrRealized || 0);
      const dayGgrCents = casinoGgrCents + sportsGgrCents;
      const dayGgr = fromMinorUnits(dayGgrCents);

      const rate = terms.rate ?? 0.15;
      let effectiveGgrCents = dayGgrCents;

      if (dayGgrCents < 0) {
        const handling = terms.negativeGgrHandling || 'zero_floor';
        if (handling === 'zero_floor') {
          effectiveGgrCents = 0;
        }
      }

      // Round line commission exactly once using half-away-from-zero in integer minor units
      const commissionCents = multiplyMinorUnitsByRate(effectiveGgrCents, rate);
      const commission = fromMinorUnits(commissionCents);

      byCurrency[currency].lines.push({
        tenantId: stat.tenantId,
        linkId: link?._id || null,
        type: 'commission',
        date: stat.date,
        currency,
        baseMetric: 'ggr',
        baseAmount: dayGgr,
        rate,
        amount: commission,
        description: `${Number((rate * 100).toPrecision(12))}% GGR Commission for ${stat.date}`,
        metadata: {
          casinoGgr: stat.casinoGgr || 0,
          sportsGgrRealized: stat.sportsGgrRealized || 0,
          negativeGgrHandling: terms.negativeGgrHandling || 'zero_floor',
        },
      });

      byCurrency[currency]._grossAmountCents += commissionCents;
      byCurrency[currency].grossAmount = fromMinorUnits(byCurrency[currency]._grossAmountCents);
    } else if (model === 'turnover' || terms.base === 'turnover') {
      const casinoTurnoverCents = toMinorUnits(stat.casinoTurnover || 0);
      const sportsTurnoverCents = toMinorUnits(stat.sportsTurnover || 0);
      const dayTurnoverCents = casinoTurnoverCents + sportsTurnoverCents;
      const dayTurnover = fromMinorUnits(dayTurnoverCents);

      const rate = terms.rate ?? 0.05;
      const commissionCents = multiplyMinorUnitsByRate(dayTurnoverCents, rate);
      const commission = fromMinorUnits(commissionCents);

      byCurrency[currency].lines.push({
        tenantId: stat.tenantId,
        linkId: link?._id || null,
        type: 'commission',
        date: stat.date,
        currency,
        baseMetric: 'turnover',
        baseAmount: dayTurnover,
        rate,
        amount: commission,
        description: `${Number((rate * 100).toPrecision(12))}% Turnover Commission for ${stat.date}`,
      });

      byCurrency[currency]._grossAmountCents += commissionCents;
      byCurrency[currency].grossAmount = fromMinorUnits(byCurrency[currency]._grossAmountCents);
    } else if (model === 'fixed' || terms.base === 'fixed') {
      const fixedAmount = terms.fixedFee ?? terms.amount ?? 0;
      const fixedCents = toMinorUnits(fixedAmount);
      const commission = fromMinorUnits(fixedCents);

      byCurrency[currency].lines.push({
        tenantId: stat.tenantId,
        linkId: link?._id || null,
        type: 'fixed_fee',
        date: stat.date,
        currency,
        baseMetric: 'fixed',
        baseAmount: fixedAmount,
        rate: 0,
        amount: commission,
        description: `Fixed Fee for ${stat.date}`,
      });

      byCurrency[currency]._grossAmountCents += fixedCents;
      byCurrency[currency].grossAmount = fromMinorUnits(byCurrency[currency]._grossAmountCents);
    }

    // 2. K20 Sportsbook odds feed fee calculation
    const feePlan = findActiveFeePlan(feePlans, stat.tenantId, stat.date);
    if (model !== 'revshare_ngr' && terms.base !== 'ngr' && feePlan?.sportsbookFee && feePlan.sportsbookFee.model !== 'none') {
      const sb = feePlan.sportsbookFee;
      if (sb.model === 'turnover_percentage' || sb.model === 'both') {
        const sportsTurnoverCents = toMinorUnits(stat.sportsTurnover || 0);
        const sportsTurnover = fromMinorUnits(sportsTurnoverCents);
        const rate = sb.turnoverRate || 0;
        const feeCents = multiplyMinorUnitsByRate(sportsTurnoverCents, rate);
        const feeAmount = fromMinorUnits(feeCents);

        if (feeAmount > 0) {
          byCurrency[currency].lines.push({
            tenantId: stat.tenantId,
            type: 'sportsbook_fee',
            date: stat.date,
            currency,
            baseMetric: 'turnover',
            baseAmount: sportsTurnover,
            rate,
            amount: feeAmount,
            description: `Sportsbook Odds Feed Fee (${Number((rate * 100).toPrecision(12))}%) for ${stat.date}`,
          });
        }
      }
    }
  }

  // Calculate net amount for each currency
  for (const curr of Object.keys(byCurrency)) {
    const group = byCurrency[curr];
    group.netAmount = group.grossAmount;
    delete group._grossAmountCents;
  }

  return byCurrency;
}
