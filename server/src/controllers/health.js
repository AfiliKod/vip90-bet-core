import {
  runComprehensiveHealthCheck,
  getServiceHealthSummary,
  getOperationalMetrics,
  getSystemInfo,
  getDatabaseHealth,
} from '../services/health.js';

/**
 * GET /api/admin/health
 * Comprehensive health check for admin dashboard
 */
export async function getHealthOverview(req, res, next) {
  try {
    const health = await runComprehensiveHealthCheck();
    res.json(health);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/health/services
 * Service health summary
 */
export async function getServiceHealth(req, res, next) {
  try {
    const services = getServiceHealthSummary();
    res.json({ services });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/health/system
 * System information
 */
export async function getSystemHealth(req, res, next) {
  try {
    const system = getSystemInfo();
    const database = await getDatabaseHealth();
    res.json({ system, database });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/health/metrics
 * Operational metrics
 */
export async function getMetrics(req, res, next) {
  try {
    const metrics = getOperationalMetrics();
    res.json({ metrics });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/health/check
 * Force run health check
 */
export async function forceHealthCheck(req, res, next) {
  try {
    const health = await runComprehensiveHealthCheck();
    res.json(health);
  } catch (error) {
    next(error);
  }
}
