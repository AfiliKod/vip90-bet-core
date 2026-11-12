import mongoose from 'mongoose';
import { tenantContext } from './context.js';
import { registerTenantCollection, tenantScoped } from './tenantScoped.js';

const tenantModels = new Map();

/**
 * Define a tenant-owned model and retain its schema for connection-specific
 * compilation.
 * @param {string} name
 * @param {mongoose.Schema} schema
 * @returns {mongoose.Model}
 */
export function defineTenantModel(name, schema) {
  if (tenantModels.has(name)) {
    throw new Error(`Tenant model already defined: ${name}`);
  }

  if (!schema.$tenantScoped) schema.plugin(tenantScoped);
  const model = mongoose.model(name, schema);
  registerTenantCollection(model.collection.collectionName);
  tenantModels.set(name, { name, schema });
  return model;
}

/**
 * Get a tenant model compiled for the ambient connection.
 * @param {string} name
 * @returns {mongoose.Model}
 */
export function getTenantModel(name) {
  const entry = tenantModels.get(name);
  if (!entry) throw new Error(`Unknown tenant model: ${name}`);

  const conn = tenantContext.get()?.connection ?? mongoose.connection;
  return conn.models[name] ?? conn.model(name, entry.schema);
}

/** Return the names of registered tenant models in definition order. */
export function listTenantModelNames() {
  return [...tenantModels.keys()];
}
