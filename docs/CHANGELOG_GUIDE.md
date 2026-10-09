# Changelog and Release Note Template

This repository keeps `CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. Every feature/fix commit adds its own entry under the unreleased
section — the version number only increases when a phase is closed.

> **The unreleased heading is a literal string:** `## [Yayınlanmadı]`
> ("unreleased" in Turkish). It is **not** translated. `scripts/check-changelog.mjs`
> and `scripts/release.mjs` look for exactly this text, and the entries
> themselves are written in Turkish to match the rest of `CHANGELOG.md`.

## Entry template

Each entry follows this shape:

```
- <What was added/changed, one sentence>. <1-3 sentences on why/how it works,
  if needed>. (<Card code, e.g. T1, D6>)
```

Categories (use only the relevant ones, never open an empty category):

- **Eklendi** (Added) — new feature/module.
- **Değişti** (Changed) — change in existing behavior (backwards compatible).
- **Kırılan Değişiklikler** (Breaking changes) — a change that can break an
  existing integration/install. **Always state how much it breaks and how to
  transition** — "X now requires Y, existing installs must do Z".
- **Kaldırıldı** (Removed) — deleted feature/endpoint/field.
- **Düzeltildi** (Fixed) — bug fix.
- **Güvenlik** (Security) — a closed security vulnerability (reference the CVE
  if there is one).

## How an entry is checked

`node scripts/check-changelog.mjs [--base origin/main]` looks at the files the
branch changed relative to the base. It fails when server, client, installer,
Docker/env files, dependencies or add-on pointers changed without the
`## [Yayınlanmadı]` section changing; it passes when only documentation, tests
or maintenance scripts changed. The `pre-push` hook runs it on every push
(install it once per clone with `sh scripts/install-hooks.sh`). If a change
really does not affect the operator (for example a code comment only), add a
separate `Changelog: none` line to the commit message.

## Cutting a release

Every PR adds its own entry under `## [Yayınlanmadı]`. To cut a release:

1. `node scripts/release.mjs <X.Y.Z>` (look at it with `--dry-run` first). The
   script renames the `[Yayınlanmadı]` heading to `## [X.Y.Z] — YYYY-MM-DD`,
   opens a new empty `[Yayınlanmadı]` above it, bumps the root/server/client
   `package.json` and lock files to the same number, and updates the README
   badges. It stops if the section is empty or the number is not greater than
   the latest version.
2. The change goes into `main` through a PR.
3. The merge commit is tagged `vX.Y.Z` and a GitHub Release is created for the
   section in `CHANGELOG.md`.

Pick the number by SemVer: something that breaks the install, an API consumer
or the schema → major, a new feature → minor, a fix → patch. The running version
is read from the `version` field of the `GET /api/health` response.

## Versions before 1.0.0

The 0.x history was rebuilt so that every pull request merged before 1.0.0 is
its own version with its own entry: the PRs are ordered by merge time and spread
linearly from 0.0.0 to 1.0.0 (the k-th of N PRs gets minor
`⌊(k−1)·100/(N−1)⌋`; PRs landing on the same minor take a patch). The rule and
the commit each version points to come from `scripts/version-history.mjs` in
the development repository (not part of the public core): without arguments it
prints the PR → version → commit table, `--tag` creates the annotated tags
locally (pushing them is a separate step); it never creates `v1.0.0`, which
points to the release PR's merge commit that carries the version numbers and
this changelog. The 0.x tags exist only there; the
public core is tagged from `v1.0.0` on. Entries are written
for the operator: internal-only PRs (deployment, CI, internal notes) keep a
one-line entry so that no merged PR is missing. From 1.0.0 on, versions are cut
with `scripts/release.mjs` and follow SemVer.

## The "what does this break" discipline — mandatory

If a change affects an existing install, an API consumer or the database
schema, it is written under **Kırılan Değişiklikler** without exception — it is
not softened with phrases like "largely backwards compatible". Example:

```
### Kırılan Değişiklikler
- `GET /api/theme` no longer requires authentication (it was mistakenly behind
  `requireAuth` before) — no risk to reverse integrations, note only.
- `User.walletAddress` was added, with a sparse unique index. Existing user
  documents are unaffected, no new migration is required.
```

## Why this discipline exists

Operators who run the platform on their own server apply updates to their own
install by hand. If "what changed" is unclear, an operator either never applies
the update (a security fix stays unapplied) or applies it blindly and breaks
production. The changelog is not a courtesy here; it is the human-readable half
of the signed update-package flow (`server/src/agent/updatePackage.js`).