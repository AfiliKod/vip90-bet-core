#!/usr/bin/env node
/**
 * K3 — Sağlık kontrolü CLI.
 *
 * Kullanım:
 *   node scripts/healthcheck.js
 *
 * Kurulum sonrası sistemin kendi durumunu raporlar: DB bağlantısı, zorunlu
 * env değişkenleri, temel servis yapılandırması, bekleyen migration ve
 * tohumlama durumu. Çıkış kodu: 0 sağlıklı (warn'lar hariç), 1 sorunlu —
 * Docker healthcheck / izleme araçlarıyla kullanılabilir.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { runHealthChecks } from '../src/health/checks.js';
import Setting from '../src/models/Setting.js';
import { discoverMigrations } from '../migrations/index.js';
import { createMigrationRunner } from '../migrations/runner.js';

const ICON = { ok: '✔', warn: '•', fail: '✗' };

try {
  // Bağlantı kurulamazsa raporu yine de bas — dbState 0 ile "fail" görünür.
  await mongoose.connect(process.env.MONGODB_URI).catch(() => {});

  const Migration = (await import('../src/models/Migration.js')).default;
  const migrations = await discoverMigrations();
  const runner = createMigrationRunner({
    migrations,
    getApplied: async () => {
      const rows = await Migration.find().select('name').lean().catch(() => []);
      return rows.map(r => r.name);
    },
    markApplied: async () => {}, // healthcheck salt-okunurdur, işaretlemez
  });

  const report = await runHealthChecks({
    dbState: () => mongoose.connection.readyState,
    env: process.env,
    pendingMigrations: async () => (await runner.pending()).map(m => m.name),
    settingModel: Setting,
  });

  console.log('VIP90.bet sağlık kontrolü');
  console.log('─'.repeat(50));
  for (const c of report.checks) {
    console.log(`${ICON[c.status]} [${c.status.toUpperCase().padEnd(4)}] ${c.name.padEnd(24)} ${c.detail}`);
  }
  console.log('─'.repeat(50));
  console.log(report.ok ? 'SONUÇ: sistem sağlıklı' : 'SONUÇ: SORUN VAR (fail kayıtları yukarıda)');

  await mongoose.disconnect();
  process.exit(report.ok ? 0 : 1);
} catch (e) {
  console.error('✗ Sağlık kontrolü çalıştırılamadı:', e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
}
