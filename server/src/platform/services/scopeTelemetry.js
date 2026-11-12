import { getScopeViolationStats } from '../../tenancy/tenantScoped.js';

export class ScopeTelemetryService {
  constructor() {
    this.windowStart = new Date();
  }

  evaluateGates({
    stagingDaysActive = 0,
    stagingViolations = 0,
    prodDaysActive = 0,
    prodViolations = 0,
  } = {}) {
    const liveStats = typeof getScopeViolationStats === 'function' ? getScopeViolationStats() : { count: 0 };
    const totalStagingViolations = stagingViolations + (liveStats.count || 0);

    const STAGING_REQUIRED_DAYS = 14;
    const PROD_REQUIRED_DAYS = 7;

    const stagingPassed = totalStagingViolations === 0 && stagingDaysActive >= STAGING_REQUIRED_DAYS;
    const prodPassed = prodViolations === 0 && prodDaysActive >= PROD_REQUIRED_DAYS;

    return {
      staging: {
        requiredDays: STAGING_REQUIRED_DAYS,
        consecutiveCleanDays: totalStagingViolations === 0 ? stagingDaysActive : 0,
        totalViolations: totalStagingViolations,
        gatePassed: stagingPassed,
      },
      production: {
        requiredDays: PROD_REQUIRED_DAYS,
        consecutiveCleanDays: prodViolations === 0 ? prodDaysActive : 0,
        totalViolations: prodViolations,
        gatePassed: prodPassed,
      },
    };
  }
}

export const scopeTelemetry = new ScopeTelemetryService();
