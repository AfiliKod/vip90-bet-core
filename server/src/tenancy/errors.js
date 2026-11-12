/**
 * Thrown when an operation would touch data outside the current tenant (or
 * with no tenant at all) while TENANCY_ENFORCEMENT is "enforce". Carries the
 * model/operation details so error handlers and logs can pinpoint the leak.
 */
export class TenantScopeError extends Error {
  constructor(message, { model = null, op = null, reason = 'unscoped' } = {}) {
    super(message);
    this.name = 'TenantScopeError';
    this.code = 'TENANT_SCOPE';
    this.status = 500;
    this.model = model;
    this.op = op;
    this.reason = reason;
  }
}
