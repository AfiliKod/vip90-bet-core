export function buildInternalHeaders(tenantId) {
  const headers = {};
  if (tenantId) headers['x-internal-tenant'] = String(tenantId);
  if (process.env.INTERNAL_API_TOKEN) headers['x-internal-token'] = process.env.INTERNAL_API_TOKEN;
  return headers;
}
