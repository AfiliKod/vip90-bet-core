import mongoose from 'mongoose';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOnlineCount } from './onlineCount.js';
import { snapshot as syncHealthSnapshot } from './syncHealth.js';

// package.json'dan sürüm bilgisini bir kez oku (modül yüklenirken)
let pkgVersion = 'unknown';
try {
  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
  pkgVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || 'unknown';
} catch { /* sürüm okunamazsa unknown kalır */ }

/**
 * Comprehensive Health Service
 * Provides system health checks, service monitoring, and operational metrics
 */

// Service health registry
const serviceHealth = new Map();

/**
 * Register a service for health monitoring
 */
export function registerService(name, healthCheckFn, options = {}) {
  serviceHealth.set(name, {
    name,
    healthCheck: healthCheckFn,
    interval: options.interval || 30000,
    timeout: options.timeout || 5000,
    lastCheck: null,
    lastStatus: null,
    lastError: null,
    history: [],
  });
}

/**
 * Check health of a single service
 */
async function checkServiceHealth(service) {
  const start = Date.now();
  try {
    const result = await Promise.race([
      service.healthCheck(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), service.timeout)
      ),
    ]);
    
    const duration = Date.now() - start;
    const status = result ? 'ok' : 'fail';
    
    service.lastCheck = new Date();
    service.lastStatus = status;
    service.lastError = null;
    
    // Keep last 10 checks in history
    service.history.push({ status, duration, timestamp: new Date() });
    if (service.history.length > 10) service.history.shift();
    
    return { name: service.name, status, duration, detail: result };
  } catch (error) {
    const duration = Date.now() - start;
    service.lastCheck = new Date();
    service.lastStatus = 'fail';
    service.lastError = error.message;
    
    service.history.push({ status: 'fail', duration, timestamp: new Date(), error: error.message });
    if (service.history.length > 10) service.history.shift();
    
    return { name: service.name, status: 'fail', duration, detail: error.message };
  }
}

/**
 * Get system information
 */
export function getSystemInfo() {
  // Disk kullanımı: fs.statfsSync cross-platform basit yaklaşım (macOS/Linux)
  let diskUsed = null;
  let diskTotal = null;
  try {
    const st = fs.statfsSync(process.cwd());
    diskUsed = (st.blocks - st.bfree) * st.bsize;
    diskTotal = st.blocks * st.bsize;
  } catch { /* statfs desteklenmiyorsa null kalır */ }

  return {
    uptime: process.uptime(),
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
      usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2),
    },
    cpu: {
      model: os.cpus()[0]?.model || 'unknown',
      cores: os.cpus().length,
      loadAvg: os.loadavg(),
    },
    diskUsed,
    diskTotal,
    platform: os.platform(),
    nodeVersion: process.version,
    pid: process.pid,
  };
}

/**
 * Get database health
 */
export async function getDatabaseHealth() {
  const start = Date.now();
  try {
    const state = mongoose.connection.readyState;
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    
    if (state !== 1) {
      return { status: 'fail', detail: `Database ${states[state] || 'unknown'}`, duration: Date.now() - start };
    }
    
    // Test actual query performance
    await mongoose.connection.db.admin().ping();
    const duration = Date.now() - start;
    
    // Get collection stats
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    return {
      status: 'ok',
      detail: 'Database connected and responsive',
      duration,
      collections: collections.length,
      connection: {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name,
      },
    };
  } catch (error) {
    return { status: 'fail', detail: error.message, duration: Date.now() - start };
  }
}

/**
 * Get online users count
 */
export function getOnlineUsers() {
  return { count: getOnlineCount() };
}

/**
 * Get sync health
 */
export function getSyncHealth() {
  try {
    return syncHealthSnapshot();
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Run comprehensive health check
 */
export async function runComprehensiveHealthCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    // Health.jsx'in beklediği üst seviye alanlar
    version: pkgVersion,
    env: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    lastCheck: new Date().toISOString(),
    system: getSystemInfo(),
    services: [],
    database: null,
    online: null,
    sync: null,
  };

  // Check database
  results.database = await getDatabaseHealth();

  // Check registered services
  const serviceChecks = [];
  for (const [name, service] of serviceHealth) {
    serviceChecks.push(checkServiceHealth(service));
  }
  results.services = await Promise.all(serviceChecks);

  // Get online users
  results.online = getOnlineUsers();

  // Get sync health
  results.sync = getSyncHealth();

  // Calculate overall status
  const hasFailures = results.services.some(s => s.status === 'fail') || 
                     results.database.status === 'fail';
  results.status = hasFailures ? 'degraded' : 'ok';

  return results;
}

/**
 * Get service health summary
 */
export function getServiceHealthSummary() {
  const summary = [];
  for (const [name, service] of serviceHealth) {
    summary.push({
      name,
      status: service.lastStatus || 'unknown',
      lastCheck: service.lastCheck,
      lastError: service.lastError,
      history: service.history.slice(-5),
    });
  }
  return summary;
}

/**
 * Get operational metrics
 */
export function getOperationalMetrics() {
  return {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
    // _getActiveHandles() bir DİZİ döndürür, sayı değil — diziyi olduğu gibi
    // JSON'lamak socket'lerin dairesel `next` referansına takılıp
    // "Converting circular structure to JSON" ile 500 veriyordu (ve
    // `|| 0` boş dizide de çalışmadığı için metrics hep patlıyordu).
    // Bu yüzden yalnızca SAYI döndürülür.
    activeHandles: process._getActiveHandles?.().length ?? 0,
    activeRequests: process._getActiveRequests?.().length ?? 0,
  };
}

// Register default services
registerService('database', async () => {
  const state = mongoose.connection.readyState;
  return state === 1;
}, { interval: 10000 });

registerService('memory', () => {
  const free = os.freemem();
  const total = os.totalmem();
  const usagePercent = (total - free) / total * 100;
  return usagePercent < 90;
}, { interval: 30000 });

registerService('cpu', () => {
  const loadAvg = os.loadavg();
  const cores = os.cpus().length;
  return loadAvg[0] < cores * 2;
}, { interval: 30000 });
