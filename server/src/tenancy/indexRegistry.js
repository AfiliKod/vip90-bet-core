/**
 * Registry of tenant compound indexes ({ tenantId, … }).
 *
 * These indexes are deliberately NOT declared with `schema.index()`: autoIndex
 * stays on for the existing indexes, and the new ones are built online by the
 * G4 migration (server/migrations/0006_tenancy_compound_indexes.js) and the G6
 * settings migration (server/migrations/0008_tenancy_settings.js) with
 * `collection.createIndex`. `syncIndexes` / `ensureIndexes` are never used,
 * because they drop indexes the schema does not list.
 *
 * Naming: `tenant_<field>[_<field>]_uniq` for unique, `tenant_<field>[_<field>]` otherwise.
 */

const registry = new Map(); // modelName -> [{ keys, options }]

/**
 * Register compound indexes for a tenant-owned model.
 * @param {string} modelName
 * @param {{ keys: Record<string, 1|-1>, options: { name: string, unique?: boolean, partialFilterExpression?: object, sparse?: boolean } }[]} specs
 */
export function registerTenantIndexes(modelName, specs) {
  if (typeof modelName !== 'string' || !modelName) throw new TypeError('registerTenantIndexes: modelName required');
  if (!Array.isArray(specs) || specs.length === 0) throw new TypeError(`registerTenantIndexes(${modelName}): specs must be a non-empty array`);
  const list = registry.get(modelName) ?? [];
  for (const spec of specs) {
    const keys = spec?.keys;
    const options = spec?.options ?? {};
    if (!keys || Object.keys(keys)[0] !== 'tenantId') {
      throw new TypeError(`registerTenantIndexes(${modelName}): keys must start with tenantId`);
    }
    if (typeof options.name !== 'string' || !options.name.startsWith('tenant_')) {
      throw new TypeError(`registerTenantIndexes(${modelName}): options.name must start with "tenant_"`);
    }
    if (options.unique && options.sparse) {
      // A compound sparse index still indexes documents whose optional field is
      // missing (tenantId is always set), so a unique+sparse compound index
      // rejects the second such document. Use partialFilterExpression instead.
      throw new TypeError(`registerTenantIndexes(${modelName}): ${options.name} is unique+sparse; use partialFilterExpression ({ field: { $type: ... } })`);
    }
    const existing = list.find(e => e.options.name === options.name);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify({ keys, options })) {
        throw new Error(`registerTenantIndexes(${modelName}): conflicting definition for ${options.name}`);
      }
      continue; // idempotent re-registration (module reloaded in tests)
    }
    list.push({ keys, options });
  }
  registry.set(modelName, list);
}

/** @returns {{ modelName: string, keys: object, options: object }[]} in registration order */
export function listTenantIndexes() {
  const out = [];
  for (const [modelName, list] of registry) {
    for (const { keys, options } of list) out.push({ modelName, keys, options });
  }
  return out;
}

/** Tests only. */
export function _resetTenantIndexes() {
  registry.clear();
}
