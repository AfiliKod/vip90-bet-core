![VIP90.bet](https://img.shields.io/badge/VIP90.bet-iGaming%20Platform-1a2332?style=for-the-badge)
![Version](https://img.shields.io/badge/version-1.0.0-6366f1?style=flat-square)
![Node](https://img.shields.io/badge/node-22-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/mongodb-7%20(replica%20set)-47A248?style=flat-square&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-AGPL--3.0%20%2B%20commercial%20add--ons-blue?style=flat-square)

# VIP90.bet

**English** · [Türkçe](README.tr.md)

**Self-hosted full-stack betting and casino platform with sportsbook,
live betting, casino, wallet, bonuses, affiliate and admin management.**

An online casino and sports betting platform that runs on your own
infrastructure under your own brand. The **core platform** (accounts, wallet,
bonus/wagering, KYC, risk, admin panel) is the base product and runs on its
own. **In-house Games (13 games), Sports Betting and Casino Content are
separate paid add-ons** that plug into the core: one codebase, one admin
panel. **Live Casino** (live dealer tables) is a planned future update and is
not part of this release.

Many "casino scripts" sell an empty shell wrapped in demo data that breaks the
moment you try to go live. VIP90.bet's core is the opposite: the wallet ledger,
bonus/wagering engine, risk and compliance tools, theme editor, live chat and
referral commissions are real and tested. We do not hide what is not mature
yet; see the [Roadmap](#roadmap) and [Known Limitations](docs/product/09-bilinen-kisitlar.md).

---

## Contents

- [Highlights](#highlights)
- [What's Included](#whats-included)
- [Module System](#module-system)
- [Architecture and Tech Stack](#architecture-and-tech-stack)
- [Quick Start](#quick-start)
- [Security](#security)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Licensing](#licensing)

---

## Highlights

| | |
|---|---|
| 🛠️ **Full admin panel (core)** | Users, roles/permissions, analytics with live KPIs and revenue charts, theme/brand editor, static page and homepage slider editors, module switches, wallet (bank/crypto/Slikair), help desk, player segmentation, risk/compliance, system health monitoring |
| 💰 **End-to-end crypto payments (module)** | USDT-TRC20: HD-wallet deposit tracking, automatic or approved withdrawals from a hot wallet, transaction history in the admin panel, Web3 login with a wallet signature |
| 💳 **Slikair payment gateway (module)** | Card and alternative-method deposits; verified with sandbox credentials only, going live requires Slikair KYB |
| 🪪 **Two KYC options (module)** | Local document review (admin approve/reject queue) or automated verification with Sumsub, selectable in the panel |
| 👑 **VIP and real-time cashback** | Default 5-level VIP programme (Bronze–Diamond, editable in the panel); level-based cashback is credited right after each settled bet or round |
| 🌍 **Multi-language and PWA** | 8 language dictionaries (player screens translated in all 8; the admin panel is complete in English and Turkish, partly English in the other six) with a global language switcher, installable Progressive Web App, iOS Capacitor shell |
| 🧩 **Modular licensing** | The core is always on; Betting / Casino Content / In-house Games / Crypto Payment / Slikair / KYC / SMS Gateway are managed in the panel; the first three are separate paid add-ons |
| ✉️ **Email and SMS communication** | Event-triggered system emails and SMS, scheduled campaigns, segment targeting and delivery logs on a single **Communication** page; SMTP/Mailgun for email, Twilio for SMS |
| 💱 **Currency, brand and jurisdiction managers** | Currencies / Brands / Jurisdictions tabs under Settings; the site runs with one display currency and brand data isolation is not enforced ([Known Limitations](docs/product/09-bilinen-kisitlar.md)) |
| 🚀 **Setup wizard** | After `docker compose up -d`, open `/install` in the browser (English/Turkish) for the first admin account and site settings; a `.env` (JWT keys, database) is needed beforehand for the server to start |
| 🎰 **13 in-house games (paid add-on)** | Crash, Mines, Plinko, Dice, Limbo, Wheel, Hi-Lo, Keno, Blackjack, Roulette, Baccarat, Video Poker, Dragon Tiger; all HMAC-SHA256 **provably fair**, house edge adjustable per game in the panel |
| ⚽ **Sports and live betting (paid add-on)** | 30 sport definitions, live odds feed, single/combo bet slip, automatic settlement |
| 🃏 **Casino Content (paid add-on)** | Slots and table games through an aggregator integration (one iGaming content provider adapter today) |

## What's Included

### 🧱 Core platform

- Accounts, email verification, password reset; email/password, Google and
  Telegram login, and registration/login with a **Web3 wallet signature**.
- Wallet ledger (atomic, idempotent), bank transfers (admin approval queue),
  bonus/wagering engine, VIP programme, referral commissions.
- Admin: roles/permissions (RBAC), TOTP 2FA, audit log, risk engine and
  rules, reconciliation framework, responsible gaming controls, player
  segmentation, agent (reseller) system, support tickets, moderated live
  chat.
- Theme/brand/SEO settings, static pages, multi-language interface.
- Communication: editable system email and SMS templates, scheduled
  campaigns and automations, delivery logs (email via SMTP/Mailgun, SMS via
  Twilio).

### 💳 Payment and KYC modules (included with the core)

- **USDT-TRC20** crypto payments: HD-wallet deposit tracking, withdrawals
  from a hot wallet.
- **Slikair** card/alternative payment gateway (sandbox; live use requires
  KYB).
- **KYC**: local document review (approve/reject queue) or the **Sumsub**
  integration, one of them selected in the panel.

### 🎰 13 In-House Games (paid add-on)

A game library you own, with no third-party contract required:

**Crash · Mines · Plinko · Dice · Limbo · Wheel · Hi-Lo · Keno ·
Blackjack · Roulette · Baccarat · Video Poker · Dragon Tiger**

- Every round comes from an HMAC-SHA256 derivation of a `serverSeed` that is
  committed (its hash published) **before** the round, combined with a
  player-changeable `clientSeed` and a `nonce` that increases each round
  (**provably fair**). The **Fairness** panel on each game rotates the seed,
  reveals the previous one and recomputes past rounds in the browser without
  trusting the server.
- House edge and bet limits are set per game in the admin panel
  (**Products → In-house Games**): not a single abstract "RTP" field, but the
  variables that actually make up each game's maths.
- The game front end (`game-host`) is a separate application hosted on its
  own; the engine runs inside the main server process.

### ⚽ Sports Betting and Live Betting (paid add-on)

- League/country hierarchy for 30 sport definitions (football, basketball,
  tennis, ice hockey, boxing, rugby, cricket, motorsport, chess and more);
  which categories are shown is chosen under **Products → Sportsbook →
  Categories**.
- Live and upcoming events in separate feeds; per-market odds tables on the
  event page.
- Single and combo bet slip, automatic settlement engine: once an event is
  settled, the balance is credited in one atomic transaction.
- Odds data comes from a separate application (`odds-provider`); the data
  source contract is your responsibility.

### 🃏 Casino Content (paid add-on)

- Standard aggregator connector that brings a slot and table game catalogue
  into the platform. There is one iGaming content provider adapter today; a
  second provider is added by writing another adapter.
- Provider filters, favourites, recently played, search; popular games and
  bonus/freeround management in the admin panel (**Products → Casino
  Provider**).
- Live dealer **Live Casino is a planned future update**; there is no code
  for it in this release.

### 🎉 Community and retention

- Moderated live chat, "rain" bonus drops, tipping between players.
- Live wins feed (Recent Winners), favourites, recently played.
- Single-tier referral links and commissions: a percentage of the house
  profit generated by an invited user (default 10%, adjustable in the panel)
  is paid directly to the user who invited them.
- Configurable "players online" social proof layer.

### 🎨 Brand and visual identity

- Theme editor with live preview and 3 ready-made themes, logo/favicon/font
  upload (**Personalization**).
- Form-based static page and homepage slider editors (About, Careers, Press,
  Contact, etc.); there is no drag-and-drop page builder.

### 🛠️ Admin panel

Menu groups: **Overview** (Dashboard, Analytics) · **Customers** (Users,
Agents, Segments, Tickets) · **Wallet** · **Compliance** (KYC, Risk,
Reconciliation, Responsible Gaming; Audit Log) · **Products** (Casino
Provider, In-house Games, Sportsbook) · **Engagement** (Promotions, VIP,
Communication, Chat) · **Platform** (Settings: General · Modules ·
Currencies · Jurisdictions · Brands · SEO; Personalization; Roles; System
Health & Logs) · **Demo & Simulation** (Demo Data, Bots).

## Module System

VIP90.bet's core (user management, wallet, bonus/wagering engine, referral
commissions, KYC, risk, admin panel, i18n) is **always on**: it is not a
module and works fully without any add-on.

Seven modules are switched on and off in the admin panel (**Settings →
Modules**); when a license server is configured, the license state is
checked as well (`server/src/modules/registry.js`). The **Email Gateway** card
at the end of the same screen is not a module: it belongs to the core, is
always on, and is where the email provider (SMTP/Mailgun) is configured.

| Module | Provides | How it ships | Dependency |
|---|---|---|---|
| **Betting** (`betting`) | Odds feed, bet slip, automatic settlement | **Paid add-on** (`server/src/premium/betting`) | Contract with a sports data provider |
| **Casino Content** (`casino-content`) | Aggregator connector for slots/table games | **Paid add-on** (`server/src/premium/igames`) | Aggregator contract |
| **In-house Games** (`inhouse-games`) | 13 provably fair games served from a separate game server (JWT + origin protected) | **Paid add-on** (`server/src/premium/inhouse-provider`) | None, no third-party contract |
| **Crypto Payment Gateway** (`crypto-payment`) | USDT-TRC20 deposits/withdrawals | Included with the core | None |
| **Slikair Payment Gateway** (`slikair-payment`) | Card and alternative-method deposits | Included with the core; exempt from the license check | Slikair merchant account |
| **KYC Identity Verification** (`kyc-verification`) | Local document review or Sumsub | Included with the core | Third-party contract if Sumsub is chosen |
| **SMS Gateway** (`sms-gateway`) | System and campaign SMS | Included with the core | Twilio account |

The three paid add-ons live under `server/src/premium/` as **private git
submodules**; the core starts without them (optional dynamic import; their
endpoints answer `503 MODULE_NOT_INSTALLED`). While a module is switched off
its API endpoints answer `MODULE_DISABLED` and the rest of the platform keeps
working. To install the add-ons, see
[Installation § Add-on modules](docs/product/01-kurulum.md#add-on-modules-in-house-games-sports-betting-casino-content).
**Live Casino is a planned future update** and does not exist as a module
yet. Data/content provider contracts are separate from the platform: **bring
your own provider**, or ask us for an introduction to get started.

## Architecture and Tech Stack

```
client/    React 19 + Vite + Tailwind + Zustand — SPA, PWA, Capacitor (iOS)
server/    Node.js + Express + MongoDB (Mongoose) + Socket.IO
           JWT auth · Zod validation · Helmet · rate limiting
installer/ Browser-based setup wizard (/install)
deploy/    Caddy reverse proxy configuration (Docker)
server/src/premium/   Paid add-ons (private git submodules)
  inhouse-provider/   game engine + game-host/ (separate React/Vite app)
  betting/            settlement + sync jobs + odds-provider/ (separate Node app)
  igames/             casino aggregator integration
```

`docker compose` runs only the `mongo`, `app` and `caddy` services;
`game-host` and `odds-provider` are **not** in Docker and are installed
separately ([Installation](docs/product/01-kurulum.md)). MongoDB must run as a
single-node replica set (multi-document transactions are used).

**Notable technical decisions:**

- **Real-time layer** over Socket.IO: odds, the online player counter, live
  chat and the wins feed are all push-based (no polling).
- **Module gate** (`moduleGate` middleware) checks the license and panel
  switch on every request and returns a consistent error contract (except
  `/api/igames`, which only checks the provider token).
- **Shared UI building blocks**: page templates (`PageWithRail`,
  `HomeSidebar`) are managed in one place, so copies cannot drift apart.
- Automated test suite covering auth, betting, wagering, the module gate and
  i18n (`npm test`).

## Quick Start

### With Docker (recommended)

```bash
cp .env.docker.example .env     # DOMAIN, JWT_SECRET, JWT_REFRESH_SECRET, CLIENT_URL, SMTP...
docker compose up -d            # mongo + app + caddy
```

Then open **`https://DOMAIN/install`** in the browser: a one-page wizard
creates the first admin account and sets the site name and currency. The
`.env` file must be filled in beforehand (sessions cannot be issued without
the JWT keys); the wizard writes the admin account, the site name/currency
and, optionally, which of the Crypto/KYC modules start enabled.

### Manual installation

```bash
npm i && npm i --prefix server && npm i --prefix client   # core dependencies
cp server/.env.example server/.env                        # fill in MONGODB_URI, JWT_*, CLIENT_URL
npm start                                                 # client build + server
```

`npm run install:all` also installs the add-on directories (`game-host`,
`odds-provider`) and skips them with a warning when the add-ons are not
present. MongoDB must be a replica set. Open **`/install`** while the server
is running.

To install the add-ons (In-house Games, Sports Betting, Casino Content):
[docs/product/01-kurulum.md § Add-on modules](docs/product/01-kurulum.md#add-on-modules-in-house-games-sports-betting-casino-content).

### Development

```bash
npm run dev   # client + server (+ odds-provider; skipped when the Sports Betting add-on is absent)
```

### Tests

```bash
npm test               # unit/integration tests (server + client i18n/admin/utils); needs a local MongoDB
npm run test:network   # tests that call real external services (Slikair sandbox)
npm run test:e2e       # Playwright end-to-end tests
```

## Security

- HMAC-SHA256 **provably fair** round generation, verifiable by the player.
- JWT-based sessions, scoped tokens for embedded/casino views.
- `helmet`, `express-mongo-sanitize`, layered `express-rate-limit` (limits
  are constants in `server/src/middleware/rateLimit.js`, not env settings).
- TOTP 2FA for admins; optional IP/CIDR restriction for `/api/admin/*` with
  `ADMIN_ALLOWED_IPS`, and Cloudflare Turnstile (both off until configured).
- With the `kyc-verification` module on, player withdrawals require an
  approved KYC (`KYC_REQUIRED`).
- License and permission boundaries enforced at the API level by the module
  gate.
- Role-based access control (RBAC): every admin endpoint checks a permission.
- Audit trail for all critical admin actions (player interventions, financial
  operations, KYC decisions, module changes).
- Responsible gaming controls: deposit/withdrawal/loss/wager limits, cool-off
  periods, self-exclusion, account restrictions.
- Live chat moderation: bans, mutes and message deletions are logged with
  permission checks.
- Financial ledger: every wallet operation is atomic, idempotent and
  auditable.
- The source and license status of visual assets is recorded; provider logos
  are used under the casino content aggregator's guarantee.

## Documentation

Operator documentation lives in [`docs/product/`](docs/product/README.md):

- [Installation](docs/product/01-kurulum.md) · [Configuration](docs/product/02-yapilandirma.md)
- [Module System](docs/product/03-modul-sistemi.md) · [API Reference](docs/product/05-api-referansi.md)
- [FAQ](docs/product/06-sss.md) · [Video Storyboards](docs/product/07-video-storyboardlari.md)
- [Known Limitations](docs/product/09-bilinen-kisitlar.md) · [Bonus and Wagering](docs/product/10-bonus-ve-cevrim.md)
- [Admin Tools — Activity Feed, Demo Data, Casino Rewards](docs/product/11-admin-araclari.md)

Payment and KYC integrations included with the core:
[Crypto Payments — TRC20 USDT](docs/providers/crypto-trc20.md) ·
[Local (Manual) KYC](docs/providers/local-kyc.md) ·
[Sumsub KYC](docs/providers/sumsub-kyc.md).

The technical documentation and game maths of the paid add-ons (In-house
Games, Sports Betting, Casino Content) ship with the add-ons. Release
history: [`CHANGELOG.md`](CHANGELOG.md) (in Turkish).

## Roadmap

The platform is under active development. The items below are features that
are **missing, planned, or present only as a schema/partial implementation
that does not work end to end**; they were confirmed by a code audit and are
not hidden. Full details and code references:
[Known Limitations](docs/product/09-bilinen-kisitlar.md).

- **Live Casino**: live dealer table/video games are a planned future update;
  there is no `live-casino` module, connector or gate in the code.
- **Multi-tier affiliate**: today there is a single tier only. A percentage of
  the house profit an invited user generates goes directly to the person who
  invited them; sub-referrals (tier 2 and beyond) earn nothing yet.
- **Brand data isolation**: multi-brand management exists, but the core
  models have no `brandId`, so data isolation is not enforced.

## Licensing

The core platform is licensed under the
[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`) and
published in the public
[`vip90-bet-core`](https://github.com/AfiliKod/vip90-bet-core) repository.
Under the AGPL, an operator who modifies the core and offers it to users over
a network must make the modified source code available to those users.

The In-house Games, Sports Betting and Casino Content add-ons are separate,
closed-source commercial products; they are kept in their own private
repositories and licensed independently of the core license.

For pricing, support terms and supply details, contact the sales team via
[vip90.bet](https://vip90.bet).

---

<sub>Built with Node.js · Express · React · MongoDB · Socket.IO.</sub>
