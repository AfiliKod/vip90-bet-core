import mongoose from 'mongoose';
import { onScopeViolation } from '../../tenancy/tenantScoped.js';

/**
 * N6 gates (spec §6.2): the new central install must show zero TenantScopeError
 * for 14 consecutive days on staging and 7 on production after the first tenant.
 *
 * Every scope violation (enforce throws as well as log-mode warnings) is counted
 * per UTC day in the platform collection `scopegatedays`, so the count survives
 * restarts and covers every process. A day with no document is a clean day once
 * telemetry has started (the first document marks the start).
 */

export const STAGING_REQUIRED_DAYS = 14;
export const PRODUCTION_REQUIRED_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const scopeGateDaySchema = new mongoose.Schema({
  environment: { type: String, required: true }, // e.g. 'staging', 'production'
  day: { type: String, required: true }, // UTC YYYY-MM-DD
  count: { type: Number, default: 0 },
  lastSample: { model: String, op: String, reason: String },
}, { timestamps: true });
scopeGateDaySchema.index({ environment: 1, day: 1 }, { unique: true });

// Platform model: never tenant-scoped.
export const ScopeGateDay = mongoose.models.ScopeGateDay
  || mongoose.model('ScopeGateDay', scopeGateDaySchema);

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** Records one violation for `environment` on the current UTC day. */
export async function recordScopeViolation({ environment, event = {}, now = new Date() }) {
  await ScopeGateDay.updateOne(
    { environment, day: utcDay(now) },
    { $inc: { count: 1 }, $set: { lastSample: { model: event.model, op: event.op, reason: event.reason } } },
    { upsert: true },
  );
}

/** Marks the start of the measured window (idempotent): a zero-count row for that day. */
export async function startScopeTelemetry({ environment, now = new Date() }) {
  await ScopeGateDay.updateOne(
    { environment, day: utcDay(now) },
    { $setOnInsert: { count: 0 } },
    { upsert: true },
  );
}

/**
 * Consecutive clean days ending today (today counts only while clean), counted
 * back to the first recorded day of `environment`.
 */
export async function evaluateGate({ environment, requiredDays, now = new Date() }) {
  const rows = await ScopeGateDay.find({ environment }).sort({ day: 1 }).lean();
  if (rows.length === 0) {
    return { environment, requiredDays, started: false, consecutiveCleanDays: 0, totalViolations: 0, gatePassed: false };
  }
  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  const firstDay = rows[0].day;
  let clean = 0;
  for (let t = Date.parse(`${utcDay(now)}T00:00:00Z`); utcDay(new Date(t)) >= firstDay; t -= DAY_MS) {
    if ((byDay.get(utcDay(new Date(t))) || 0) > 0) break;
    clean += 1;
  }
  const totalViolations = rows.reduce((sum, r) => sum + (r.count || 0), 0);
  const last = [...rows].reverse().find((r) => r.count > 0);
  return {
    environment,
    requiredDays,
    started: true,
    since: firstDay,
    consecutiveCleanDays: clean,
    totalViolations,
    lastViolationDay: last?.day || null,
    lastSample: last?.lastSample || null,
    gatePassed: clean >= requiredDays,
  };
}

export async function evaluateGates({ now = new Date() } = {}) {
  return {
    staging: await evaluateGate({ environment: 'staging', requiredDays: STAGING_REQUIRED_DAYS, now }),
    production: await evaluateGate({ environment: 'production', requiredDays: PRODUCTION_REQUIRED_DAYS, now }),
  };
}

/**
 * Subscribes to the tenancy guard and persists every violation for this
 * install's environment (SCOPE_GATE_ENV, e.g. 'staging' or 'production').
 * Without SCOPE_GATE_ENV nothing is recorded. Returns an unsubscribe function.
 */
export function installScopeTelemetry({ environment = process.env.SCOPE_GATE_ENV } = {}) {
  if (!environment) return () => {};
  startScopeTelemetry({ environment }).catch(() => {});
  return onScopeViolation((event) => {
    recordScopeViolation({ environment, event }).catch((error) => {
      console.error(`[scope-telemetry] record failed: ${error.message}`);
    });
  });
}
