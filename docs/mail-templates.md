# System Emails (admin/mail-templates)

The content of the automatically sent system emails is edited from the admin
panel: **Communication → Email → Templates** (`/admin/communications?channel=email`).
The old `/admin/mail-templates` route redirects there. Panel texts come from the
8 dictionaries (`tr/en/ko/th/es/ja/pt/de`) via i18n keys.

## What it does

| Category | When it is sent | Manual send from the panel |
| --- | --- | --- |
| `action` — tied to an action | The instant a system event happens (registration, verification, bet settlement, casino session close, deposit, withdrawal, KYC) | **No** (`400 MAIL_ACTION_TRIGGER_ONLY`) |
| `scheduled` — time sensitive | Scheduled job + "Send now" in the panel | **Yes**, with audience selection |

Audience types: `all` (all users), `segments` (specific segments), `users`
(specific users), `inactive` (users who have not been online for a while).

Users entering an audience: those with an e-mail address, **not deleted**
(`deletedAt: null` — because the field is `null`, `$exists:false` cannot be used)
and not bots. Segment criteria are resolved with `buildQueryFromCriteria`; the
`vipLevel` criterion is a **numeric** level range and is converted to ObjectIds
through `VipLevel.level` (otherwise it throws `Cast to ObjectId`). Event names are
translated in the panel from the `admin.mailTemplates.event.<event>` key.

## Code map

```
server/src/services/mailTemplates.js   MAIL_EVENTS catalog, DEFAULT_TEMPLATES (demo),
                                       render, CRUD, 30s cache, ensureDefaultMailTemplates
server/src/services/systemMail.js      sendActionMail, resolveAudience, sendBulk,
                                       runDueScheduledMails, startScheduledMailJob
server/src/models/SystemMailTemplate.js  template (unique event, audience/schedule/stats)
server/src/models/SystemMailLog.js       delivery log
server/src/routes/adminMailTemplates.js  /api/admin/mail-templates routes
server/src/controllers/adminMailTemplates.js
server/src/validators/adminMailTemplates.js  zod schemas
client/src/pages/admin/MailTemplates.jsx    panel page
```

The routes are mounted under `/mail-templates` in `routes/admin.js`; the sidebar
item was merged into the `admin.nav.communication` hub on 2026-10-06
(`adminNav.config.js` → engagement group), and the old route in `App.jsx`
redirects to `?channel=email`.

## SMTP settings — Modules → Email Gateway (2026-10-06)

Provider credentials are **not** on the template page; they live in the
**Modules → Email Gateway** card (`EmailProviderPanel`). The Communication →
Email → Provider tab was removed on that date.

- **Gateway switch (the switch in the card header — in place of the Core badge,
  the card is last in the list):**
  - **On (default):** transport uses the panel/DB settings (`DB > env`, previous
    behavior — `emailConfig.getAll()`).
  - **Off:** the transport is built **only from the server `.env` SMTP**
    (`emailEnvView()`); the `smtp.*` DB values are deliberately ignored. The
    badge reads "Sunucu SMTP (.env)".
- Server switch: `smtp.gatewayEnabled` (Setting) > `SMTP_GATEWAY_ENABLED` env >
  default `'true'`. The field arrives in the `PUT /admin/settings/email` body as
  boolean/`'true'|'false'|''`; sending an empty value deletes the DB record and
  falls back to the default.
- The switch is part of the transport signature: when it changes the transport is
  rebuilt (even with the same host value). All delivery/test paths
  (`sendActionMail`, `sendBulk`, `POST /admin/settings/email/test`) apply the
  same choice through `getTransporter()`.
- Gateway off + no `SMTP_HOST` in `.env` → delivery is rejected with
  `SMTP_NOT_CONFIGURED` (even if a panel value exists — the gate is deliberate).

## Event (`event`) catalog

`MAIL_EVENTS` is the single source of truth: which category an event belongs to
and the `{{variable}}` pool available for that event. The "variables" chips in
the panel come from here too.

- **action (10):** `user.emailVerify`, `user.welcome`, `user.passwordReset`,
  `user.passwordChanged`, `kyc.approved`, `kyc.rejected`, `bet.settled`,
  `casino.sessionClosed`, `wallet.depositCompleted`, `wallet.withdrawalCompleted`
- **time sensitive (3):** `campaign.broadcast`, `campaign.inactiveUsers`,
  `campaign.reactivation`

> `COMMON_VARIABLES`: `siteName`, `username`, `currency`, `supportEmail`,
> `currentYear`, `siteUrl` — added automatically to every event.

There is exactly **one** template per event (unique index). Adding a new event
requires `MAIL_EVENTS` + `DEFAULT_TEMPLATES` (optional) + a
`sendActionMail(...)` call in the triggering code.

## Demo data

`DEFAULT_TEMPLATES` defines 7 ready-made contents (including both an action and
a time-sensitive example). `ensureDefaultMailTemplates()` runs at server startup
(`server/src/server.js`) and adds **only missing** records; it never overwrites
documents an admin has edited.

Rows are **not** added to the DemoData category — `demoData-registry.test.js`
asserts exactly 8 categories
(`users,sports,casino,kyc,risk,tickets,agents,payments`).

## Template syntax

- `{{variable}}` — HTML-escaped in the body (values become `&lt;`), not escaped
  in the subject line.
- `{{#if x}}…{{/if}}` / `{{#unless x}}…{{/unless}}` — nesting supported (the
  **innermost** block matches first).
- `preheader` — inbox preview, hidden in the body.
- `ctaLabel` + `ctaUrl` — when both are non-empty after rendering, a bulletproof
  button + fallback link are appended.
- Design helpers: `layout/button/H1/P/NOTE` in `email.js` and the
  `.m-h1/.m-p/.m-note` CSS.

Preview is done in the panel with `POST /api/admin/mail-templates/preview` using
sample data; nothing is sent to a real recipient.

## Scheduled delivery

- `startScheduledMailJob()` starts on boot (30 s delay, 15 min interval).
- If `schedule.nextSentAt` has never been computed the job does **not** send
  immediately, it only sets the due date — so there is no burst at startup. The
  first delivery is done with "Send now" in the panel.
- Bulk send limit: `MAIL_SEND_BATCH_LIMIT` (default 500, max 5000), concurrency
  5. When `matched > processed` the result contains `truncated: true`.
- **SMS uses the same model:** the `SmsTemplate.schedule`/`audience` field names
  are identical, the 15-minute `runDueScheduledSms` job starts together with the
  e-mail job on boot. The "automatic" badge in the Campaigns tab reads from
  `schedule.enabled` on both channels. Details: `docs/sms-gateway/README.md` §12.

## Environment variables

| Variable | Effect |
| --- | --- |
| `MAIL_SYSTEM_DISABLED=true` | Disables all delivery (including `503 MAIL_SYSTEM_DISABLED`) |
| `MAIL_SEND_BATCH_LIMIT` | Upper bound of recipients processed in one run |
| `CLIENT_URL` | `{{siteUrl}}` in templates |
| `SMTP_URL` / SMTP_* | Real delivery in `sendEmail` (mock when absent) |

## Guards

`sendActionMail` never throws to its caller — it logs the error and returns
`{ status }`:

`system_disabled` · `no_db` · `not_action_event` · `disabled` ·
`no_template` · `no_recipient` · `bot_user` · `no_fallback` · `failed`

In addition, `bet.isSeed` and `metadata.isSeed` records never trigger seed
e-mails.

## API

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/admin/mail-templates?page&limit&search&category&enabled` | `admin:settings:read` |
| GET | `/api/admin/mail-templates/stats` | `admin:settings:read` |
| GET | `/api/admin/mail-templates/events` | `admin:settings:read` |
| GET | `/api/admin/mail-templates/logs?page&templateId&status` | `admin:settings:read` |
| POST | `/api/admin/mail-templates/preview` | `admin:settings:read` |
| GET | `/api/admin/mail-templates/:id` | `admin:settings:read` |
| POST | `/api/admin/mail-templates` | `admin:settings:write` |
| PATCH | `/api/admin/mail-templates/:id` | `admin:settings:write` |
| DELETE | `/api/admin/mail-templates/:id` | `admin:settings:write` (system template `403`) |
| POST | `/api/admin/mail-templates/:id/send` | `admin:settings:write` |

Error codes: `MAIL_UNKNOWN_EVENT` 400 · `MAIL_EVENT_TAKEN` 409 ·
`MAIL_ACTION_TRIGGER_ONLY` 400 · `MAIL_TEMPLATE_DISABLED` 400 ·
`MAIL_SYSTEM_TEMPLATE` 403 · `MAIL_NOT_FOUND` 404 · `MAIL_SYSTEM_DISABLED` 503.

No new permission was introduced — the existing `admin:settings:read/write` is
used.

## Trigger points (be careful when changing)

| File | Event |
| --- | --- |
| `controllers/auth.js` | `user.welcome`, `user.emailVerify`, `user.passwordReset`, `user.passwordChanged` (+ SMS: `userRegistered`, `emailVerified`) |
| `controllers/users.js` | `user.passwordChanged` |
| `models/Bet.js` (post save) | `bet.settled` (+ SMS: `betWon`/`betLost`) |
| `models/CasinoSession.js` (pre/post save) | `casino.sessionClosed` (+ SMS: `casinoSessionProfit`/`casinoSessionLoss`) |
| `services/ledger.js` | `wallet.depositCompleted`, `wallet.withdrawalCompleted` (+ SMS: `depositCompleted`/`withdrawalCompleted`) |
| `routes/crypto.js` | (+ SMS: `withdrawalRequested` — at the withdrawal request/pending moment) |
| `services/kyc.js` | `kyc.approved`, `kyc.rejected` |
| `routes/sumsubWebhook.js` | `kyc.approved`, `kyc.rejected` |

SMS hooks are called fire-and-forget through `dispatchSmsEvent`; they never block
the mail flow (`docs/sms-gateway/README.md` §5).

## Tests

```bash
node --test server/test/systemMail.test.js     # render, catalog, validator, guards, CRUD
node --test client/src/i18n/*.test.js          # i18n key validation
node --test server/test/demoData-registry.test.js
```

`server/test/systemMail.test.js` connects to a local MongoDB at
`mongodb://localhost:27017/betzone_test_systemmail` and drops the database when
the test ends.