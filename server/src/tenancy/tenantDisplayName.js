/**
 * Name the boot-time default tenant gets when it is created automatically
 * (tenancy/defaultTenant.js). It is a placeholder, not a brand.
 */
export const DEFAULT_TENANT_PLACEHOLDER_NAME = 'Default';

/**
 * A tenant name that may stand in for an unset site name. The auto-created
 * default tenant's placeholder name is not one: showing "Default" as the site
 * title, PWA name or email sender is worse than the install host fallback.
 */
export function brandableTenantName(tenant) {
  const name = tenant?.name;
  if (!name) return null;
  if (tenant.isDefault && name === DEFAULT_TENANT_PLACEHOLDER_NAME) return null;
  return name;
}
