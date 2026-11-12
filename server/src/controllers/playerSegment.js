import { scopeTenantId } from '../tenancy/tenantFilter.js';
import {
  createSegment,
  getSegments,
  getSegmentById as getSegmentByIdService,
  getSegmentBySlug as getSegmentBySlugService,
  updateSegment as updateSegmentService,
  deleteSegment as deleteSegmentService,
  computeSegmentPlayers as computeSegmentPlayersService,
  getSegmentPlayers as getSegmentPlayersService,
  getSegmentStats as getSegmentStatsService,
  updateAllSegmentStats,
} from '../services/playerSegment.js';
import { createError } from '../middleware/error.js';

/**
 * The tenant the request is bound to. `null` outside a tenant context keeps
 * the legacy single-operator behaviour.
 * @param {import('express').Request} req
 * @returns {{ tenantId: any }}
 */
function tenantScope(req) {
  return { tenantId: scopeTenantId(req) };
}

/**
 * POST /api/admin/segments
 * Create a new player segment
 */
export async function createSegmentHandler(req, res, next) {
  try {
    const segment = await createSegment({
      ...req.body,
      createdBy: req.user.id,
    });
    res.status(201).json({ segment });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/segments
 * Get all segments
 */
export async function getSegmentsHandler(req, res, next) {
  try {
    const { page, limit, isActive, search } = req.query;
    const result = await getSegments({
      page,
      limit,
      isActive: isActive !== undefined ? isActive === 'true' : null,
      search: search || '',
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/segments/:id
 * Get segment by ID. A segment of another tenant answers 404 (spec §9 G-3).
 */
export async function getSegmentById(req, res, next) {
  try {
    const segment = await getSegmentByIdService(req.params.id, tenantScope(req));
    if (!segment) throw createError(404, 'NOT_FOUND', 'Segment not found');
    res.json({ segment });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/segments/slug/:slug
 * Get segment by slug
 */
export async function getSegmentBySlugHandler(req, res, next) {
  try {
    const segment = await getSegmentBySlugService(req.params.slug, tenantScope(req));
    if (!segment) throw createError(404, 'NOT_FOUND', 'Segment not found');
    res.json({ segment });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/segments/:id
 * Update segment
 */
export async function updateSegment(req, res, next) {
  try {
    const segment = await updateSegmentService(req.params.id, req.body, tenantScope(req));
    if (!segment) throw createError(404, 'NOT_FOUND', 'Segment not found');
    res.json({ segment });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/segments/:id
 * Delete segment
 */
export async function deleteSegment(req, res, next) {
  try {
    const deleted = await deleteSegmentService(req.params.id, tenantScope(req));
    if (!deleted) throw createError(404, 'NOT_FOUND', 'Segment not found');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/segments/:id/compute
 * Compute players matching segment criteria
 */
export async function computeSegmentPlayers(req, res, next) {
  try {
    const { players, count } = await computeSegmentPlayersService(req.params.id, {
      limit: req.body?.limit,
      ...tenantScope(req),
    });
    res.json({ players, count });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/segments/:id/players
 * Get players for a segment (with pagination)
 */
export async function getSegmentPlayers(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await getSegmentPlayersService(req.params.id, {
      page,
      limit,
      ...tenantScope(req),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/segments/:id/stats
 * Get segment statistics
 */
export async function getSegmentStats(req, res, next) {
  try {
    const stats = await getSegmentStatsService(req.params.id, tenantScope(req));
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/segments/update-stats
 * Update all segment stats
 */
export async function updateAllSegmentStatsHandler(req, res, next) {
  try {
    const result = await updateAllSegmentStats();
    res.json(result);
  } catch (error) {
    next(error);
  }
}
