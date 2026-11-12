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
- Single-operator installs keep working unchanged on the default tenant (`TENANCY_MODE=single`).
- Agent (reseller) and Partner are different concepts; do not merge them.

## Workflow

- Branch from `origin/main`, open PRs against `main`, run `npm test` and the leak scan before pushing.
- Serialize GitHub mutations, do not burst PRs or retries, never bypass a restriction with another account.
