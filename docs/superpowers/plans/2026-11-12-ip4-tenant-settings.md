# İP-4 Tenant Settings, Credentials, Base URL and Mail Transporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement work package İP-4 of the approved multi-tenant design: tenant-scoped settings and credentials (G6), removing `CLIENT_URL` as "the site", CORS allowlist dynamically generated from the `Domain` collection, and a per-tenant e-mail transporter.

**Acceptance Criteria:**
1. **Settings Snapshot Test:** In single mode (`TENANCY_MODE=single`), every settings store returns the exact same value for the default tenant as today.
2. **Two Tenants, Two SMTP Configs:** Two tenants send emails with two different SMTP configurations without crosstalk or transporter cache collision.
3. **Multi-Tenant Env Protection:** Environment credentials continue to work in single mode and never fall through to a tenant in multi mode (`TENANCY_MODE=multi`).
4. **Encrypted Secrets:** All stored credentials and secrets remain encrypted at rest with AES-256-GCM / `enc:v1:` via `utils/secretCrypto.js`.
5. **No `CLIENT_URL` as "the site":** All site link generation, OAuth redirects, and payment callback URLs derive from `getTenantBaseUrl(tenantId, brandId)` backed by primary `Domain`.
6. **Dynamic CORS:** Platform CORS allowlist dynamically reflects registered hosts in `Domain`.

**Architecture:**
- `server/src/models/Setting.js`: Schema adds `scope` (`'platform'|'tenant'|'brand'`), `tenantId` (ObjectId, ref `'Tenant'`), and `brandId` (ObjectId, ref `'Brand'`). Legacy `key` uniqueness in Mongoose schema is dropped so multi-mode tenants can store identical setting keys; single-mode legacy `key_1` unique index is preserved in existing single databases (§6.3 G6). The compound unique index `{ tenantId: 1, scope: 1, brandId: 1, key: 1 }` is registered in `indexRegistry.js` and built by the G6 boot migration (`0008_tenancy_settings.js` / `settingsMigration.js`).
- `server/src/config/secretSettingsStore.js`: The central factory `createSecretSettingsStore` is upgraded with per-tenant/brand cache mapping (`Map<tenantKey, { data, loadedAt }>`), hierarchical resolution (`brand -> tenant -> platform -> env`), and strict isolation: in `multi` mode, tenant credentials NEVER fall back to `process.env`.
- Migrated Credential Stores (K6): Slikair (`slikairConfig.js`), Google OAuth (`googleAuthConfig.js`), Twilio SMS (`smsSettings.js`), Sumsub KYC (`config/kyc.js`), and Crypto settings (`cryptoSettings.js`) adopt the unified tenant-scoped store. KYC and SMS plain-text legacy paths are encrypted.
- Migrated Content/Module/Platform Stores: Platform alerts (`settings.js`) use `scope: 'platform'`. Branding (`branding/index.js`), Theme (`theme/index.js`), Modules (`modules/index.js`), SEO (`seo/store.js`), Pages (`pages/index.js`), Featured Games (`games/index.js`), Currency (`currency/index.js`), Support toggle (`services/support/index.js`), Locale (`localeLive.js`), Timezone (`timezoneLive.js`), Referral (`referralSettings.js`), and Betting Display (`bettingDisplaySettings.js`) adopt per-tenant cache partitioning.
- Dynamic Base URL (`server/src/tenancy/tenantBaseUrl.js`): Exposes `getTenantBaseUrl(tenantId, brandId)` querying the primary `Domain`. Replaces all 10 legacy occurrences of `CLIENT_URL` as "the site".
- Dynamic CORS (`server/src/tenancy/corsDomains.js` & `server/src/app.js`): Replaces static `baseOrigins` in Express `app.js` with dynamic allowlist resolution from `Domain` (with 30s in-process TTL cache). Provider CORS (`/api/provider/v1`) continues to accept `Operator.allowedOrigins`.
- Per-Tenant Mail Transporter (`server/src/services/email.js`): Transporter and Mailtrap client singletons are replaced with per-tenant connection pools (`Map<tenantKey, { client, signature }>`). Sending in ambient tenant context uses that tenant's credentials.

**Tech Stack:** Node >= 22 (ESM), Express 4, Mongoose 8.24, Nodemailer 6, Mailtrap client, `node:test` + `node:assert/strict`, local MongoDB (replica set `rs0` on 127.0.0.1:27017).

**Spec:** `/Users/workbook/Projects/core-ip2/docs/superpowers/specs/2026-11-09-multi-tenant-design.md` (upstream in `core-ipu`). Sections used: §0.2 K6; §1.3 (Ek C); §2.1 (Setting & settings stores rows); §3 (#8, #12, #16, #17, #19); §4.5 (Ayarlar ve kimlik bilgileri); §6.3 (G6 Ayarlar); §7.1 (İP-4 row); §8.1; §8.7; §9 (G-9).

---

## Global Constraints

- **Single Mode Exact Parity:** In `TENANCY_MODE=single`, every setting must resolve to the exact same value as today. Environment variables fall back as before. No breaking changes for existing single-operator deployments.
- **Multi Mode Zero Env Fall-through:** In `TENANCY_MODE=multi`, environment credentials (SMTP, Slikair, Twilio, Google OAuth, Sumsub, Crypto seed/keys, Bank account details) must NEVER fall through to any tenant (§4.5, K10). Only platform-scoped settings (Sentry, Turnstile, ops alert channels) may read env defaults in multi mode.
- **Encrypted at Rest:** All credentials stored in MongoDB must be encrypted via `utils/secretCrypto.js` (`encryptSecret` / `encryptSensitive`). No plain-text credentials in the database (§9 G-9).
- **No syncIndexes:** Never call `syncIndexes()` or `ensureIndexes()`. Legacy unique indexes remain in single mode; compound unique indexes are built explicitly with `createIndex` (§6.3 G6).
- **Core Stays Clean:** Core never imports premium packages (`server/src/premium/*`).
- **File Disjointness:** Each task touches a disjoint set of files where possible so tasks can execute in parallel without merge conflicts.
- **Dedicated Test Databases:** Tests must use isolated database names (`vip90_test_ip4_*` on `mongodb://127.0.0.1:27017`), never reading production `MONGODB_URI`. Allow override only via `TENANCY_TEST_MONGO`. Drop test databases in `after()`.
- **Language & Style:** Code comments in English. CHANGELOG entries in Turkish under `## [Yayınlanmadı]` (`docs/CHANGELOG_GUIDE.md`). Commits add files by explicit path, never `git add -A` or `git add .`.

---

## Reviewer correction (2026-11-12): overrides every conflicting line below

1. Migration file `server/migrations/0008_tenancy_settings.js`, record name `tenancy-005-settings`, version `1.4.0`
   (İP-3 owns `0007` / `tenancy-004-staff-accounts` / `1.3.0`).
2. **Setting.key stays globally unique in single mode.** Declare it as
   `key: { type: String, required: true, unique: getTenancyMode() !== 'multi' }` (mode is fixed at boot), so a fresh
   single install still gets `key_1` from autoIndex exactly as today, and a multi install never creates it. The
   compound unique index goes through `registerTenantIndexes` and is built by the migration. Test both modes by
   importing the model in a child process with `TENANCY_MODE` set.
3. `controllers/auth.js` is also changed by İP-3 Task 10: keep the İP-4 edits there minimal (URL building only).
4. Never change an existing test to make yours pass; never weaken an existing check.

## Review Focus

- **Cache Bleed Between Tenants:** In-process caching must key on `tenantId[:brandId]`. Tenant 1 must never receive Tenant 2's cached settings, even under concurrent async requests.
- **Multi-Tenant Env Leakage:** In multi mode, a tenant without database settings must resolve to `unset` / schema default, never `process.env.SMTP_PASS` or `process.env.SLIKAIR_SECRET_KEY`.
- **Transporter Isolation:** Changing Tenant 1's SMTP credentials must invalidate Tenant 1's transporter pool entry without affecting Tenant 2's active connections.
- **Dynamic CORS Correctness:** Allowed origins must adapt when a new `Domain` is added or verified, expanding apex and www variants, while still allowing `GAME_HOST_URL`, `RAILWAY_PUBLIC_DOMAIN`, and non-production tunnels.
- **URL Generation Reliability:** When a tenant has no primary domain record, single mode falls back to `CLIENT_URL`; multi mode throws `TenantScopeError` rather than silently generating broken localhost links.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `server/src/models/Setting.js` (modify) | Add `scope`, `tenantId`, `brandId`; remove schema `unique: true` from `key` | 1 |
| `server/src/tenancy/indexRegistry.js` (modify) | Register compound index for `Setting` | 1 |
| `server/src/tenancy/settingsMigration.js` (create) | G6 migration logic: categorize legacy rows, build compound index | 1 |
| `server/migrations/0008_tenancy_settings.js` (create) | G6 boot migration runner (`tenancy-005-settings`) | 1 |
| `server/src/config/secretSettingsStore.js` (modify) | Tenant-keyed cache, multi-mode env restriction, scope resolution hierarchy | 2 |
| `server/src/config/slikairConfig.js` (modify) | Tenant-scoped Slikair configuration | 3 |
| `server/src/config/googleAuthConfig.js` (modify) | Tenant-scoped Google OAuth configuration | 3 |
| `server/src/config/kyc.js` (modify) | Tenant-scoped Sumsub / KYC configuration with mandatory encryption | 3 |
| `server/src/services/smsSettings.js` (modify) | Tenant-scoped Twilio SMS configuration with encrypted auth token | 3 |
| `server/src/services/settings.js` (modify) | Platform ops alerts store (`scope: 'platform'`) | 4 |
| `server/src/config/crypto.js`, `server/src/services/cryptoSettings.js` (modify) | Move `CRYPTO_SETTINGS` to per-tenant `Setting` store | 4 |
| `server/src/services/referralSettings.js` (modify) | Tenant-scoped referral commission store | 4 |
| `server/src/services/bettingDisplaySettings.js` (modify) | Tenant-scoped priority sport/country store | 4 |
| `server/src/branding/index.js`, `server/src/theme/index.js` (modify) | Tenant and brand-scoped branding/theme stores | 4 |
| `server/src/modules/index.js`, `server/src/seo/store.js` (modify) | Tenant-scoped module toggles and SEO config stores | 4 |
| `server/src/pages/index.js`, `server/src/games/index.js`, `server/src/currency/index.js`, `server/src/services/support/index.js`, `server/src/services/localeLive.js`, `server/src/services/timezoneLive.js` (modify) | Tenant-scoped content and system preference stores | 4 |
| `server/src/tenancy/tenantBaseUrl.js` (create) | `getTenantBaseUrl(tenantId, brandId)` backed by primary `Domain` | 5 |
| `server/src/controllers/auth.js` (modify) | Replace `CLIENT_URL` with `getTenantBaseUrl` in verification/reset links | 5 |
| `server/src/routes/socialAuth.js`, `server/src/services/socialAuth.js` (modify) | Replace `CLIENT_URL` with `getTenantBaseUrl` in OAuth redirects | 5 |
| `server/src/config/slikair.js`, `server/src/routes/help.js`, `server/src/health/checks.js`, `server/src/services/mailTemplates.js` (modify) | Replace remaining `CLIENT_URL` references as site URL | 5 |
| `server/src/tenancy/corsDomains.js` (create) | Dynamic CORS origin generator from `Domain` with 30s cache | 6 |
| `server/src/app.js` (modify) | Wire dynamic CORS origins into Express `cors` middleware | 6 |
| `server/src/config/emailConfig.js` (modify) | Tenant-scoped email configuration, multi-mode env restriction | 7 |
| `server/src/services/email.js` (modify) | Per-tenant transporter pool and client caching | 7 |
| `server/src/services/systemMail.js` (modify) | Use tenant-scoped sender and `getTenantBaseUrl` | 7 |
| `server/test/settingsSnapshot.test.js` (create) | Snapshot test: single-mode parity across all settings stores | 8 |
| `server/test/tenantSettingsIsolation.test.js` (create) | Multi-tenant isolation, hierarchy, encrypted secrets, no env leaks | 8 |
| `server/test/tenantEmailTransporter.test.js` (create) | Acceptance: two tenants send with two different SMTP configs | 8 |
| `CHANGELOG.md`, `docs/product/02-yapilandirma.md`, `docs/product/05-api-referansi.md` (modify) | Turkish changelog and operator docs | 9 |

---

## Parallelism

Each task is implemented as a commit on its own branch cut from `feat/ip4-tenant-settings`; merge back in wave order. Tasks in the same wave operate on completely disjoint file sets.

```
Wave A: [Task 1: Setting model & G6] ────────┐
        [Task 5: getTenantBaseUrl & CLIENT_URL] ────┬────────────────┐
                                                   │                │
Wave B: [Task 2: secretSettingsStore factory] ◄─────┘                │
        [Task 6: Dynamic CORS from Domain] ◄─────────────────────────┤
                                                   │                │
Wave C: [Task 3: Credential Stores] ◄──────────────┤                │
        [Task 4: Content/Module/Ops Stores] ◄──────┤                │
        [Task 7: Per-Tenant Email Transporter] ◄───┴────────────────┤
                                                                    │
Wave D: [Task 8: Snapshot & Multi-Tenant Acceptance Suite] ◄────────┘
                                                   │
Wave E: [Task 9: Documentation & Turkish CHANGELOG]
```

| Wave | Tasks (run in parallel, separate worktrees) | Depends on | Disjoint Files |
|---|---|---|---|
| A | **Task 1** (Setting model, compound index, G6 migration) | none | `models/Setting.js`, `indexRegistry.js`, `settingsMigration.js`, `0008_tenancy_settings.js` |
| A | **Task 5** (`getTenantBaseUrl`, `CLIENT_URL` removal) | none | `tenancy/tenantBaseUrl.js`, `controllers/auth.js`, `routes/socialAuth.js`, `services/socialAuth.js`, `config/slikair.js`, `routes/help.js`, `health/checks.js`, `services/mailTemplates.js` |
| B | **Task 2** (`secretSettingsStore.js` factory upgrade) | Task 1 | `config/secretSettingsStore.js` |
| B | **Task 6** (Dynamic CORS allowlist from `Domain`) | Task 5 | `tenancy/corsDomains.js`, `server/src/app.js` |
| C | **Task 3** (Credential stores: Slikair, Google, KYC, SMS) | Task 2 | `config/slikairConfig.js`, `config/googleAuthConfig.js`, `config/kyc.js`, `services/smsSettings.js` |
| C | **Task 4** (Platform ops alerts & Content/Module stores) | Task 2 | `services/settings.js`, `config/crypto.js`, `services/cryptoSettings.js`, `services/referralSettings.js`, `services/bettingDisplaySettings.js`, `branding/index.js`, `theme/index.js`, `modules/index.js`, `seo/store.js`, `pages/index.js`, `games/index.js`, `currency/index.js`, `services/support/index.js`, `services/localeLive.js`, `services/timezoneLive.js` |
| C | **Task 7** (Per-tenant email transporter & mail service) | Task 2, Task 5 | `config/emailConfig.js`, `services/email.js`, `services/systemMail.js` |
| D | **Task 8** (Snapshot & Multi-Tenant acceptance suite) | Tasks 1–7 | `server/test/settingsSnapshot.test.js`, `server/test/tenantSettingsIsolation.test.js`, `server/test/tenantEmailTransporter.test.js` |
| E | **Task 9** (Documentation & Turkish CHANGELOG) | Task 8 | `CHANGELOG.md`, `docs/product/02-yapilandirma.md`, `docs/product/05-api-referansi.md` |

---

### Task 1: Setting model evolution, compound index registry and G6 boot migration

**Files:**
- Modify: `server/src/models/Setting.js`
- Modify: `server/src/tenancy/indexRegistry.js`
- Create: `server/src/tenancy/settingsMigration.js`
- Create: `server/migrations/0008_tenancy_settings.js`
- Test: `server/test/tenancySettingsMigration.test.js`

**Interfaces:**
- Consumes: `Tenant` from `server/src/models/Tenant.js`, `Migration` from `server/src/models/Migration.js`.
- Produces:
  - `Setting` schema with `{ scope, tenantId, brandId, key, value, updatedBy }`.
  - Registered compound index: `registerTenantIndexes('Setting', [{ keys: { tenantId: 1, scope: 1, brandId: 1, key: 1 }, options: { name: 'tenant_setting_scope_brand_key_uniq', unique: true } }])`.
  - `runSettingsMigration({ connection, logger }) -> Promise<{ processed: number, compoundIndexBuilt: boolean }>`.
  - Migration record `Migration{name: 'tenancy-005-settings'}`.

**Rules & Logic:**
- `scope`: enum `['platform', 'tenant', 'brand']`, default `'tenant'`, index: true.
- `tenantId`: ObjectId, ref `'Tenant'`, default `null`, index: true.
- `brandId`: ObjectId, ref `'Brand'`, default `null`.
- In `Setting.js`, remove `unique: true` from `key` (keeps `index: true`). In existing databases, MongoDB keeps `key_1` unique index for single mode. Fresh installs and multi mode build `tenant_setting_scope_brand_key_uniq`.
- Platform key set (categorized as `scope: 'platform'`, `tenantId: null`):
  `['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALERT_WEBHOOK_URL', 'ALERT_EMAIL_TO', 'oddsFeed.apiKey', 'license.key', 'ai.apiKey', 'sentry.dsn', 'turnstile.siteKey', 'turnstile.secretKey', 'demoData.live.config']` and any key starting with `alert.` or `platform.`.
- All other keys are categorized as `scope: 'tenant'` with `tenantId: defaultTenant._id`.
- The migration is idempotent and safe to re-run.

- [ ] **Step 1: Write failing migration and schema tests** in `server/test/tenancySettingsMigration.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Setting from '../src/models/Setting.js';
import Tenant from '../src/models/Tenant.js';
import Migration from '../src/models/Migration.js';
import { listTenantIndexes } from '../src/tenancy/indexRegistry.js';
import { runSettingsMigration, PLATFORM_KEYS } from '../src/tenancy/settingsMigration.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t1';

describe('Task 1: Setting model evolution & G6 migration', () => {
  let defaultTenant;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Setting.deleteMany({});
    await Tenant.deleteMany({});
    await Migration.deleteMany({});
    defaultTenant = await Tenant.create({ name: 'Default', key: 'default', isDefault: true });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('registers Setting compound index in indexRegistry', () => {
    const indexes = listTenantIndexes().filter(i => i.modelName === 'Setting');
    assert.equal(indexes.length, 1);
    assert.deepEqual(indexes[0].keys, { tenantId: 1, scope: 1, brandId: 1, key: 1 });
    assert.equal(indexes[0].options.unique, true);
    assert.equal(indexes[0].options.name, 'tenant_setting_scope_brand_key_uniq');
  });

  it('migrates legacy rows to correct scope and tenantId', async () => {
    // Legacy row with no scope/tenantId
    await Setting.collection.insertOne({ key: 'smtp.host', value: 'mail.legacy.test' });
    await Setting.collection.insertOne({ key: 'TELEGRAM_BOT_TOKEN', value: 'bot123' });

    const result = await runSettingsMigration({ connection: mongoose.connection });
    assert.equal(result.processed >= 2, true);

    const smtpRow = await Setting.findOne({ key: 'smtp.host' }).lean();
    assert.equal(smtpRow.scope, 'tenant');
    assert.equal(String(smtpRow.tenantId), String(defaultTenant._id));
    assert.equal(smtpRow.brandId, null);

    const botRow = await Setting.findOne({ key: 'TELEGRAM_BOT_TOKEN' }).lean();
    assert.equal(botRow.scope, 'platform');
    assert.equal(botRow.tenantId, null);
    assert.equal(botRow.brandId, null);

    const mig = await Migration.findOne({ name: 'tenancy-005-settings' });
    assert.ok(mig);
  });

  it('migration is idempotent', async () => {
    const rerun = await runSettingsMigration({ connection: mongoose.connection });
    assert.equal(rerun.alreadyRan, true);
  });
});
```

- [ ] **Step 2: Implement `Setting.js`, `indexRegistry.js` registration, and `settingsMigration.js`**
- [ ] **Step 3: Run tests & verify**
```bash
node --test server/test/tenancySettingsMigration.test.js
```
- [ ] **Step 4: Commit**
```bash
git add server/src/models/Setting.js server/src/tenancy/indexRegistry.js server/src/tenancy/settingsMigration.js server/migrations/0008_tenancy_settings.js server/test/tenancySettingsMigration.test.js
git commit -m "feat(tenancy): İP-4 Task 1 Setting schema evolution, compound index and G6 migration"
```

---

### Task 2: Core tenant settings factory, scope hierarchy and per-tenant cache unification

**Files:**
- Modify: `server/src/config/secretSettingsStore.js`
- Test: `server/test/secretSettingsStoreTenancy.test.js`

**Interfaces:**
- Consumes: `Setting` from `server/src/models/Setting.js`, `tenantContext` / `getCurrentTenantId` from `server/src/tenancy/context.js`, `getTenancyMode` from `server/src/config/tenancy.js`.
- Produces:
  - Enhanced `createSecretSettingsStore({ prefix, fields, load, save, env, encrypt, decrypt, now, ttlMs })`:
    - `getAll({ tenantId, brandId } = {}) -> Promise<Record<string, string>>`
    - `getAdminView({ tenantId, brandId } = {}) -> Promise<Array<{ key, value, source, secret, configured }>>`
    - `update(patch, { clear, adminId, tenantId, brandId, scope } = {}) -> Promise<void>`
    - `invalidate(tenantId, brandId) -> void` (invalidates matching tenant/brand, or all if omitted)
    - `snapshot({ tenantId, brandId } = {}) -> Promise<Record<string, string>>`
  - Enhanced `mongoLoad(keys, { tenantId, brandId } = {}) -> Promise<Record<string, string>>`
  - Enhanced `mongoSave(key, value, adminId, { tenantId, brandId, scope } = {}) -> Promise<void>`

**Resolution & Fall-through Rules:**
1. **Scope precedence:** Brand setting (`scope: 'brand', tenantId, brandId`) > Tenant setting (`scope: 'tenant', tenantId`) > Platform setting (`scope: 'platform'`) > Legacy un-scoped row.
2. **Environment fallback:**
   - In `single` mode: if DB value is unset, reads `env[field.env]`.
   - In `multi` mode: tenant credentials (`f.secret: true` or non-platform fields) NEVER fall back to `env`. If DB value is unset, resolves to `field.default ?? ''` with `source: 'unset'`.
   - Platform fields (`f.scope === 'platform'`) may read `env[field.env]` in both modes.
3. **Cache structure:** Cache is keyed by `${tenantId || 'platform'}:${brandId || 'none'}`.

- [ ] **Step 1: Write failing tests** in `server/test/secretSettingsStoreTenancy.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Setting from '../src/models/Setting.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { createSecretSettingsStore, mongoLoad, mongoSave } from '../src/config/secretSettingsStore.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t2';

describe('Task 2: secretSettingsStore tenancy and isolation', () => {
  let t1, t2;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Setting.deleteMany({});
    await Tenant.deleteMany({});
    t1 = await Tenant.create({ name: 'Tenant 1', key: 't1' });
    t2 = await Tenant.create({ name: 'Tenant 2', key: 't2' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('keeps caches completely isolated between tenants', async () => {
    const store = createSecretSettingsStore({
      prefix: 'testStore',
      fields: [
        { name: 'apiKey', env: 'TEST_API_KEY', secret: true },
        { name: 'endpoint', env: 'TEST_ENDPOINT', default: 'https://default.test' },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'multi', TEST_API_KEY: 'env-leak-secret' },
    });

    // Write T1 setting
    await runWithTenant(t1._id, async () => {
      await store.update({ apiKey: 't1-secret-key', endpoint: 'https://t1.test' });
    });

    // Write T2 setting
    await runWithTenant(t2._id, async () => {
      await store.update({ apiKey: 't2-secret-key', endpoint: 'https://t2.test' });
    });

    // Read T1 in T1 context
    await runWithTenant(t1._id, async () => {
      const all = await store.getAll();
      assert.equal(all.apiKey, 't1-secret-key');
      assert.equal(all.endpoint, 'https://t1.test');
    });

    // Read T2 in T2 context
    await runWithTenant(t2._id, async () => {
      const all = await store.getAll();
      assert.equal(all.apiKey, 't2-secret-key');
      assert.equal(all.endpoint, 'https://t2.test');
    });
  });

  it('never falls through to env in multi mode for tenant credentials', async () => {
    const store = createSecretSettingsStore({
      prefix: 'smtp',
      fields: [
        { name: 'pass', env: 'SMTP_PASS', secret: true },
        { name: 'host', env: 'SMTP_HOST', default: '' },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'multi', SMTP_PASS: 'super-secret-host-pass', SMTP_HOST: 'smtp.env.test' },
    });

    await runWithTenant(t1._id, async () => {
      const all = await store.getAll();
      assert.equal(all.pass, ''); // MUST NOT receive env secret!
      assert.equal(all.host, '');

      const adminView = await store.getAdminView();
      const passEntry = adminView.find(e => e.key === 'pass');
      assert.equal(passEntry.source, 'unset');
      assert.equal(passEntry.configured, false);
    });
  });

  it('allows env fall-through in single mode', async () => {
    const store = createSecretSettingsStore({
      prefix: 'smtp',
      fields: [
        { name: 'pass', env: 'SMTP_PASS', secret: true },
        { name: 'host', env: 'SMTP_HOST', default: '' },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'single', SMTP_PASS: 'single-env-pass', SMTP_HOST: 'smtp.single.test' },
    });

    const all = await store.getAll();
    assert.equal(all.pass, 'single-env-pass');
    assert.equal(all.host, 'smtp.single.test');
  });
});
```

- [ ] **Step 2: Implement tenant-scoped cache and resolution in `secretSettingsStore.js`**
- [ ] **Step 3: Run tests & verify**
```bash
node --test server/test/secretSettingsStoreTenancy.test.js
```
- [ ] **Step 4: Commit**
```bash
git add server/src/config/secretSettingsStore.js server/test/secretSettingsStoreTenancy.test.js
git commit -m "feat(config): İP-4 Task 2 per-tenant caching and strict multi-mode env isolation in secretSettingsStore"
```

---

### Task 3: Tenant credential stores migration (Slikair, Google Auth, Sumsub/KYC, Twilio/SMS)

**Files:**
- Modify: `server/src/config/slikairConfig.js`
- Modify: `server/src/config/googleAuthConfig.js`
- Modify: `server/src/config/kyc.js`
- Modify: `server/src/services/smsSettings.js`
- Test: `server/test/credentialStoresTenancy.test.js`

**Interfaces:**
- Consumes: `createSecretSettingsStore` from `server/src/config/secretSettingsStore.js`, `encryptSensitive` / `decryptSensitive` from `server/src/utils/secretCrypto.js`.
- Produces:
  - `slikairConfig`: per-tenant Slikair credentials (`merchantId`, `secretKey`, `apiKey`).
  - `googleAuthConfig`: per-tenant Google OAuth credentials (`clientId`, `clientSecret`, `redirectUri`).
  - `kycConfig`: per-tenant Sumsub / KYC credentials (`SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET`) with mandatory encryption.
  - `smsSettings`: per-tenant Twilio SMS credentials (`accountSid`, `authToken`, `fromNumber`) with mandatory encryption.

**Rules & Logic:**
- Each credential store delegates to `createSecretSettingsStore` or adopts per-tenant cache partitioning.
- In multi mode, none of these credential stores fall through to host env vars.
- Secrets are encrypted before saving to DB and decrypted in-memory. Masking is applied in admin view.

- [ ] **Step 1: Write failing tests** in `server/test/credentialStoresTenancy.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Setting from '../src/models/Setting.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { slikairConfig } from '../src/config/slikairConfig.js';
import { googleAuthConfig } from '../src/config/googleAuthConfig.js';
import { kycConfig } from '../src/config/kyc.js';
import { smsSettings } from '../src/services/smsSettings.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t3';

describe('Task 3: Credential stores multi-tenant isolation', () => {
  let t1, t2;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Setting.deleteMany({});
    await Tenant.deleteMany({});
    t1 = await Tenant.create({ name: 'T1', key: 't1' });
    t2 = await Tenant.create({ name: 'T2', key: 't2' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('isolates Slikair, Google, KYC and SMS credentials across tenants', async () => {
    // Configure T1
    await runWithTenant(t1._id, async () => {
      await slikairConfig.update({ merchantId: 'm_t1', secretKey: 'sec_t1' });
      await googleAuthConfig.update({ clientId: 'g_t1.apps.google.com', clientSecret: 'gsec_t1' });
      await kycConfig.save({ SUMSUB_APP_TOKEN: 'sum_t1', SUMSUB_SECRET_KEY: 'sumsec_t1' });
      await smsSettings.update({ 'sms.twilio.accountSid': 'AC_t1', 'sms.twilio.authToken': 'tw_sec_t1' });
    });

    // Configure T2
    await runWithTenant(t2._id, async () => {
      await slikairConfig.update({ merchantId: 'm_t2', secretKey: 'sec_t2' });
      await googleAuthConfig.update({ clientId: 'g_t2.apps.google.com', clientSecret: 'gsec_t2' });
      await kycConfig.save({ SUMSUB_APP_TOKEN: 'sum_t2', SUMSUB_SECRET_KEY: 'sumsec_t2' });
      await smsSettings.update({ 'sms.twilio.accountSid': 'AC_t2', 'sms.twilio.authToken': 'tw_sec_t2' });
    });

    // Verify T1 sees only T1 credentials
    await runWithTenant(t1._id, async () => {
      const slk = await slikairConfig.getAll();
      assert.equal(slk.merchantId, 'm_t1');
      assert.equal(slk.secretKey, 'sec_t1');

      const g = await googleAuthConfig.getAll();
      assert.equal(g.clientId, 'g_t1.apps.google.com');

      const kycToken = await kycConfig.get('SUMSUB_APP_TOKEN');
      assert.equal(kycToken, 'sum_t1');

      const twilioSid = await smsSettings.plain('sms.twilio.accountSid');
      assert.equal(twilioSid, 'AC_t1');
    });

    // Verify T2 sees only T2 credentials
    await runWithTenant(t2._id, async () => {
      const slk = await slikairConfig.getAll();
      assert.equal(slk.merchantId, 'm_t2');
      assert.equal(slk.secretKey, 'sec_t2');

      const kycToken = await kycConfig.get('SUMSUB_APP_TOKEN');
      assert.equal(kycToken, 'sum_t2');
    });

    // Verify stored secrets in DB are encrypted
    const kycDbRow = await Setting.findOne({ tenantId: t1._id, key: 'SUMSUB_SECRET_KEY' }).lean();
    assert.ok(kycDbRow.value.startsWith('enc:v1:'));
  });
});
```

- [ ] **Step 2: Update `slikairConfig.js`, `googleAuthConfig.js`, `kyc.js`, and `smsSettings.js`**
- [ ] **Step 3: Run tests & verify**
```bash
node --test server/test/credentialStoresTenancy.test.js
```
- [ ] **Step 4: Commit**
```bash
git add server/src/config/slikairConfig.js server/src/config/googleAuthConfig.js server/src/config/kyc.js server/src/services/smsSettings.js server/test/credentialStoresTenancy.test.js
git commit -m "feat(config): İP-4 Task 3 migrate Slikair, Google, KYC and SMS credential stores to tenant scoping"
```

---

### Task 4: Platform ops alert store and tenant-scoped content, module & crypto stores

**Files:**
- Modify: `server/src/services/settings.js`
- Modify: `server/src/config/crypto.js`
- Modify: `server/src/services/cryptoSettings.js`
- Modify: `server/src/services/referralSettings.js`
- Modify: `server/src/services/bettingDisplaySettings.js`
- Modify: `server/src/branding/index.js`
- Modify: `server/src/theme/index.js`
- Modify: `server/src/modules/index.js`
- Modify: `server/src/seo/store.js`
- Modify: `server/src/pages/index.js`, `server/src/games/index.js`, `server/src/currency/index.js`, `server/src/services/support/index.js`, `server/src/services/localeLive.js`, `server/src/services/timezoneLive.js`
- Test: `server/test/contentSettingsTenancy.test.js`

**Interfaces:**
- Consumes: `Setting` from `server/src/models/Setting.js`, `tenantContext` / `getCurrentTenantId` from `server/src/tenancy/context.js`.
- Produces:
  - `services/settings.js`: `scope: 'platform'`, `tenantId: null` for ops alert channels (`ALERT_KEYS`).
  - `services/cryptoSettings.js`: `getCryptoSettings()`, `updateCryptoSettings(patch, adminId)` backed by per-tenant `Setting` row (`crypto.settings`), not global singleton.
  - All content/branding/module/theme stores use tenant-keyed cache partitioning (`tenantId[:brandId]`).

**Rules & Logic:**
- `CRYPTO_SETTINGS` in `crypto.js` becomes a getter or proxy to ambient tenant settings for backward compatibility.
- In multi mode, `cryptoSettings` never falls back to host environment variables (`USDT_TRY_RATE`, `TRON_NETWORK`), using standard defaults.
- Admin updates write with the active tenant's `tenantId`.

- [ ] **Step 1: Write failing tests** in `server/test/contentSettingsTenancy.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Setting from '../src/models/Setting.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { settings as opsSettings } from '../src/services/settings.js';
import { getCryptoSettings, updateCryptoSettings } from '../src/services/cryptoSettings.js';
import { brandingStore } from '../src/branding/index.js';
import { moduleStore } from '../src/modules/index.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t4';

describe('Task 4: Content, module and platform ops alert isolation', () => {
  let t1, t2;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Setting.deleteMany({});
    await Tenant.deleteMany({});
    t1 = await Tenant.create({ name: 'T1', key: 't1' });
    t2 = await Tenant.create({ name: 'T2', key: 't2' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('keeps platform alert settings global while tenant settings are isolated', async () => {
    // Platform alert setting
    await runAsPlatform('test-alerts', async () => {
      await Setting.create({ scope: 'platform', tenantId: null, key: 'TELEGRAM_CHAT_ID', value: '-100123' });
    });

    const alertChat = await opsSettings.get('TELEGRAM_CHAT_ID');
    assert.equal(alertChat, '-100123');

    // Tenant 1 sets crypto and branding
    await runWithTenant(t1._id, async () => {
      await updateCryptoSettings({ usdtTryRate: 35.5 });
      await Setting.create({ scope: 'tenant', tenantId: t1._id, key: 'branding.siteName', value: 'BetBrand1' });
      brandingStore.invalidate();
    });

    // Tenant 2 sets different crypto and branding
    await runWithTenant(t2._id, async () => {
      await updateCryptoSettings({ usdtTryRate: 40.0 });
      await Setting.create({ scope: 'tenant', tenantId: t2._id, key: 'branding.siteName', value: 'BetBrand2' });
      brandingStore.invalidate();
    });

    // Read back in T1
    await runWithTenant(t1._id, async () => {
      const c = await getCryptoSettings();
      assert.equal(c.usdtTryRate, 35.5);
      const b = await brandingStore.getValues();
      assert.equal(b.siteName, 'BetBrand1');
    });

    // Read back in T2
    await runWithTenant(t2._id, async () => {
      const c = await getCryptoSettings();
      assert.equal(c.usdtTryRate, 40.0);
      const b = await brandingStore.getValues();
      assert.equal(b.siteName, 'BetBrand2');
    });
  });
});
```

- [ ] **Step 2: Update `services/settings.js`, `cryptoSettings.js`, `referralSettings.js`, `branding/index.js`, `theme/index.js`, `modules/index.js`, `seo/store.js`, and related store files**
- [ ] **Step 3: Run tests & verify**
```bash
node --test server/test/contentSettingsTenancy.test.js
```
- [ ] **Step 4: Commit**
```bash
git add server/src/services/settings.js server/src/config/crypto.js server/src/services/cryptoSettings.js server/src/services/referralSettings.js server/src/services/bettingDisplaySettings.js server/src/branding/index.js server/src/theme/index.js server/src/modules/index.js server/src/seo/store.js server/src/pages/index.js server/src/games/index.js server/src/currency/index.js server/src/services/support/index.js server/src/services/localeLive.js server/src/services/timezoneLive.js server/test/contentSettingsTenancy.test.js
git commit -m "feat(services): İP-4 Task 4 tenant-scoped content, module, crypto stores and platform ops alert isolation"
```

---

### Task 5: Per-tenant base URL (`getTenantBaseUrl`) and removing `CLIENT_URL` as "the site"

**Files:**
- Create: `server/src/tenancy/tenantBaseUrl.js`
- Modify: `server/src/controllers/auth.js`
- Modify: `server/src/routes/socialAuth.js`
- Modify: `server/src/services/socialAuth.js`
- Modify: `server/src/config/slikair.js`
- Modify: `server/src/routes/help.js`
- Modify: `server/src/health/checks.js`
- Modify: `server/src/services/mailTemplates.js`
- Test: `server/test/tenantBaseUrl.test.js`

**Interfaces:**
- Consumes: `Domain` from `server/src/models/Domain.js`, `tenantContext` / `getCurrentTenantId` from `server/src/tenancy/context.js`, `getTenancyMode` from `server/src/config/tenancy.js`.
- Produces:
  - `getTenantBaseUrl(tenantId?, brandId?) -> Promise<string>`
  - `getTenantOrigin(tenantId?, brandId?) -> Promise<string>`
  - `invalidateTenantBaseUrl(tenantId?) -> void`

**Rules & Logic:**
- Looks up primary `Domain` for tenant (`isPrimary: true`, with brand fallback).
- Host formatting: `localhost` or `127.0.0.1` -> `http://${domain.host}`; otherwise `https://${domain.host}`.
- Single mode fallback: if no `Domain` is found, returns first origin of `process.env.CLIENT_URL` (or `'http://localhost:5173'`).
- Multi mode behavior: throws `TenantScopeError` if tenant has no verified primary domain.
- In `auth.js` (`getBaseUrl`), `routes/socialAuth.js`, `services/socialAuth.js`, `config/slikair.js`, `routes/help.js`, `mailTemplates.js`: replace `CLIENT_URL` usages with `await getTenantBaseUrl()`.
- In `health/checks.js`: `CLIENT_URL` is required only in `single` mode.

- [ ] **Step 1: Write failing tests** in `server/test/tenantBaseUrl.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Domain from '../src/models/Domain.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getTenantBaseUrl, invalidateTenantBaseUrl } from '../src/tenancy/tenantBaseUrl.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t5';

describe('Task 5: getTenantBaseUrl and Domain resolution', () => {
  let t1, t2;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Domain.deleteMany({});
    await Tenant.deleteMany({});
    t1 = await Tenant.create({ name: 'Tenant 1', key: 't1' });
    t2 = await Tenant.create({ name: 'Tenant 2', key: 't2' });

    await Domain.create({ host: 'tenant1.bet', tenantId: t1._id, isPrimary: true });
    await Domain.create({ host: 'tenant2.bet', tenantId: t2._id, isPrimary: true });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('resolves primary domain URL in tenant context', async () => {
    await runWithTenant(t1._id, async () => {
      const url = await getTenantBaseUrl();
      assert.equal(url, 'https://tenant1.bet');
    });

    await runWithTenant(t2._id, async () => {
      const url = await getTenantBaseUrl();
      assert.equal(url, 'https://tenant2.bet');
    });
  });

  it('falls back to CLIENT_URL in single mode when no domain exists', async () => {
    invalidateTenantBaseUrl();
    const prevEnv = process.env.TENANCY_MODE;
    process.env.TENANCY_MODE = 'single';
    process.env.CLIENT_URL = 'https://fallback.vip90.bet,https://admin.vip90.bet';

    const unassignedId = new mongoose.Types.ObjectId();
    const url = await getTenantBaseUrl(unassignedId);
    assert.equal(url, 'https://fallback.vip90.bet');

    process.env.TENANCY_MODE = prevEnv;
  });
});
```

- [ ] **Step 2: Implement `tenantBaseUrl.js` and update all 10 `CLIENT_URL` locations**
- [ ] **Step 3: Run tests & verify**
```bash
node --test server/test/tenantBaseUrl.test.js
```
- [ ] **Step 4: Commit**
```bash
git add server/src/tenancy/tenantBaseUrl.js server/src/controllers/auth.js server/src/routes/socialAuth.js server/src/services/socialAuth.js server/src/config/slikair.js server/src/routes/help.js server/src/health/checks.js server/src/services/mailTemplates.js server/test/tenantBaseUrl.test.js
git commit -m "feat(tenancy): İP-4 Task 5 implement getTenantBaseUrl and replace CLIENT_URL as the site"
```

---

### Task 6: Dynamic CORS allowlist generated from `Domain` collection

**Files:**
- Create: `server/src/tenancy/corsDomains.js`
- Modify: `server/src/app.js`
- Test: `server/test/corsDomains.test.js`

**Interfaces:**
- Consumes: `Domain` from `server/src/models/Domain.js`, `getTenancyMode` from `server/src/config/tenancy.js`, `expandOrigins` from `server/src/utils/origins.js`.
- Produces:
  - `getDomainOrigins({ env, now, ttlMs } = {}) -> Promise<Set<string>>`
  - `invalidateDomainOrigins() -> void`
  - Express middleware in `app.js` using dynamic origin validation.

**Rules & Logic:**
- Fetches all hosts from `Domain.find({ verifiedAt: { $ne: null } })` (in single mode, all domains including unverified).
- Generates `https://${host}` and `http://${host}` (for localhost/dev), expanded with `expandOrigins` (www ↔ apex).
- Includes `GAME_HOST_URL` and `RAILWAY_PUBLIC_DOMAIN` if set.
- In `single` mode, includes `CLIENT_URL` origins as fallback.
- In-process TTL cache (30 seconds), invalidatable via `invalidateDomainOrigins()`.
- Provider CORS (`/api/provider/v1`) continues to check `Operator.allowedOrigins`.

- [ ] **Step 1: Write failing tests** in `server/test/corsDomains.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Domain from '../src/models/Domain.js';
import Tenant from '../src/models/Tenant.js';
import { getDomainOrigins, invalidateDomainOrigins } from '../src/tenancy/corsDomains.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t6';

describe('Task 6: Dynamic CORS allowlist from Domain', () => {
  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Domain.deleteMany({});
    await Tenant.deleteMany({});
    const tenant = await Tenant.create({ name: 'T1', key: 't1' });
    await Domain.create({ host: 'operator-a.com', tenantId: tenant._id, isPrimary: true });
    await Domain.create({ host: 'localhost:5173', tenantId: tenant._id });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('generates allowed origins including www apex expansion', async () => {
    invalidateDomainOrigins();
    const origins = await getDomainOrigins({ env: { TENANCY_MODE: 'multi' } });

    assert.ok(origins.has('https://operator-a.com'));
    assert.ok(origins.has('https://www.operator-a.com'));
    assert.ok(origins.has('http://localhost:5173'));
    assert.equal(origins.has('https://malicious-site.com'), false);
  });
});
```

- [ ] **Step 2: Implement `corsDomains.js` and update `app.js` CORS options**
- [ ] **Step 3: Run tests & verify**
```bash
node --test server/test/corsDomains.test.js
```
- [ ] **Step 4: Commit**
```bash
git add server/src/tenancy/corsDomains.js server/src/app.js server/test/corsDomains.test.js
git commit -m "feat(security): İP-4 Task 6 dynamic CORS allowlist generated from Domain collection"
```

---

### Task 7: Per-tenant e-mail transporter pool and tenant mail delivery

**Files:**
- Modify: `server/src/config/emailConfig.js`
- Modify: `server/src/services/email.js`
- Modify: `server/src/services/systemMail.js`
- Test: `server/test/tenantEmailTransporter.test.js`

**Interfaces:**
- Consumes: `createSecretSettingsStore` from `server/src/config/secretSettingsStore.js`, `getTenantBaseUrl` from `server/src/tenancy/tenantBaseUrl.js`, `tenantContext` / `getCurrentTenantId` from `server/src/tenancy/context.js`.
- Produces:
  - `emailConfig`: per-tenant email configuration store with multi-mode env restriction.
  - `getSender({ tenantId } = {}) -> Promise<{ mode, sender, from, fromName, useSandbox }>`
  - `sendEmail({ to, subject, template, data, html, tenantId } = {}) -> Promise<any>`
  - `sendTestEmail(to, { tenantId } = {}) -> Promise<any>`
  - `_resetEmailTransportersForTests() -> void`

**Rules & Logic:**
- Replace module-level singletons `_transporter` and `_mailtrap` with `transporterPool = new Map()` and `mailtrapPool = new Map()`, keyed by `tenantId`.
- In `multi` mode: if a tenant has not configured SMTP or Mailtrap in DB, `mode` resolves to `'none'` (mock in dev, error in test/prod). It NEVER falls back to host environment `SMTP_PASS` or `MAILTRAP_TOKEN`.
- In `single` mode: if DB is unconfigured, falls back to `process.env` as before.
- Email layout and template rendering derive `siteUrl` from `await getTenantBaseUrl()`.

- [ ] **Step 1: Write failing tests** in `server/test/tenantEmailTransporter.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Setting from '../src/models/Setting.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { emailConfig } from '../src/config/emailConfig.js';
import { sendEmail, _setCreateTransport, _resetEmailTransportersForTests } from '../src/services/email.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t7';

describe('Task 7: Per-tenant e-mail transporter pool', () => {
  let t1, t2;
  const transportsCreated = [];

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Setting.deleteMany({});
    await Tenant.deleteMany({});
    t1 = await Tenant.create({ name: 'Tenant 1', key: 't1' });
    t2 = await Tenant.create({ name: 'Tenant 2', key: 't2' });

    _setCreateTransport((opts) => {
      transportsCreated.push(opts);
      return {
        sendMail: async (mail) => ({ messageId: `msg-${opts.host}-${Date.now()}`, mail }),
      };
    });
  });

  after(async () => {
    _resetEmailTransportersForTests();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('creates two distinct transporters for two tenants with different SMTP settings', async () => {
    // Configure T1 SMTP
    await runWithTenant(t1._id, async () => {
      await emailConfig.update({
        host: 'smtp.tenant1.test',
        port: '587',
        user: 'user_t1',
        pass: 'pass_t1',
        from: 'noreply@tenant1.test',
        fromName: 'Brand One',
      });
    });

    // Configure T2 SMTP
    await runWithTenant(t2._id, async () => {
      await emailConfig.update({
        host: 'smtp.tenant2.test',
        port: '465',
        secure: 'true',
        user: 'user_t2',
        pass: 'pass_t2',
        from: 'noreply@tenant2.test',
        fromName: 'Brand Two',
      });
    });

    // Send from T1
    await runWithTenant(t1._id, async () => {
      const res = await sendEmail({ to: 'player@example.com', subject: 'T1 Welcome', html: '<p>T1</p>' });
      assert.ok(res.messageId.includes('smtp.tenant1.test'));
    });

    // Send from T2
    await runWithTenant(t2._id, async () => {
      const res = await sendEmail({ to: 'player@example.com', subject: 'T2 Welcome', html: '<p>T2</p>' });
      assert.ok(res.messageId.includes('smtp.tenant2.test'));
    });

    assert.equal(transportsCreated.length, 2);
    assert.equal(transportsCreated[0].host, 'smtp.tenant1.test');
    assert.equal(transportsCreated[1].host, 'smtp.tenant2.test');
    assert.equal(transportsCreated[1].secure, true);
  });
});
```

- [ ] **Step 2: Update `emailConfig.js`, `services/email.js`, and `systemMail.js`**
- [ ] **Step 3: Run tests & verify**
```bash
node --test server/test/tenantEmailTransporter.test.js
```
- [ ] **Step 4: Commit**
```bash
git add server/src/config/emailConfig.js server/src/services/email.js server/src/services/systemMail.js server/test/tenantEmailTransporter.test.js
git commit -m "feat(mail): İP-4 Task 7 per-tenant email transporter pool and sender isolation"
```

---

### Task 8: Settings snapshot and multi-tenant acceptance test suite

**Files:**
- Create: `server/test/settingsSnapshot.test.js`
- Create: `server/test/tenantSettingsIsolation.test.js`

**Interfaces:**
- Consumes: All stores from Tasks 1–7.
- Produces: End-to-end acceptance test verification for work package İP-4.

**Test Assertions:**
1. **Single Mode Snapshot Parity:**
   In `TENANCY_MODE=single`, every store (`emailConfig`, `slikairConfig`, `googleAuthConfig`, `kycConfig`, `smsSettings`, `cryptoSettings`, `brandingStore`, `themeStore`, `moduleStore`, `seoStore`, `referralSettingsStore`, `bettingDisplaySettings`, `localeStore`, `timezoneStore`, `opsSettings`) returns identical outputs to today's baseline.
2. **Multi-Tenant Strict Isolation:**
   - In `TENANCY_MODE=multi`, setting host env vars (`SMTP_PASS`, `SLIKAIR_SECRET_KEY`, `TWILIO_AUTH_TOKEN`, `SUMSUB_SECRET_KEY`) does NOT leak to a tenant lacking DB records.
   - Tenant A and Tenant B maintain distinct configurations across all stores.
3. **Database Secrets Encryption Verification:**
   Querying `Setting` documents directly from MongoDB confirms that all secrets (`slikair.secretKey`, `smtp.pass`, `sms.twilio.authToken`, `SUMSUB_SECRET_KEY`, `googleAuth.clientSecret`) are stored encrypted (`enc:v1:` or AES-256-GCM ciphertext) and cannot be read as plain text.

- [ ] **Step 1: Write `server/test/settingsSnapshot.test.js`** verifying baseline single-mode parity across all 17 stores.
- [ ] **Step 2: Write `server/test/tenantSettingsIsolation.test.js`** verifying multi-tenant isolation, database encryption, and zero env fall-through.
- [ ] **Step 3: Run tests & verify**
```bash
node --test server/test/settingsSnapshot.test.js
node --test server/test/tenantSettingsIsolation.test.js
```
- [ ] **Step 4: Commit**
```bash
git add server/test/settingsSnapshot.test.js server/test/tenantSettingsIsolation.test.js
git commit -m "test(tenancy): İP-4 Task 8 settings snapshot and multi-tenant isolation acceptance suite"
```

---

### Task 9: Documentation, AGENTS.md and Turkish CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/product/02-yapilandirma.md`
- Modify: `docs/product/05-api-referansi.md`

**Rules:**
- Update `CHANGELOG.md` under `## [Yayınlanmadı]` in Turkish per `docs/CHANGELOG_GUIDE.md`:
  - `İP-4: Kiracı bazlı ayarlar, kimlik bilgileri, dinamik CORS ve e-posta transporter'ı.`
  - `G6: Setting koleksiyonu scope/tenantId/brandId hiyerarşisine geçirildi, bileşik indeks oluşturuldu.`
  - `CLIENT_URL kaldırıldı; site bağlantıları Domain koleksiyonundan (getTenantBaseUrl) türetiliyor.`
  - `CORS izin listesi Domain koleksiyonundan dinamik üretiliyor.`
  - `E-posta göndericisi kiracı başına izole transporter havuzuna taşındı.`
  - `Multi modda env kimlik bilgilerinin kiracılara sızması engellendi.`
- Update `docs/product/02-yapilandirma.md` and `docs/product/05-api-referansi.md` with documentation on multi-tenant settings resolution and dynamic CORS allowlists.

- [ ] **Step 1: Edit documentation and changelog files**
- [ ] **Step 2: Verify changelog format**
```bash
grep -n "İP-4: Kiracı bazlı ayarlar" CHANGELOG.md
```
- [ ] **Step 3: Run full regression test suite**
```bash
npm test --prefix server
```
- [ ] **Step 4: Commit**
```bash
git add CHANGELOG.md docs/product/02-yapilandirma.md docs/product/05-api-referansi.md
git commit -m "docs(tenancy): İP-4 changelog and multi-tenant settings documentation"
```

---

## Decisions this plan makes where the spec leaves room

1. **Compound Index Key Order:** `Setting` compound unique index is `{ tenantId: 1, scope: 1, brandId: 1, key: 1 }`. This conforms directly to `indexRegistry.js` requirements (`keys` start with `tenantId`) while cleanly indexing platform rows where `tenantId: null`.
2. **Schema `unique: true` Removal:** Dropping `unique: true` on `key` in `Setting.js` schema prevents Mongoose `autoIndex` from re-imposing a global key uniqueness constraint across multiple tenants in multi mode, while preserving legacy single-mode databases where MongoDB already holds `key_1` unique index (§6.3 G6).
3. **CORS Allowlist TTL:** `corsDomains.js` caches the active `Domain` origins with a 30-second TTL in-process. Domain creation and verification automatically trigger `invalidateDomainOrigins()`.
4. **Base URL Fallback Handling:** `getTenantBaseUrl` requires a primary domain in `multi` mode, throwing `TenantScopeError` if unconfigured. In `single` mode, it seamlessly falls back to `CLIENT_URL` (or `http://localhost:5173`) to guarantee zero regression on existing single installations.
5. **Transporter Pool Eviction:** Transporters are retained in an in-memory `Map` per tenant and automatically recreated whenever a tenant's SMTP or Mailtrap settings are updated via `emailConfig.update()`.
6. **Crypto Settings Memory Decoupling:** `CRYPTO_SETTINGS` is converted from a globally mutated object to an ambient tenant-scoped accessor, preventing Tenant A's withdrawal limits or USDT rate from affecting Tenant 2.
