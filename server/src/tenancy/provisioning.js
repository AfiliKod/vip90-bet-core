import { runWithTenant } from './context.js';

/**
 * Registered provisioning hooks, in registration order. Each entry is
 * `{ fn, name }`; the unregister function removes its own entry by identity.
 * @type {Array<{ fn: Function, name: string }>}
 */
let provisioningHooks = [];

/**
 * Monotonic counter so anonymous hooks get unique fallback names even after
 * the registry is reset between tests.
 * @type {number}
 */
let hookCounter = 0;

/**
 * Credential form schemas by module id, registered once per premium add-on
 * at import time.
 * @type {Map<string, { moduleId: string, fields: Array<object>, validate?: Function }>}
 */
const credentialSchemas = new Map();

/**
 * Register a provisioning hook that runs when a tenant is provisioned
 * (İP-9a calls `runTenantProvisioningHooks`; nothing in core calls it yet).
 * @param {(tenant: object) => Promise<void>|void} fn
 * @param {{ name?: string }} [options]
 * @returns {() => void} unregister function
 */
export function registerTenantProvisioningHook(fn, { name } = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError('registerTenantProvisioningHook requires a function');
  }
  hookCounter += 1;
  const hook = { fn, name: name ?? (fn.name || `hook#${hookCounter}`) };
  provisioningHooks.push(hook);
  return () => {
    const index = provisioningHooks.indexOf(hook);
    if (index !== -1) provisioningHooks.splice(index, 1);
  };
}

/**
 * Run every registered hook sequentially in registration order, inside the
 * tenant context of `tenant._id`. Hooks fail loudly: the first error is
 * rethrown wrapped with the hook name so the caller (which retries
 * idempotently) knows exactly which add-on broke.
 * @param {{ _id: import('mongoose').Types.ObjectId|string }} tenant
 * @returns {Promise<Array<{ name: string, ok: true }>>}
 */
export async function runTenantProvisioningHooks(tenant) {
  const hooks = [...provisioningHooks];
  return runWithTenant(tenant._id, async () => {
    const results = [];
    for (const hook of hooks) {
      try {
        await hook.fn(tenant);
        results.push({ name: hook.name, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Provisioning hook "${hook.name}" failed: ${message}`, { cause: err });
      }
    }
    return results;
  });
}

/**
 * Register the credential form schema a premium module wants rendered for
 * tenant credentials. Registered once per `moduleId` at import time.
 * @param {string} moduleId
 * @param {{ fields: Array<{ key: string, label: string, secret?: boolean, required?: boolean }>, validate?: (values: object) => Promise<void>|void }} schema
 * @returns {void}
 */
export function registerTenantCredentialSchema(moduleId, schema) {
  if (typeof moduleId !== 'string' || moduleId === '') {
    throw new TypeError('registerTenantCredentialSchema requires a non-empty moduleId string');
  }
  if (credentialSchemas.has(moduleId)) {
    throw new Error(`Credential schema already registered: ${moduleId}`);
  }
  if (!schema || typeof schema !== 'object' || !Array.isArray(schema.fields) || schema.fields.length === 0) {
    throw new Error(`Credential schema "${moduleId}" requires a non-empty fields array`);
  }
  if (schema.validate !== undefined && typeof schema.validate !== 'function') {
    throw new TypeError(`Credential schema "${moduleId}" validate must be a function`);
  }
  const keys = new Set();
  for (const field of schema.fields) {
    if (!field || typeof field.key !== 'string' || field.key === '') {
      throw new TypeError(`Credential schema "${moduleId}" fields need a non-empty string key`);
    }
    if (keys.has(field.key)) {
      throw new Error(`Duplicate credential field key "${field.key}" in ${moduleId}`);
    }
    keys.add(field.key);
  }
  credentialSchemas.set(moduleId, {
    moduleId,
    fields: schema.fields.map((field) => ({ ...field })),
    ...(schema.validate ? { validate: schema.validate } : {}),
  });
}

/**
 * The stored schema for `moduleId`, or `null` when the module registered none.
 * @param {string} moduleId
 * @returns {{ moduleId: string, fields: Array<object>, validate?: Function }|null}
 */
export function getTenantCredentialSchema(moduleId) {
  return credentialSchemas.get(moduleId) ?? null;
}

/**
 * Every registered credential schema as `{ moduleId, fields }` entries.
 * @returns {Array<{ moduleId: string, fields: Array<object> }>}
 */
export function listTenantCredentialSchemas() {
  return [...credentialSchemas.values()].map(({ moduleId, fields }) => ({ moduleId, fields }));
}

/**
 * Drop every registration; tests only, so each case starts from a clean slate.
 * @returns {void}
 */
export function _resetTenancyRegistriesForTests() {
  provisioningHooks = [];
  credentialSchemas.clear();
}
