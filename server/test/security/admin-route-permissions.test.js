// V5 static guard (no DB): every admin route carries requirePermission.
//
// Two layers:
//  1. Mount inventory. The effective admin mounts are read from app.js
//     (router mounts only) and from the sub-router mounts inside
//     routes/admin.js; that set must equal the ADMIN_MOUNTS table, in both
//     directions. A new admin router that is not in the table fails here.
//  2. File audit. For each table entry the selected route lines must carry
//     `requirePermission(` (or the entry's `needle`). Every filter must select
//     at least one line, and mixed player/admin files must select exactly the
//     expected number of admin lines, so no check can pass vacuously.
// Plus: every routes/*.js file that uses requireAdmin in code is in the table,
// and the premium igames admin routes are checked when that module is present.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const VERBS = '(get|post|put|patch|delete)';
const routeLine = (v) => new RegExp(`^\\s*${v}\\.${VERBS}\\(`);

export const ADMIN_MOUNTS = [
  { prefix: '/api/admin', file: 'routes/admin.js', mode: 'per-line' },
  { prefix: '/api/admin', file: 'routes/adminModuleSettings.js', mode: 'per-line', count: 12 },
  { prefix: '/api/admin/analytics', file: 'routes/analytics.js', mode: 'router' },
  { prefix: '/api/admin/audit', file: 'routes/audit.js', mode: 'router' },
  { prefix: '/api/admin/modules', file: 'controllers/modules.js', mode: 'per-line', count: 3 },
  { prefix: '/api/admin/reconciliation', file: 'routes/reconciliation.js', mode: 'router' },
  { prefix: '/api/admin/agents', file: 'routes/agent.js', mode: 'router' },
  { prefix: '/api/admin/health', file: 'routes/health.js', mode: 'per-line' },
  { prefix: '/api/admin/segments', file: 'routes/playerSegment.js', mode: 'per-line' },
  // smsTemplate.js spreads `...read` / `...write` chains; both are checked below to contain requirePermission.
  { prefix: '/api/admin/sms', file: 'routes/smsTemplate.js', mode: 'per-line', needle: /requirePermission\(|\.\.\.(read|write),/ },
  { prefix: '/api/admin/currencies', file: 'routes/multiCurrency.js', mode: 'per-line' },
  { prefix: '/api/admin/brands', file: 'routes/multiBrand.js', mode: 'per-line' },
  { prefix: '/api/admin/jurisdictions', file: 'routes/multiJurisdiction.js', mode: 'per-line' },
  { prefix: '/api/admin/mail-templates', file: 'routes/adminMailTemplates.js', mode: 'per-line' },
  { prefix: '/api/admin/settings/seo', file: 'routes/seoAdmin.js', mode: 'per-line', count: 2 },
  { prefix: '/api/admin/risk', file: 'routes/risk.js', mode: 'per-line', routerVar: 'router' },
  { prefix: '/api/admin/responsible-gaming', file: 'routes/responsibleGaming.js', mode: 'router', routerVar: 'adminRouter' },
  // Mixed player/admin routers: only the admin lines are selected.
  { prefix: '/api/tickets', file: 'routes/ticket.js', mode: 'per-line', lineFilter: /requireAdmin/, count: 4 },
  { prefix: '/api/chat', file: 'routes/chat.js', mode: 'per-line', lineFilter: /'\/admin\//, count: 10 },
  { prefix: '/api/bank', file: 'routes/bank.js', mode: 'per-line', lineFilter: /'\/admin\//, count: 3 },
  { prefix: '/api/crypto', file: 'routes/crypto.js', mode: 'per-line', lineFilter: /'\/(settings|hot-wallet-balance)'/, count: 2 },
  // 2FA enrolment is for any staff member, so it needs requireAdmin (and the
  // admin IP allowlist in V6), not a specific permission.
  { prefix: '/api/auth/2fa', file: 'routes/admin2fa.js', mode: 'per-line', lineFilter: /'\/(setup|verify|disable)'/, count: 3, needle: 'requireAdmin' },
];

// Justified exceptions (both readable by any authenticated admin, no permission key):
//  - /me/permissions returns the caller's own permission list;
//  - /demo-flags returns the effective DEMO_* flags so the admin client can
//    hide disabled demo entries (it reveals nothing a hidden nav item would not).
const ALLOWLIST = new Set([
  "routes/admin.js: r.get('/me/permissions'",
  "routes/admin.js: r.get('/demo-flags'",
]);

const ADMIN_PREFIX = /^\/api\/(admin|tickets|chat|bank|crypto|auth\/2fa)(\/|$)/;

function parseImports(text, fromDir) {
  const map = new Map();
  const re = /import\s+([A-Za-z_$][\w$]*)?\s*,?\s*(\{[^}]*\})?\s*from\s*'(\.[^']+)'/g;
  for (const m of text.matchAll(re)) {
    const file = normalize(join(fromDir, m[3]));
    if (m[1]) map.set(m[1], { file, exp: 'default' });
    if (m[2]) {
      for (const part of m[2].slice(1, -1).split(',')) {
        const [orig, alias] = part.trim().split(/\s+as\s+/);
        if (orig) map.set((alias || orig).trim(), { file, exp: orig.trim() });
      }
    }
  }
  return map;
}

/** Router mounts `<obj>.use('<prefix>', ...mw, routerIdent)`; last arg must be a bare imported identifier. */
function parseMounts(text, obj, imports) {
  const out = [];
  const re = new RegExp(`${obj}\\.use\\(\\s*'([^']+)'\\s*,([^;]*?)\\)\\s*;`, 'g');
  for (const m of text.matchAll(re)) {
    const last = m[2].trim().replace(/,$/, '').trim().match(/(?:^|[\s,])([A-Za-z_$][\w$]*)$/);
    if (!last) continue;
    const imp = imports.get(last[1]);
    if (!imp) continue;
    out.push({ prefix: m[1], file: imp.file, exp: imp.exp });
  }
  return out;
}

export function effectiveAdminMounts() {
  const appText = read('app.js');
  const appMounts = parseMounts(appText, 'app', parseImports(appText, '.'))
    .filter((m) => ADMIN_PREFIX.test(m.prefix));
  const adminText = read('routes/admin.js');
  const subMounts = parseMounts(adminText, 'r', parseImports(adminText, 'routes'))
    .map((m) => ({ ...m, prefix: `/api/admin${m.prefix}` }));
  return [...appMounts, ...subMounts].map((m) => `${m.prefix} ${m.file}`);
}

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

/** Returns a list of violations for one table entry (empty = ok). */
export function auditEntry(entry, text = read(entry.file)) {
  const v = entry.routerVar || 'r';
  const needle = entry.needle || 'requirePermission(';
  const has = (l) => (needle instanceof RegExp ? needle.test(l) : l.includes(needle));
  const lines = stripComments(text).split('\n');
  const problems = [];
  if (entry.mode === 'router') {
    const uses = lines.filter((l) => l.trim().startsWith(`${v}.use(`));
    if (!uses.some(has)) problems.push(`${entry.file}: no ${v}.use(... ${needle}) line`);
    if (!lines.some((l) => routeLine(v).test(l))) problems.push(`${entry.file}: router has no ${v}.<verb>( routes (wrong routerVar?)`);
    return problems;
  }
  const filter = entry.lineFilter || routeLine(v);
  const selected = lines.filter((l) => routeLine(v).test(l) && filter.test(l));
  if (selected.length === 0) problems.push(`${entry.file}: filter selects no route lines (vacuous)`);
  if (entry.count !== undefined && selected.length !== entry.count) {
    problems.push(`${entry.file}: expected ${entry.count} selected route lines, found ${selected.length}`);
  }
  for (const l of selected) {
    if (has(l)) continue;
    const key = `${entry.file}: ${l.trim().match(new RegExp(`^${v}\\.${VERBS}\\('[^']*'`))?.[0]}`;
    if (!ALLOWLIST.has(key)) problems.push(`${entry.file}: missing ${needle} → ${l.trim().slice(0, 100)}`);
  }
  return problems;
}

describe('V5 admin route permissions (static)', () => {
  it('mount inventory: app.js + routes/admin.js admin mounts equal the table, both directions', () => {
    const effective = new Set(effectiveAdminMounts());
    const table = new Set(ADMIN_MOUNTS.map((e) => `${e.prefix} ${e.file}`));
    // sanity: the parser really sees the multi-arg crypto mount and the admin.js sub-mounts
    assert.ok(effective.has('/api/crypto routes/crypto.js'), 'crypto mount (two args) not inventoried');
    assert.ok(effective.has('/api/admin/audit routes/audit.js'), 'admin.js sub-mounts not inventoried');
    const missingFromTable = [...effective].filter((k) => !table.has(k));
    const notMounted = [...table].filter((k) => !effective.has(k));
    assert.deepEqual(missingFromTable, [], 'admin mounts not covered by ADMIN_MOUNTS');
    assert.deepEqual(notMounted, [], 'ADMIN_MOUNTS entries that are not mounted at that prefix');
  });

  it('every routes/*.js file using requireAdmin in code is in the table', () => {
    const files = new Set(ADMIN_MOUNTS.map((e) => e.file));
    const users = readdirSync(join(SRC, 'routes'))
      .filter((f) => f.endsWith('.js'))
      .filter((f) => /\brequireAdmin\b/.test(stripComments(read(`routes/${f}`)).replace(/import[^;]*;/g, '')))
      .map((f) => `routes/${f}`);
    assert.ok(users.length > 5);
    assert.deepEqual(users.filter((f) => !files.has(f)), []);
  });

  for (const entry of ADMIN_MOUNTS) {
    it(`${entry.prefix} (${entry.file}) carries ${entry.needle || 'requirePermission'}`, () => {
      assert.deepEqual(auditEntry(entry), []);
    });
  }

  it('smsTemplate.js read/write chains contain requirePermission', () => {
    const t = read('routes/smsTemplate.js');
    assert.match(t, /const read = \[[^\]]*requirePermission\('admin:settings:read'\)\]/);
    assert.match(t, /const write = \[[^\]]*requirePermission\('admin:settings:write'\)\]/);
  });

  it('the audit itself fails on a route without requirePermission (self-test)', () => {
    const fake = "const r = Router();\nr.get('/a', requirePermission('x'), h);\nr.post('/b', h);\n";
    assert.equal(auditEntry({ file: 'fake.js', mode: 'per-line' }, fake).length, 1);
    assert.equal(auditEntry({ file: 'fake.js', mode: 'router' }, "r.use(requireAuth, requireAdmin);\nr.get('/a', h);\n").length, 1);
    assert.equal(auditEntry({ file: 'fake.js', mode: 'per-line', lineFilter: /'\/nomatch'/ }, fake).length, 1);
  });

  // Premium modules are optional submodules (empty in a core checkout). When a
  // module is present, every staff-only route in it (a route line using
  // requireAdmin, on `r.` or `router.`) must also carry requirePermission.
  // At the pinned commits only igames has such routes; inhouse-provider and
  // betting have none (their admin settings live in routes/adminModuleSettings.js).
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name === 'node_modules' || d.name === 'game-host' || d.name === 'test' || d.name.startsWith('.')) return [];
    const full = join(dir, d.name);
    return d.isDirectory() ? walk(full) : (/\.m?js$/.test(d.name) ? [full] : []);
  });
  for (const mod of ['igames', 'inhouse-provider', 'betting']) {
    const dir = join(SRC, 'premium', mod);
    const present = existsSync(dir) && readdirSync(dir).some((f) => /\.m?js$/.test(f));
    it(`premium/${mod}: staff-only routes carry requirePermission`, { skip: !present && `premium/${mod} not checked out (empty submodule); see the V5 report for the routes the premium sub-PRs must gate` }, () => {
      const problems = [];
      for (const full of walk(dir)) {
        const text = readFileSync(full, 'utf8');
        if (!/\brequireAdmin\b/.test(stripComments(text).replace(/import[^;]*;/g, ''))) continue;
        for (const v of ['r', 'router']) {
          const e = { file: full.slice(SRC.length + 1), mode: 'per-line', routerVar: v, lineFilter: /\brequireAdmin\b/ };
          const found = auditEntry(e, text).filter((x) => !x.includes('vacuous'));
          problems.push(...found);
        }
      }
      assert.deepEqual(problems, []);
    });
  }
});
