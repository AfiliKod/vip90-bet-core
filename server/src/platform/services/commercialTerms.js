import NgrDefinition from '../../models/NgrDefinition.js';
import { createError } from '../../middleware/error.js';

const MODELS = ['revshare_ggr', 'revshare_ngr', 'turnover', 'fixed'];
const BASES = ['ggr', 'ngr', 'turnover', 'fixed'];
// The base a model implies when the caller omits it (a mapping, not a commercial value).
const MODEL_BASE = { revshare_ggr: 'ggr', revshare_ngr: 'ngr', turnover: 'turnover', fixed: 'fixed' };

/** Terms with `base` filled from `model` when omitted. */
export function normalizeCommercialTerms(terms) {
  if (!terms || typeof terms !== 'object') return terms;
  return terms.base ? terms : { ...terms, base: MODEL_BASE[terms.model] };
}

/**
 * Commercial terms are configuration with no built-in values (K21, K28):
 * model, base and rate are required; base 'ngr' (or model revshare_ngr) must
 * name an existing NgrDefinition version. Throws a 400 createError.
 */
export async function assertValidCommercialTerms(input) {
  const terms = normalizeCommercialTerms(input);
  if (!terms || typeof terms !== 'object') throw createError(400, 'ERR_TERMS_REQUIRED', 'Commercial terms are required');
  if (!MODELS.includes(terms.model)) throw createError(400, 'ERR_TERMS_MODEL', `model must be one of ${MODELS.join(', ')}`);
  if (!BASES.includes(terms.base)) throw createError(400, 'ERR_TERMS_BASE', `base must be one of ${BASES.join(', ')}`);
  if (typeof terms.rate !== 'number' || !Number.isFinite(terms.rate) || terms.rate < 0 || terms.rate > 1) {
    throw createError(400, 'ERR_TERMS_RATE', 'rate must be a number between 0 and 1');
  }
  const usesNgr = terms.base === 'ngr' || terms.model === 'revshare_ngr';
  if (usesNgr) {
    if (terms.base !== 'ngr' || terms.model !== 'revshare_ngr') {
      throw createError(400, 'ERR_TERMS_BASE', 'NGR needs base "ngr" with model "revshare_ngr"');
    }
    if (!terms.ngrDefinitionId || !Number.isInteger(terms.ngrDefinitionVersion)) {
      throw createError(400, 'ERR_TERMS_NGR_DEFINITION', 'NGR terms need ngrDefinitionId and ngrDefinitionVersion');
    }
    const exists = await NgrDefinition.exists({ _id: terms.ngrDefinitionId, version: terms.ngrDefinitionVersion });
    if (!exists) throw createError(400, 'ERR_TERMS_NGR_DEFINITION', 'NGR definition version not found');
  }
  return terms;
}
