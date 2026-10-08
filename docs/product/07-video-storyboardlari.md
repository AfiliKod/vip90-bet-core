# Video Library — Storyboards

> **Status note:** This document is the filming foundation for the D2 card (15-20 short videos) and is **complete** — all 18 storyboards are written scene by scene. Actual video recording/editing has not been done — this is a deliberate scope decision: research on which tool to use (a tool that can produce screen recording + voice-over narration, or a model that can generate video from text) will be done at the end of the development flow. Storyboard writing didn't wait for that research; each scene is clear enough to hand directly to filming/production when you get your hands on the tool.
>
> Menu names changed on 2026-10-02 (Settings with General · Modules · Currencies · Jurisdictions · Brands · SEO tabs, a Products group, Wallet as a top-level entry) and In-house Games, Sports Betting and Casino Content are now separate paid add-ons; re-check each storyboard's menu references against [02 — Configuration](02-yapilandirma.md) and [03 — Module System](03-modul-sistemi.md) before filming.
>
> Some storyboards describe screens from cards not yet merged into the integration branch at the time but belonging to code on the relevant `feat/akis-*` branch (K2, M3, O6 — all completed on their respective branches). This doesn't mean the storyboard is incomplete — when those branches are merged, the screens will be there as described, the storyboard is ready from today.

## Format rule

Each video: **60-120 seconds**, screen recording + voice-over narration, subtitles in Turkish + English (i18n infrastructure is ready, text files will be kept separate). Each storyboard follows this structure:

- **Scene** — what's on screen (with time range)
- **Narration** — voice-over text
- **On-screen text** — highlighted title/callout if any

---

## Group 1 — Installation (3 videos)

### V1.1 — "Setting Up VIP90.bet in 5 Minutes" (90 sec)

| Scene | Narration |
|---|---|
| 0-10s: Terminal screen, an empty VPS | "All you need to set up VIP90.bet is a VPS and five minutes." |
| 10-30s: `npm run install:all` running | "First we install the dependencies — a single command, for both server and client." |
| 30-55s: `.env` file being edited, required fields highlighted | "Then we enter your database address and security keys in the `.env` file." |
| 55-75s: `npm run build && npm start` | "We build and start." |
| 75-90s: Site running in browser | "That's it — VIP90.bet is now running." |

**On-screen text:** "01 — Installation · docs/product/01-kurulum.md"

### V1.2 — "One-Command Docker Installation" — **K1 completed, ready to film**

Shows the Docker Compose + Caddy reverse proxy flow: `docker compose up`, automatic SSL certificate, services coming up.

### V1.3 — "Setup Wizard" — **K2 completed (feat/akis-k), ready to film after merge** (95 sec)

| Scene | Narration |
|---|---|
| 0-10s: Browser opens the setup wizard's first screen (`/install`) | "You can also set up without touching the terminal at all — open the setup wizard in your browser." |
| 10-30s: The wizard's status line shows "Veritabanı bağlı" (database connected) | "The wizard first checks that the database is reachable." |
| 30-55s: Admin account step — username, email, password | "Then we create your first admin account." |
| 55-75s: Site name and currency fields of the same single form | "We choose your site name and currency." |
| 75-95s: "Kurulumu Tamamla" button is clicked, a copyable `.env` block with fresh JWT keys appears | "The wizard generates fresh security keys and shows you a ready `.env` block to save. Then you log in to your admin panel." |

**On-screen text:** "Web-Based Setup Wizard"

> Accuracy note (2026-10-03): the wizard is a single form (site name, currency, first admin, install type, optional Crypto/KYC module switches; for a non-Docker install it also takes your MongoDB URI) and does not test or enter the database address of a running server — `MONGODB_URI` and the JWT keys must already be in `.env` for the server to run, and a manual install saves the shown `.env` output itself. Adjust the opening narration ("without touching the terminal at all") accordingly when filming. Likewise `npm run install:all` in V1.1 also installs the add-on apps when they are present and skips them with a warning when they are not; the core-only commands are in [01 — Installation](01-kurulum.md).

---

## Group 2 — Initial Configuration (3 videos)

### V2.1 — "First Login and Admin Panel Overview" (100 sec)

| Scene | Narration |
|---|---|
| 0-15s: Login screen, login with admin account | "After setup, log in with your admin account." |
| 15-40s: Admin panel main screen, left menu navigation | "The left menu has users, events, casino statistics, and settings." |
| 40-70s: Settings page, panel-managed values | "Some settings are in the `.env` file, some can be changed instantly from the panel — like the theme color." |
| 70-100s: Main dashboard, analytics charts | "On the main panel you see daily statistics." |

### V2.2 — "Understanding Environment Variables" (110 sec)

Goes through each section in the `.env` file (MongoDB, JWT, SMTP, Casino provider) one by one with explanations — the visual counterpart of [02 — Configuration](02-yapilandirma.md).

### V2.3 — "Site Name, Logo, and Initial Brand Settings" — **A3 completed, ready to film**

Logo/favicon/site name/font upload flow from the panel.

---

## Group 3 — Theme Editor (3 videos) — **A1/A2 completed, all ready to film**

### V3.1 — "Changing the Color Theme" (75 sec)

| Scene | Narration |
|---|---|
| 0-10s: Admin panel, Theme tab opens | "You access the theme editor from the admin panel." |
| 10-40s: Primary color being changed, live preview | "When you change the color, the preview on the right updates instantly." |
| 40-60s: Save is clicked, site is visited, same color everywhere | "Once saved, the change propagates across the entire site without writing code." |
| 60-75s: Closing | "No recompilation needed." |

### V3.2 — "Switching Between Three Ready Themes" — **A6 completed**

Shows switching between the ready theme packages (default + 2 alternatives).

### V3.3 — "Changing the Homepage Layout" — **A4 completed**

Editing the banner, campaign block, and section order from the panel.

---

## Group 4 — Module Activation (2 videos) — **M2/M3 completed (feat/akis-m), ready to film after merge**

### V4.1 — "What Modules Are, How They Work" (90 sec)

| Scene | Narration |
|---|---|
| 0-15s: Simple diagram of the three modules from [03 — Module System](03-modul-sistemi.md) (Core / Betting / Casino Content / Live Casino) | "In VIP90.bet, the core platform is always enabled — three additional modules are sold/licensed separately." |
| 15-40s: Admin panel → Modules screen opens, three module cards listed (with status badges) | "You can see which module is on and which is off from a single screen." |
| 40-65s: Navigates to a page affected by a disabled module (e.g., `/casino`), menu item is gone / graceful message shown | "When a module is disabled, the rest of the site is completely unaffected — that section just gracefully disappears." |
| 65-90s: Closing, summary benefit of the module system | "As an operator, you only keep enabled what you've licensed." |

**On-screen text:** "03 — Module System · docs/product/03-modul-sistemi.md"

### V4.2 — "Enabling a Module" (80 sec)

| Scene | Narration |
|---|---|
| 0-10s: Admin panel → Modules screen, "Casino Content" module in disabled state | "Enabling a module is just a single click." |
| 10-35s: Toggle is clicked, brief "checking" status, then green "Active" badge | "The system checks the license/subscription status; if valid, the module enables instantly." |
| 35-55s: Return to menu, the section that was just hidden is now visible | "The section that was missing from the menu is now back." |
| 55-80s: Same screen shows the module's "renewal/period" info | "You get a panel warning before the subscription period expires — even if the internet goes down, a short tolerance window keeps the module enabled." |

**On-screen text:** "Toggle from Panel · Subscription Status Visible Instantly"

---

## Group 5 — Game Settings (2 videos) — **O6 completed (feat/akis-bc), ready to film after merge**

### V5.1 — "Setting House Edge and Bet Limits" (95 sec)

| Scene | Narration |
|---|---|
| 0-15s: Admin panel → Game Settings, Crash row selected | "You adjust the mathematics of every in-house game from the panel — without changing code." |
| 15-45s: House edge percentage being changed with a slider (e.g., from 20% to 15%), min/max bet fields updated | "House edge, minimum and maximum bet — all here. Same screen for Roulette, with its own ratio." |
| 45-70s: Save is clicked, "Active" status and last-updater info shown | "Once saved, the change goes live instantly; who changed it is recorded in the audit log." |
| 70-95s: Navigate to the game itself (Crash screen), new settings reflected in the next round | "On the player side, the new setting takes effect on the next round." |

**On-screen text:** "House Edge · Bet Limits · From Panel, Instantly"

### V5.2 — "Understanding Game Mathematics (Provably Fair)" (100 sec) — **ready to film today**

| Scene | Narration |
|---|---|
| 0-20s: A Crash round being played | "Each round is calculated with a server seed that cannot be predetermined." |
| 20-60s: HMAC formula from the In-house Games add-on documentation on screen, simplified explanation | "This seed, hashed with HMAC-SHA256, determines the result — no one can know it in advance." |
| 60-100s: House edge table shown | "Each game's house edge value is clearly documented." |

---

## Group 6 — Payment Flow (2 videos) — **ready to film today**

### V6.1 — "Depositing via Bank Transfer" (85 sec)

Player side: creating a deposit request. Admin side: approving the request, balance being updated.

### V6.2 — "Depositing Crypto via USDT-TRC20" (85 sec)

Wallet address display, transaction tracking, automatic approval flow.

---

## Group 7 — Support Tools (3 videos) — **D3/D5 completed, all ready to film**

### V7.1 — "Asking a Question to the Help Assistant" (70 sec)

Chatbot widget opens, a setup question is asked, document-based answer is shown. Then an unknown topic is asked and the assistant's "open a support ticket" redirect is shown — visual proof of D3's acceptance criteria.

### V7.2 — "Opening a Support Ticket" (75 sec) — **client screen not yet added, must be added before filming**

The Ticket API (`POST /api/tickets/mine`, `GET /api/tickets/mine`, `GET /api/tickets/mine/:id`, `POST /api/tickets/mine/:id/reply`) is ready and functional — the only missing piece is the player-facing screen. The storyboard is fully written to be used directly when that screen is added:

| Scene | Narration |
|---|---|
| 0-10s: From chatbot's "open a support ticket" redirect to ticket form | "When the assistant can't help, you can open a support ticket with a single click." |
| 10-35s: Subject and description fields are filled, submit button clicked | "Write your subject briefly, our team will get back to you as soon as possible." |
| 35-55s: "My Requests" list, new ticket's status ("Open") shown | "You can track all your requests and their statuses from one place." |
| 55-75s: Notification when a reply arrives, entering ticket to read reply/write response | "You get a notification when a reply arrives; you can write back from the same screen." |

**On-screen text:** "Support Ticket · Tracking · Reply — On a Single Screen"
**Filming note:** This video cannot be recorded until the player-side ticket screen is added — the storyboard is ready, waiting in line when the screen is added.

### V7.3 — "Replying to a Ticket from the Admin Panel" (70 sec)

Admin side: ticket list, replying, changing status.

---

## Summary table

| Group | Video count | Storyboard status | Waiting for filming |
|---|---|---|---|
| Installation | 3 | 3/3 fully written | K2's merge into the integration branch |
| Initial Configuration | 3 | 3/3 fully written | — (ready to film today) |
| Theme Editor | 3 | 3/3 fully written | — (ready to film today) |
| Module Activation | 2 | 2/2 fully written | M2/M3 merge |
| Game Settings | 2 | 2/2 fully written | O6 merge |
| Payment Flow | 2 | 2/2 fully written | — (ready to film today) |
| Support Tools | 3 | 3/3 fully written | V7.2: player-side ticket screen addition |
| **Total** | **18** | **18/18 fully written** | |

All **18 storyboards** requested by D2 in the 15-20 range are written scene by scene — none were left incomplete/conceptual. 13 are ready to film as of today; 4 (those dependent on K2/M2/M3/O6) when the relevant branches are merged into the integration branch, and 1 (V7.2) when the player-side ticket screen is added. Which tool will be used for filming (a tool producing screen recording + voice-over, or a model generating video from text) was left to the end of the development flow per the user's decision — this document is a completed foundation independent of that decision.