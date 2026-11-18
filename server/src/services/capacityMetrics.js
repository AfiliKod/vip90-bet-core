import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import CapacityWindow from '../models/CapacityWindow.js';
import { getTenancyMode } from '../config/tenancy.js';
import { writePlatformSystemEvent } from '../platform/services/platformAudit.js';

// İP-10a (spec §7.1): until an İP-10 threshold is crossed only measurement is
// done. Samples every 10 s, aggregates per 15-minute window, persists each
// window in the platform collection CapacityWindow (TTL 90 days).

export const SAMPLE_INTERVAL_MS = 10_000;
export const WINDOW_MS = 15 * 60_000;
export const APPROACHING_RATIO = 0.7;
export const CPU_EXCEEDED_WINDOWS = 3;
export const CPU_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_THRESHOLDS = Object.freeze({
  socketsP95: 2000,
  eventLoopP99Ms: 100,
  cpuPct: 70,
});

function envNumber(env, key, fallback) {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function capacityThresholds(env = process.env) {
  return {
    socketsP95: envNumber(env, 'CAPACITY_SOCKETS_P95', DEFAULT_THRESHOLDS.socketsP95),
    eventLoopP99Ms: envNumber(env, 'CAPACITY_EVENT_LOOP_P99_MS', DEFAULT_THRESHOLDS.eventLoopP99Ms),
    cpuPct: envNumber(env, 'CAPACITY_CPU_PCT', DEFAULT_THRESHOLDS.cpuPct),
  };
}

/** Nearest-rank percentile: p in (0, 100], values need not be sorted. */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1];
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Window aggregates from the 10 s samples: sockets p95, CPU average %.
 * The event-loop p99 comes from the window's monitorEventLoopDelay histogram
 * (reset each window), passed in already converted to milliseconds.
 */
export function aggregateWindow({ samples, eventLoopP99Ms }) {
  if (!samples.length) return null;
  const cpuAvg = samples.reduce((sum, s) => sum + s.cpuPct, 0) / samples.length;
  return {
    socketsP95: percentile(samples.map((s) => s.sockets), 95),
    eventLoopP99Ms: round2(Number.isFinite(eventLoopP99Ms) ? eventLoopP99Ms : 0),
    cpuPct: round2(cpuAvg),
  };
}

/** Connected sockets across every namespace of the io instance. */
export function countConnectedSockets(io) {
  if (!io) return 0;
  const namespaces = io._nsps ? [...io._nsps.values()] : [io.sockets];
  return namespaces.reduce((sum, ns) => sum + (ns?.sockets?.size || 0), 0);
}

function metricState(value, threshold) {
  if (value === null || value === undefined) return { state: 'ok', value: null, threshold };
  if (value > threshold) return { state: 'exceeded', value, threshold };
  if (value >= threshold * APPROACHING_RATIO) return { state: 'approaching', value, threshold };
  return { state: 'ok', value, threshold };
}

const STATE_RANK = { ok: 0, approaching: 1, exceeded: 2 };
const worstState = (states) => states.reduce((worst, s) => (STATE_RANK[s] > STATE_RANK[worst] ? s : worst), 'ok');

/**
 * Evaluate the latest window against the spec §7.1 thresholds (env-overridable).
 * CPU is `exceeded` only when at least 3 windows over the threshold exist within
 * the last 7 days; a single hot window is `approaching` at most.
 */
export async function evaluateCapacity({ now = new Date() } = {}) {
  const thresholds = capacityThresholds();
  const latest = await CapacityWindow.findOne({}).sort({ windowStart: -1 }).lean();
  const cpuWindowsOverThreshold = await CapacityWindow.countDocuments({
    windowStart: { $gte: new Date(now.getTime() - CPU_LOOKBACK_MS), $lte: now },
    cpuPct: { $gt: thresholds.cpuPct },
  });

  const sockets = metricState(latest?.socketsP95 ?? null, thresholds.socketsP95);
  const eventLoop = metricState(latest?.eventLoopP99Ms ?? null, thresholds.eventLoopP99Ms);

  const cpuValue = latest?.cpuPct ?? null;
  let cpu = metricState(cpuValue, thresholds.cpuPct);
  if (cpu.state === 'exceeded' && cpuWindowsOverThreshold < CPU_EXCEEDED_WINDOWS) {
    cpu = { ...cpu, state: 'approaching' };
  }
  cpu = { ...cpu, windowsOverThreshold: cpuWindowsOverThreshold, requiredWindows: CPU_EXCEEDED_WINDOWS };

  return {
    state: worstState([sockets.state, eventLoop.state, cpu.state]),
    evaluatedAt: now,
    windowStart: latest?.windowStart ?? null,
    sockets,
    eventLoop,
    cpu,
  };
}

// Alert once per state change into approaching/exceeded, not on every window.
const lastMetricStates = new Map();

export function resetCapacityAlertState() {
  lastMetricStates.clear();
}

export async function checkCapacityAlerts({ now = new Date() } = {}) {
  const evaluation = await evaluateCapacity({ now });
  for (const key of ['sockets', 'eventLoop', 'cpu']) {
    const metric = evaluation[key];
    const previous = lastMetricStates.get(key);
    lastMetricStates.set(key, metric.state);
    if (metric.state === previous) continue;
    if (metric.state !== 'approaching' && metric.state !== 'exceeded') continue;
    console.warn(`[capacity] ${key} ${metric.state}: value=${metric.value} threshold=${metric.threshold}`);
    if (getTenancyMode() === 'multi') {
      try {
        await writePlatformSystemEvent(`capacity:${key}:${metric.state}`, {
          reason: `${key} ${metric.state}`,
          metadata: { value: metric.value, threshold: metric.threshold, windowStart: evaluation.windowStart },
        });
      } catch (error) {
        console.warn(`[capacity] activity event write failed: ${error.message}`);
      }
    }
  }
  return evaluation;
}

/**
 * Start the 10 s sampler. The timer is unref'd so measurement never keeps the
 * process alive; returns a stop function. Works in both tenancy modes.
 */
export function startCapacitySampler({
  io = null,
  sampleIntervalMs = SAMPLE_INTERVAL_MS,
  windowMs = WINDOW_MS,
} = {}) {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let samples = [];
  let windowStart = new Date();
  let lastCpu = process.cpuUsage();
  let lastCpuAt = Date.now();

  const flush = async () => {
    const p99Ns = histogram.percentile(99);
    histogram.reset();
    const flushed = samples;
    samples = [];
    const start = windowStart;
    windowStart = new Date();
    const aggregates = aggregateWindow({
      samples: flushed,
      eventLoopP99Ms: Number.isFinite(p99Ns) ? p99Ns / 1e6 : 0,
    });
    if (!aggregates) return;
    try {
      await CapacityWindow.create({
        windowStart: start,
        host: os.hostname(),
        pid: process.pid,
        ...aggregates,
      });
    } catch (error) {
      console.warn(`[capacity] window write failed: ${error.message}`);
    }
    try {
      await checkCapacityAlerts();
    } catch (error) {
      console.warn(`[capacity] evaluation failed: ${error.message}`);
    }
  };

  const tick = () => {
    const now = Date.now();
    const cpu = process.cpuUsage();
    const wallMs = now - lastCpuAt;
    const cpuPct = wallMs > 0
      ? ((cpu.user - lastCpu.user) + (cpu.system - lastCpu.system)) / (wallMs * 1000) * 100
      : 0;
    lastCpu = cpu;
    lastCpuAt = now;
    samples.push({ sockets: countConnectedSockets(io), cpuPct });
    if (now - windowStart.getTime() >= windowMs) {
      flush().catch((error) => console.warn(`[capacity] flush failed: ${error.message}`));
    }
  };

  const timer = setInterval(tick, sampleIntervalMs);
  timer.unref();

  return function stopCapacitySampler() {
    clearInterval(timer);
    histogram.disable();
  };
}