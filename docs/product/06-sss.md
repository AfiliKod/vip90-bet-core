# Frequently Asked Questions

This list was compiled from real buyer questions on similar products — the goal is to leave no ambiguity before purchase.

**What is included, which parts are sold separately?**
The core platform (accounts, wallet, bonus/wagering, KYC, risk, affiliate, admin panel, theme/branding) is the base product. **In-house Games** (13 games: Crash, Mines, Plinko, Dice, Limbo, Wheel, Hilo, Keno, Blackjack, Roulette, Baccarat, Video Poker, Dragon Tiger), **Sports Betting** and **Casino Content** (slots, table games via an aggregator) are **separate paid add-ons**; the core runs without them. The crypto (USDT-TRC20), Slikair and KYC modules come with the core. **Live Casino** (real dealer tables) is a planned future update and is not in this release. See [03 — Module System](03-modul-sistemi.md) and [01 — Installation § Add-on modules](01-kurulum.md#add-on-modules-in-house-games-sports-betting-casino-content).

**Will my license reset if I change the domain?**
The product is delivered as source code, there is no domain-locked license verification mechanism. Updates and support terms are set in your purchase agreement.

**Do you provide installation service, how much does it cost?**
This document is sufficient for self-installation ([01 — Installation](01-kurulum.md)). For buyers who want installation service, a separate fixed-price package will be listed on our sales channel.

**Which payment methods come in the box?**
Bank transfer (manual approval flow) and USDT-TRC20 crypto deposit/withdrawal are in the box, plus a Slikair card/alternative-method gateway — which has only been verified against Slikair's sandbox; going live requires a Slikair merchant account with KYB (see [09 — Known Limitations](09-bilinen-kisitlar.md)). Other crypto networks are not supported. Each payment module must be switched on under **Settings → Modules** (Slikair is on by default, crypto is off until you enable it).

**Does the casino provider require a GGR share?**
Using the Casino Content add-on requires a separate commercial agreement with your chosen casino content aggregator — this is not included in the add-on price, subject to the aggregator's own terms.

**How many languages does it support?**
Eight languages (TR, EN, KO, TH, ES, JA, PT, DE; `client/src/i18n/dictionaries/`, ~2,790 keys each) with a language switcher in the site's navigation bar and a default language for new visitors set in **Settings → General**. Player screens are translated in all eight; the admin panel is complete in TR and EN and partly English in the other six ([09 — Known Limitations](09-bilinen-kisitlar.md#i18n--admin-panel-partly-english-in-6-languages)). The setup wizard (`/install`) is available in English and Turkish. The static company/legal pages take their content from the static-page editor instead of the dictionaries. See [02 — Configuration § Multi-language support](02-yapilandirma.md).

**Does it support multiple currencies?**
There is a single active display currency across the site (not a per-user separate wallet) — it can be selected from TRY/USD/EUR under **Settings → General → Region & Currency** and the selection changes the symbol/locale formatting without converting amounts (see `server/src/currency/registry.js`). Users holding balances in multiple currencies simultaneously is not supported; the **Currencies** tab under Settings manages exchange-rate records only.

**Can I adjust RTP / house edge from the panel?**
Yes (with the In-house Games add-on). For each of the 13 in-house games, the variables that actually determine RTP — house edge/payout factor, min-max bet, and timing — can be changed from **Products → In-house Games** in the admin panel (`client/src/pages/admin/GameSettings.jsx` → `PATCH /admin/game-settings/:gameId`); each change is logged with who/when/old-new value (`GameSettings.changeLog`). The mathematics itself (which variable determines what) is documented with the In-house Games add-on; for the panel side, see [02 — Configuration](02-yapilandirma.md).

**How do I enable/disable modules (betting/casino content/in-house games/payments/KYC/SMS)?**
From **Settings → Modules** in the admin panel with a single click (`client/src/pages/admin/Modules.jsx` → `PATCH /admin/modules/:id`), without restarting the server. A disabled module's pages are gracefully hidden from visitors with a "This section is currently unavailable" message, the core platform is unaffected (`ModuleGate` component). New installations start with every module off except Slikair, so switch on what you use after installing. If you haven't defined a `LICENSE_SERVER_URL`/`LICENSE_KEY` (most operators don't), all modules are automatically considered "licensed" — the product works out of the box. See [03 — Module System](03-modul-sistemi.md).

**Can I change the logo/favicon/color theme from the panel?**
Yes — this is a feature missing from many similar products and the most complained about; in VIP90.bet you can change the logo, favicon, site name, font, and color theme from **Personalization** in the panel (Theme · Branding tabs, three ready-made theme presets), no code editing needed. Static pages and the homepage slider are edited with form-based editors; there is no drag-and-drop page builder.

**Do I need to pay for support each time? Is there really a help desk/support assistant?**
Basic support is included during the support period set in your purchase agreement. Additionally, a **ticket system** (`server/src/routes/ticket.js` — player opens/replies to tickets, admin replies/changes status) and a **support assistant chatbot** (`server/src/routes/help.js`, `server/src/services/chatbotIndex.js`) that reads and parses `docs/product/*.md` + `CHANGELOG.md` already exist in the codebase and are functional — if `AI_HELP_API_KEY` is not defined, the chatbot returns "currently under maintenance, open a ticket" instead of crashing, and the flow still ends up in a ticket. (This FAQ file is also one of the documents the chatbot reads; the Docker image includes `docs/product/` and `CHANGELOG.md` for that purpose.)

**Does KYC (identity verification) actually work?**
Yes. The submission and review flow works end to end (the `kyc-verification` module): the player uploads documents on the `/kyc` page (manual mode) or goes through a Sumsub session (Sumsub mode), the admin approves/rejects under **Compliance → KYC**, the player is notified, and the provider and Sumsub credentials are chosen under **Settings → Modules → KYC Identity Verification**. When the `kyc-verification` module is **enabled**, every player withdrawal (`POST /api/bank/withdraw`, `/api/transactions/withdraw`, `/api/crypto/withdraw-request`) requires an approved KYC and otherwise answers `403 KYC_REQUIRED` (the Profile page then sends the player to `/kyc`); with the module disabled nothing changes. Deposits and bets are not gated by KYC, and Slikair has no player withdrawal endpoint (admin payout only). Approvals older than a year are expired by a daily job (`jobs/kycExpiry.js`). The wizard can start the module enabled; by default it starts disabled. See [09 — Known Limitations](09-bilinen-kisitlar.md) and [`docs/providers/local-kyc.md`](../providers/local-kyc.md).

**Is there a mobile app or Telegram Mini App?**
PWA (addable to home screen, offline shell) support exists. A Capacitor iOS project exists in `client/ios`; `client/capacitor.config.json` no longer points at a development server (only `appId`, `appName`, `webDir`), and `npm run cap:sync:dev` (with `CAP_SERVER_URL`) temporarily writes a dev config for live reload. It has not been checked for store readiness here; there is no Android project and no Telegram Mini App at this time.

**Does it work on shared hosting?**
No. Because Node.js + MongoDB + WebSocket work together, a real VPS is needed, minimum 4 vCPU / 8 GB RAM recommended. See [01 — Installation](01-kurulum.md).