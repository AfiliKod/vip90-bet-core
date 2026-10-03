import {
  getAllJurisdictions,
  getJurisdictionById,
  getJurisdictionByCode,
  getDefaultJurisdiction,
  createJurisdiction,
  updateJurisdiction,
  deleteJurisdiction,
  checkPlayerEligibility,
  getJurisdictionStats,
  getComplianceRules,
} from '../services/multiJurisdiction.js';

/**
 * GET /api/admin/jurisdictions
 * Get all jurisdictions
 */
export async function getAllJurisdictionsHandler(req, res, next) {
  try {
    const { page, limit, isActive, search } = req.query;
    const result = await getAllJurisdictions({ 
      page, 
      limit, 
      search,
      isActive: isActive !== undefined ? isActive === 'true' : null 
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/jurisdictions/default
 * Get default jurisdiction
 */
export async function getDefaultJurisdictionHandler(req, res, next) {
  try {
    const jurisdiction = await getDefaultJurisdiction();
    res.json({ jurisdiction });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/jurisdictions/stats
 * Get jurisdiction statistics
 */
export async function getJurisdictionStatsHandler(req, res, next) {
  try {
    const stats = await getJurisdictionStats();
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/jurisdictions/code/:code
 * Get jurisdiction by code
 */
export async function getJurisdictionByCodeHandler(req, res, next) {
  try {
    const jurisdiction = await getJurisdictionByCode(req.params.code);
    if (!jurisdiction) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Jurisdiction not found' } });
    }
    res.json({ jurisdiction });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/jurisdictions/:id
 * Get jurisdiction by ID
 */
export async function getJurisdictionByIdHandler(req, res, next) {
  try {
    const jurisdiction = await getJurisdictionById(req.params.id);
    if (!jurisdiction) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Jurisdiction not found' } });
    }
    res.json({ jurisdiction });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/jurisdictions
 * Create a new jurisdiction
 */
export async function createJurisdictionHandler(req, res, next) {
  try {
    const jurisdiction = await createJurisdiction({
      ...req.body,
      createdBy: req.user.id,
    });
    res.status(201).json({ jurisdiction });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/jurisdictions/:id
 * Update jurisdiction
 */
export async function updateJurisdictionHandler(req, res, next) {
  try {
    const jurisdiction = await updateJurisdiction(req.params.id, {
      ...req.body,
      updatedBy: req.user.id,
    });
    if (!jurisdiction) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Jurisdiction not found' } });
    }
    res.json({ jurisdiction });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/jurisdictions/:id
 * Delete jurisdiction
 */
export async function deleteJurisdictionHandler(req, res, next) {
  try {
    await deleteJurisdiction(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/jurisdictions/eligibility
 * Check player eligibility for jurisdiction
 */
export async function checkPlayerEligibilityHandler(req, res, next) {
  try {
    const { player, action, context } = req.body;
    const result = await checkPlayerEligibility(player, action, context);
    res.json({ result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/jurisdictions/code/:code/compliance
 * Get compliance rules for jurisdiction
 */
export async function getComplianceRulesHandler(req, res, next) {
  try {
    const rules = await getComplianceRules(req.params.code);
    if (!rules) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Jurisdiction not found' } });
    }
    res.json({ rules });
  } catch (error) {
    next(error);
  }
}
