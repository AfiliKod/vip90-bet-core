# Frequently Asked Questions

This list was compiled from real buyer questions on similar products — the goal is to leave no ambiguity before purchase.

**Which games are included, which are sold separately?**
None of the 13 in-house games (Crash, Mines, Plinko, Dice, Limbo, Wheel, Hilo, Keno, Blackjack, Roulette, Baccarat, Video Poker, Dragon Tiger) are in this core package — they're a separately licensed module (engine + playable UI), same as sports betting and casino content. This repo ships the shell that would host them (launcher UI, wallet/bonus hooks, admin economy-settings screen) plus a public "recent winners" endpoint, but not the game logic itself. See [03 — Module System](03-modul-sistemi.md).

**Will my license reset if I change the domain?**
The product is delivered as source code, there is no domain-locked license verification mechanism. Updates and support are tied to your purchase.

**Do you provide installation service, how much does it cost?**
This document is sufficient for self-installation ([01 — Installation](01-kurulum.md)). For buyers who want installation service, a separate fixed-price package will be listed on our sales channel.

**Which payment methods come in the box?**
Bank transfer (manual approval flow) and USDT-TRC20 crypto deposit are in the box. Additional payment provider (card, other crypto networks) integration can be added to the codebase but isn't ready today.

**Does the casino provider require a GGR share?**
Using the casino module requires a separate commercial agreement with your chosen aggregator (a licensed provider or our recommended channel) — this is not included in the platform price, subject to the aggregator's own terms.

**How many languages does it support?**
TR and EN dictionaries are ready (`client/src/i18n/dictionaries/`, each ~1490 keys), the language switcher is accessible from everywhere in the site's navigation bar, and 59 of 67 page components read from the dictionary. But **translation coverage is still incomplete** — large pages like `HomePage.jsx`, `Bahis.jsx`, `Live.jsx`, `CasinoRedesign.jsx`, `Profile.jsx` still have directly embedded Turkish text. So the infrastructure and navigation are mostly done, page contents are partially translated; see [02 — Configuration § Multi-language support](02-yapilandirma.md).

**Does it support multiple currencies?**
There is a single active currency across the site (not a per-user separate wallet) — it can be selected from TRY/USD/EUR in the admin panel and the selection changes the symbol/locale formatting (see `server/src/currency/registry.js`). Users holding balances in multiple currencies simultaneously is not supported.

**Can I adjust RTP / house edge from the panel?**
The core ships the **Game Settings** screen and data model (`client/src/pages/admin/GameSettings.jsx` → `PATCH /admin/game-settings/:gameId`, `GameSettings.changeLog`) for configuring each in-house game's house edge/payout factor, min-max bet, and timing. These values are only consumed once the licensed In-house Games module is installed and reading them; for the panel side alone, see [02 — Configuration](02-yapilandirma.md).

**How do I enable/disable modules (betting/casino content/in-house games)?**
From the **Modules** screen in the admin panel with a single click (`client/src/pages/admin/Modules.jsx` → `PATCH /admin/modules/:id`), without restarting the server. A disabled module's pages are gracefully hidden from visitors with a "This section is currently closed" message, the core platform is unaffected (`ModuleGate` component). If you haven't defined a `LICENSE_SERVER_URL`/`LICENSE_KEY` (most operators don't), all modules are automatically considered "licensed" — the product works out of the box.

**Can I change the logo/favicon/color theme from the panel?**
Yes — this is a feature missing from many similar products and the most complained about; in VIP90.bet you can change the logo, favicon, site name, font, and color theme from the panel, no code editing needed.

**Do I need to pay for support each time? Is there really a help desk/support assistant?**
Basic support is included during the support period tied to your purchase. Additionally, a **ticket system** (`server/src/routes/ticket.js` — player opens/replies to tickets, admin replies/changes status) and a **support assistant chatbot** (`server/src/routes/help.js`, `server/src/services/chatbotIndex.js`) that actually reads and parses `docs/product/*.md` + `CHANGELOG.md` already exist in the codebase and are functional — if `AI_HELP_API_KEY` is not defined, the chatbot returns "currently under maintenance, open a ticket" instead of crashing, and the flow still ends up in a ticket. (This FAQ file is also one of the documents the chatbot reads.)

**Does KYC (identity verification) actually work?**
Partially — honestly, no, not end-to-end. `server/src/services/kyc.js` exists as a rich service covering document submission, approval/rejection, expiry flows, but it's not connected to any route/controller (`requireKyc`, `submitKycDocuments` aren't called anywhere). There's no document upload interface on the user side. In the admin panel, there's only a raw `kycVerified` checkbox on the user card (`client/src/pages/admin/components/UserSlideOver.jsx`) — the admin checks it manually, no automatic verification flow runs. Implementing KYC for real (document upload interface + connecting routes to the service) requires a separate development card.

**Is there a mobile app or Telegram Mini App?**
PWA (addable to home screen, offline shell) support exists. No native mobile app or Telegram Mini App at this time.

**Does it work on shared hosting?**
No. Because Node.js + MongoDB + WebSocket work together, a real VPS is needed, minimum 4 vCPU / 8 GB RAM recommended. See [01 — Installation](01-kurulum.md).