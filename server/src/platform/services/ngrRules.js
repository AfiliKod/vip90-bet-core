/**
 * NGR definition rules (K28), shared by the NgrDefinition model (save time)
 * and the commission calculator (run time). Pure: no database access.
 *
 * "The same cost is never deducted twice":
 * - at most one enabled item per category; 'other' items need distinct labels;
 * - a stat field or a fee plan component backs at most one item;
 * - nothing GGR is already net of may be deducted, including a stat field read
 *   under another category (bonusCost is a bonus cost whatever the label);
 * - 'rate' and 'fixed' items compute a new amount, so two of them on the same
 *   target (e.g. tax 15% of GGR and a content fee 10% of GGR) are two costs.
 */

/** The cost category each TenantDailyStat field represents. */
export const STAT_FIELD_CATEGORY = Object.freeze({
  bonusCost: 'bonus',
  providerFees: 'provider_fee',
  chargebacks: 'chargeback',
});

export const NGR_CATEGORIES = Object.freeze(['bonus', 'provider_fee', 'tax', 'chargeback', 'other']);
export const NGR_SOURCES = Object.freeze(['stat_field', 'fee_plan', 'rate', 'fixed']);
export const FIXED_PERIODS = Object.freeze(['day']);

function violation(code, message) {
  return { code, message };
}

/**
 * First rule a definition breaks, or null.
 * @param {{ items?: Array<object>, ggrAlreadyNetOf?: string[] }} definition
 * @returns {{ code: string, message: string } | null}
 */
export function findNgrRuleViolation(definition) {
  const enabledItems = (definition?.items || []).filter((item) => item?.enabled);
  const categories = new Set();
  const otherLabels = new Set();
  const sources = new Set();
  const alreadyNetOf = new Set(definition?.ggrAlreadyNetOf || []);

  for (const item of enabledItems) {
    if (!NGR_CATEGORIES.includes(item.category)) {
      return violation('ERR_NGR_UNKNOWN_CATEGORY', `Unknown deduction category "${item.category}".`);
    }
    if (!NGR_SOURCES.includes(item.source)) {
      return violation('ERR_NGR_UNKNOWN_SOURCE', `Unknown deduction source "${item.source}".`);
    }
    if (item.source === 'stat_field' && !STAT_FIELD_CATEGORY[item.params?.field]) {
      return violation('ERR_NGR_UNKNOWN_SOURCE', `Unknown stat field "${item.params?.field}".`);
    }
    if (item.source === 'fixed' && !FIXED_PERIODS.includes(item.params?.period ?? 'day')) {
      return violation('ERR_NGR_UNSUPPORTED_PERIOD', `Fixed deductions support the period(s): ${FIXED_PERIODS.join(', ')}.`);
    }

    if (item.category === 'other') {
      const label = String(item.label || '').trim().toLowerCase();
      if (otherLabels.has(label)) {
        return violation('ERR_NGR_DUPLICATE_LABEL', `Duplicate label "${item.label}" in category "other" is not allowed.`);
      }
      otherLabels.add(label);
    } else {
      if (categories.has(item.category)) {
        return violation('ERR_NGR_DUPLICATE_CATEGORY', `Category "${item.category}" cannot be deducted more than once.`);
      }
      categories.add(item.category);
    }

    let sourceKey = null;
    if (item.source === 'stat_field') sourceKey = `stat_field:${item.params.field}`;
    else if (item.source === 'fee_plan' && item.params?.component) sourceKey = `fee_plan:${item.params.component}`;
    if (sourceKey) {
      if (sources.has(sourceKey)) {
        return violation('ERR_NGR_DUPLICATE_SOURCE', `Source "${sourceKey}" is referenced by multiple deduction items.`);
      }
      sources.add(sourceKey);
    }

    const impliedCategory = item.source === 'stat_field' ? STAT_FIELD_CATEGORY[item.params.field] : null;
    if (alreadyNetOf.has(item.category) || (impliedCategory && alreadyNetOf.has(impliedCategory))) {
      return violation('ERR_NGR_ALREADY_NET_OF', `Category "${impliedCategory || item.category}" is already net in GGR and cannot be deducted again.`);
    }
  }
  return null;
}
