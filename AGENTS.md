# Agent Instructions

This file is the single source of agent instructions for this repository.

## Repository role

- `vip90-bet-core` (public, AGPL-3.0) is the **upstream** for the platform core and for the multi-operator
  platform: tenant isolation, the Platform Owner console, partner management, operator provisioning and billing
  (decision of 2026-11-09, effective 2026-11-12). Changes to core paths are made here, in pull requests to `main`.
- The private development repository pulls tagged core releases and adds the private add-ons
  (`server/src/premium/*`). Nothing is pushed into this repository from there any more; the former sync script is
  retired. `.core-sync.json` records the last forward sync and is kept as history; do not edit it.
- Premium add-ons (sports betting, casino content, in-house games) are private and optional. The core never
  imports them; they attach through registration hooks (`registerTenantProvisioningHook`,
  `registerTenantCredentialSchema`, `runWithTenant`). The core must run and pass its tests without them.

## Public by default

- No internal hostnames, server paths, IP addresses, secrets, real customer or partner names, or real-looking
  payment identifiers. Commercial terms live in the database, never in code.
- CI runs `node scripts/leak-scan.mjs` on every pull request and push; a finding blocks the merge. Fix the content,
  do not widen the allow-lists without a reason in the PR description.
- Security issues follow `SECURITY.md`; do not describe an unfixed vulnerability in an issue, PR or document.

## Changelog and versions

Every PR that changes behaviour, configuration, an API, the database schema or anything an operator installs adds
its entry to `CHANGELOG.md` under `[Yayınlanmadı]`, following `docs/CHANGELOG_GUIDE.md`. CI runs
`node scripts/check-changelog.mjs`; a deliberate exception carries a `Changelog: none` line in a commit message.
Versions follow SemVer; core tags are primary, downstream installs record which core tag they pulled.

## Multi-tenant work

- Design: `docs/superpowers/specs/2026-11-09-multi-tenant-design.md`. Plans per work package live in
  `docs/superpowers/plans/`. Dated records under `docs/superpowers/` are not rewritten.
- **`2026-11-09`: tenant data isolation is mandatory.** Every operator-owned collection carries `tenantId`;
  unscoped queries on operator-owned models are rejected by the `tenantScoped` plugin; platform work that runs
  outside a tenant is marked explicitly with `runAsPlatform(reason, fn)`. The tenant model is `Tenant`; the name
  `Operator` belongs to the in-house provider's B2B customer model and is never used in the tenant sense.
  Brand/Jurisdiction pages are functional: a Brand belongs to a tenant, and host → tenant resolution reads the
  `Domain` collection. The central multi-tenant installation is a new, clean install; existing single-operator
  demo installs stay single-mode and are not migrated. In multi mode bots, fake winners and the demo deposit never
  run; staff 2FA is mandatory only in multi mode.
- Single-operator installs keep working unchanged on the default tenant (`TENANCY_MODE=single`).
- Operator-owned (TEN) models are compiled with `defineTenantModel(name, schema)` (`server/src/tenancy/models.js`),
  never `mongoose.model(name, schema)`: it attaches the `tenantScoped` plugin and registers the collection, which is
  what the G3 backfill and the compound index migration walk.
- Those schemas carry `tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true }`.
  `required: true` is İP-8 work, not İP-2. `RiskRule` platform templates and platform-wide `AuditLog`/`AdminAction` rows
  are the documented exceptions and keep `tenantId: null`.
- Compound `{ tenantId, … }` indexes are registered with `registerTenantIndexes(modelName, [{ keys, options }])`
  (`server/src/tenancy/indexRegistry.js`) and built online by the G4 migration — they do **not** go into `schema.index()`.
  Unique ones use `partialFilterExpression`, never `sparse`. Names: `tenant_<field>[_<field>]_uniq`, else `tenant_<field>[_<field>]`.
- Leave `autoIndex` untouched and never call `syncIndexes()` or `ensureIndexes()`: they drop every index the schema does
  not list, including unmanaged and partial ones. In single mode the legacy global unique indexes stay in place; dropping
  an index is always its own explicit migration step.
- Agent (reseller) and Partner are different concepts; do not merge them.
- **Id lookups are tenant-scoped (İP-5, spec §9 G-3).** Every controller that addresses a record by `req.params.id`
  (or a body `userId`) looks it up through `tenantFilter(req, { _id })` / `scopeTenantId(req)` from
  `server/src/tenancy/tenantFilter.js`. Multi mode adds the request tenant, so another tenant's id answers the same
  404 `NOT_FOUND` (or a dedicated 404 code such as `RECIPIENT_NOT_FOUND`) as an id that does not exist: never 403, never
  the record. Single mode returns the base query unchanged, so records the G3 backfill has not stamped stay visible.
  `npm run lint:tenancy` (`scripts/lint-tenancy.mjs`, run in CI) fails on a raw `Model.findById*(req.params…)` in a
  controller and on `runAsPlatform` outside its allow-list.
- **Single-mode enforcement default (G7).** `TENANCY_ENFORCEMENT` defaults to `log` in single mode only after the G3
  backfill is recorded complete for every collection; until then it stays `off`. In `log` mode scoped requests get
  `{ tenantId }`, unscoped queries are counted and warned (at most one line per model+op per minute), nothing throws.
  An explicit env value always wins; multi mode is always `enforce`.
- **Platform staff on tenant routes (K23).** A platform-scoped staff token may only use safe methods (GET, HEAD,
  OPTIONS) on a tenant route; anything else answers 403 `PLATFORM_READ_ONLY` and writes an `AuditLog` row. Manual event
  settlement is platform-only in multi mode (403 `PLATFORM_ONLY`). Do not add a platform write path outside the
  time-limited, audited grant planned for İP-9a.
- **`TenantDailyStat` (spec §4.3.6).** `server/src/models/TenantDailyStat.js` is a platform/partner collection written
  only by `server/src/services/tenantDailyStat.js` (`runAsPlatform`); it excludes bot, seed and demo activity, and the
  partner view applies small-cell suppression (`activePlayers < 5` → `"<5"`) with no player identifiers.

## Identity, staff authentication and 2FA

- **Identity separation (`2026-11-12`, İP-3).** Players stay in the tenant-owned `User` collection. Staff live in the
  platform model `StaffAccount` (`server/src/models/StaffAccount.js`): staff emails are globally unique, while the same
  email may belong to two player accounts on two operators. `StaffAccount`, `Role`, `RoleAssignment`, `Permission`,
  `Tenant` and `Domain` are platform models — never give them the `tenantScoped` plugin or compile them with
  `defineTenantModel`.
- **Scoped roles.** `Role` carries `scopeType` (`platform` | `partner` | `tenant`) and `scopeId`; grants are
  `RoleAssignment` rows (`server/src/models/RoleAssignment.js`). Tenant roles never accept `platform:*` permission keys
  (`validateRolePermissions` rejects them), and a partner-staff member cannot be assigned a tenant role on an operator
  linked to their partner (`assertNoPartnerSelfAssignment`).
- **Two token families.** Player tokens are signed with `JWT_SECRET` (`aud: 'player'`, `typ: 'player'`, `tid`) and
  verified by `requireAuth`; staff tokens are signed with `JWT_STAFF_SECRET` (`aud: 'staff'`, `typ: 'staff'`, `scp`,
  `sid`, `amr`) and verified by `requireStaff`. The families never cross: `requireAuth` rejects `aud: 'staff'` and
  `requireStaff` only verifies `JWT_STAFF_SECRET`. `JWT_STAFF_SECRET` is optional in single mode (tokens then fall
  back to `JWT_SECRET`, still separated by audience) and required in multi mode. Multi mode rejects tokens issued
  without the new claims; single mode accepts pre-upgrade tokens until they expire.
- **Never weaken an existing check.** `requireAuth`, `requireAdmin`, `requirePermission` and `enforceAdminIp` keep their
  behaviour in single mode; `requireAdmin`/`requirePermission` may read the `StaffAccount` behind the same `_id`, never
  stricter. `requireStaff` guards the new `/api/staff/*` routes and every staff route in multi mode. New checks add
  defence in depth (host cross-checks, `X-Tenant-Id`), they do not replace or loosen the old ones.
- **Staff 2FA.** Mandatory only in multi mode: no staff access token is issued without `amr` containing `'otp'`, and a
  first login without 2FA returns `{ requires2faSetup }`. In single mode 2FA is optional — accounts that enabled it are
  prompted for a code, accounts that did not log in with the password alone.
- **Host resolution.** `resolveTenantHost` (`server/src/middleware/tenantHost.js`) maps the Host header to a tenant only
  through `Domain` records with `verifiedAt` set, cached in memory for 60 seconds. Single mode always binds the default
  tenant and never answers 404; multi mode answers `404 TENANT_NOT_FOUND` for an unknown host. Platform staff must send
  `X-Tenant-Id` on tenant routes in multi mode.
- **G5 migration.** `tenancy-004-staff-accounts` (`server/migrations/0007_tenancy_staff_accounts.js`) copies admin
  `User`s to `StaffAccount` with the same `_id`, keeps the legacy `/api/auth/login` path, and promotes role-less admins
  only in the bootstrap case (no owner yet). It is idempotent. Emergency recovery is `scripts/staff-recover.mjs`.
- Add-ons reach all of this through `server/src/tenancy/index.js` (`StaffAccount`, `RoleAssignment`, `resolveTenantHost`,
  `requireStaff`, `requireStaffPermission`, `signStaffAccess`), never by importing core internals.

## Workflow

- Branch from `origin/main`, open PRs against `main`, run `npm test` and the leak scan before pushing.
- Serialize GitHub mutations, do not burst PRs or retries, never bypass a restriction with another account.
