import {
  createSegment,
  getSegments,
  getSegmentById,
  getSegmentBySlug,
  updateSegment,
  deleteSegment,
  computeSegmentPlayers,
  getSegmentPlayers,
  getSegmentStats,
  updateAllSegmentStats,
} from '../services/playerSegment.js';

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
 * Get segment by ID
 */
export async function getSegmentByIdHandler(req, res, next) {
  try {
    const segment = await getSegmentById(req.params.id);
    if (!segment) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Segment not found' } });
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
    const segment = await getSegmentBySlug(req.params.slug);
    if (!segment) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Segment not found' } });
    res.json({ segment });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/segments/:id
 * Update segment
 */
export async function updateSegmentHandler(req, res, next) {
  try {
    const segment = await updateSegment(req.params.id, req.body);
    if (!segment) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Segment not found' } });
    res.json({ segment });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/segments/:id
 * Delete segment
 */
export async function deleteSegmentHandler(req, res, next) {
  try {
    await deleteSegment(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/segments/:id/compute
 * Compute players matching segment criteria
 */
export async function computeSegmentPlayersHandler(req, res, next) {
  try {
    const { players, count } = await computeSegmentPlayers(req.params.id, { limit: req.body.limit });
    res.json({ players, count });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/segments/:id/players
 * Get players for a segment (with pagination)
 */
export async function getSegmentPlayersHandler(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await getSegmentPlayers(req.params.id, { page, limit });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/segments/:id/stats
 * Get segment statistics
 */
export async function getSegmentStatsHandler(req, res, next) {
  try {
    const stats = await getSegmentStats(req.params.id);
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
