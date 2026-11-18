# Open items after 1.1.0 — implementation plan

Owner request (2026-11-18): close the open items following the reviewer's recommendations and industry practice.
Three independent work packages; each runs in its own branch from `origin/main` and ends with its own PR.

## Common rules

- Public, brand-neutral core: no product names, internal hostnames, absolute `/Users` paths; e-mails `*.example.com`.
- Single mode behaves as today unless this plan says otherwise. Never weaken an existing check; never change an
  existing test to make a new one pass (a test that pins the bug being fixed is updated and the change explained).
- Do NOT run the full root `npm test` (shared local MongoDB); run the task's files and directly related ones with
  `--test-timeout=60000`; each new test file uses its own database name and rebuilds the indexes it needs after
  dropping the database.
- Every operator-visible change gets a CHANGELOG entry under `[Yayınlanmadı]` (Turkish) and the current-state docs
  that describe it are updated in the same PR (`docs/product/*`, `docs/providers/*`, `server/.env.example`).
- Run `node scripts/lint-tenancy.mjs`, `node scripts/lint-tenant-sockets.mjs`, `node scripts/leak-scan.mjs`,
  `node scripts/check-changelog.mjs`. Commit by explicit path.

## İP-9f — provider fees from contracts (NGR `providerFees`)

Industry practice: a game content provider (aggregator) bills the operator a contracted percentage of the GGR
generated on its games, per operator agreement, invoiced monthly; rates change by contract amendment.

- New platform model `ProviderFeeSchedule` (`server/src/models/ProviderFeeSchedule.js`, never tenant-scoped):
  `{ tenantId (null = platform default for every tenant), provider ('igames' | 'inhouse' | other CasinoRound.provider
  key), rateOfGgr (0..1, required), minimumMonthlyFee? (number, default 0, documented but not applied daily),
  currency, validFrom (Date, required), validTo (Date|null), createdBy, note }`; at most one open schedule per
  `{tenantId, provider}` (partial unique on `validTo: null`), pinned in `server/test/tenancyUniqueIndexes.test.js`.
  The tenant-specific schedule wins over the platform default (`tenantId: null`) for the same provider and day.
- `server/src/services/tenantDailyStat.js`: per tenant/day/currency, provider GGR = Σ over `CasinoRound` of that
  provider (bet − payout, settled rounds, same rules the job already uses for `casinoGgr`); `providerFees` = Σ
  provider GGR × rate valid that day (minor units, one rounding per provider line, no fee on negative provider GGR —
  document it); also store `providerFeesByProvider: { [provider]: amount }`. Sportsbook feed cost is NOT included
  (it is the K20 `OperatorFeePlan` `sportsbookFee`, NGR source `fee_plan`).
- `ngrRules.js`: `providerFees` stays a `provider_fee` stat field. Allow the K20 sportsbook fee as a second provider
  cost only as an `other` item with a distinct label (document this in the operator guide's NGR section).
- Platform API (`server/src/platform/routes/index.js`, permission `platform:billing:manage` for writes,
  `platform:billing:read` for reads): list/create/close schedules; creating a new schedule closes the open one for the
  same `{tenantId, provider}` (`validTo = new validFrom`); audited with `writePlatformLevelAudit`; 404 in single mode
  like the other platform routes. Console page under billing: list + create form (Turkish UI, basename `/console`).
- Tests: aggregation with two providers and a mid-month rate change; tenant schedule overriding the default; negative
  provider GGR → no fee; refunds/chargebacks unaffected; NGR with `stat_field: providerFees`; API permissions and audit;
  console page test + `(cd console && npx vite build)`.
- Docs: `docs/product/12-cok-operator.md` (NGR / provider fees), `09-bilinen-kisitlar.md` (remove "providerFees has
  no source"; keep that the minimum monthly fee is informational), `06-sss.md` if it mentions provider fees.

## İP-10a — capacity measurement for the İP-10 thresholds

Spec §7.1: until a threshold is crossed only measurement is done: concurrent Socket.IO connections, event-loop delay
and CPU; thresholds: sockets p95 > 2,000 over 15 min; event-loop delay p99 > 100 ms for 15 min; process CPU > 70 %
for 15 min, three or more times a week; approaching = 70 % of a threshold starts the İP-10 design.

- `server/src/services/capacityMetrics.js`: sample every 10 s (unref'd timer, started from `server.js` in both modes):
  connected sockets (all namespaces, from the io instance), `perf_hooks.monitorEventLoopDelay` (reset each window),
  `process.cpuUsage` delta / wall time. Aggregate per 15-minute window: sockets p95, event-loop p99 (ms), CPU average %.
  Persist each window in a platform collection `CapacityWindow` (`{ windowStart, host, pid, socketsP95, eventLoopP99Ms,
  cpuPct }`, TTL 90 days).
- Threshold evaluation `evaluateCapacity({ now })`: per metric `ok | approaching | exceeded` using the spec numbers and
  the 70 % rule; CPU "exceeded" only when ≥ 3 windows over 70 % within the last 7 days. Thresholds configurable via env
  (`CAPACITY_SOCKETS_P95`, `CAPACITY_EVENT_LOOP_P99_MS`, `CAPACITY_CPU_PCT`) with the spec values as defaults.
- Surfaces: `GET /api/health/status` gains `capacity: { state, sockets, eventLoop, cpu }` (no secrets; existing fields
  unchanged); multi mode: `GET /api/platform/system/capacity` and a console card next to the N6 gates; when a metric
  changes to `approaching` or `exceeded`, log once per change (`console.warn('[capacity] …')`) and write an activity
  event for platform staff in multi mode.
- Tests: window aggregation math (p95/p99/avg) on synthetic samples; evaluation states incl. the CPU 3-in-7-days rule;
  sampler start/stop does not keep the process alive; status endpoint field present; platform route permission.
- Docs: `docs/product/09-bilinen-kisitlar.md` (single process until thresholds; how to read capacity),
  `docs/product/12-cok-operator.md` (capacity card), `docs/product/02-yapilandirma.md` + `server/.env.example`
  (the three env values), RUNBOOK-style note in `docs/product/11-admin-araclari.md` if it documents health/status.

## Fixes — PWA manifest and a deterministic demo seed

1. **PWA manifest (İP-8 follow-up).** `client/vite.config.js` still builds `manifest.webmanifest` with a product name
   and the service worker precaches it, so installed apps never see the per-tenant `/manifest.webmanifest` route and core
   ships a product name. Set VitePWA `manifest: false`, add `<link rel="manifest" href="/manifest.webmanifest">` to
   `client/index.html`, make sure `manifest.webmanifest` is not in the precache list (assert on `dist/sw.js` in a test
   or a build-check script under `client/scripts/__tests__/`), keep icons precached. The server route (İP-8) already
   serves the manifest in both modes; verify single mode still returns today's name from settings.
2. **Deterministic demo seed.** `server/test/demoData-seed-economics.test.js` fails intermittently (sports margin
   16.4 % > 15 % band) because the demo seeds use `Math.random`. Give the demo seed modules an injectable RNG
   (default `Math.random`, behaviour unchanged at runtime) and use a fixed-seed PRNG (e.g. mulberry32) in the test; the
   assertions stay as they are. Run the test 20 times in a row — it must pass every time.
- CHANGELOG entries for both; docs only where they describe the manifest (`docs/product/02-yapilandirma.md` / 12 if
  they mention it).
