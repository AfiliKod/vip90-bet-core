# SMS Gateway — Twilio integration and message templates

**Date:** 2026-10-03 · **Branch:** `feat/sms-gateway-twilio` · **Worktree:** `.worktrees/sms-gateway`
**Scope:** the SMS Gateway integration and its usage. E-mail is **not** part of this work.

> This document was completed in two rounds: (1) provider settings + message
> template CRUD + delivery, (2) **sender registration and country/compliance
> approval** (§11).

---

## 1. What was added

| Layer | File | What it does |
|--------|-------|--------------|
| Module registry | `server/src/modules/registry.js` | The `sms-gateway` module (on/off + license badge, `Modules.jsx` card) |
| Settings store | `server/src/services/smsSettings.js` | Twilio credentials: DB first, `.env` as fallback; Auth Token encrypted with AES-256-GCM |
| Delivery adapter | `server/src/services/smsGateway.js` | Twilio REST (native `fetch`), E.164 normalization, dry connection test |
| Event registry | `server/src/services/smsEvents.js` | 11 action + 6 scheduled events with variable lists |
| Template service | `server/src/services/smsTemplate.js` | CRUD, demo seed, recipient resolution, delivery, `dispatchSmsEvent` |
| Models | `server/src/models/SmsTemplate.js`, `SmsLog.js` | Templates and per-recipient delivery records |
| HTTP | `server/src/routes/smsTemplate.js` → `admin.js` `/sms` | `/api/admin/sms/*` |
| Validation | `server/src/validators/smsTemplate.js` | zod schemas |
| Controller | `server/src/controllers/smsTemplate.js` | DI factory (testable) |
| Panel — settings | `client/src/components/admin/SmsGatewayCard.jsx` | The body of the `sms-gateway` card inside `Modules.jsx` |
| Panel — CRUD | `client/src/pages/admin/SmsTemplates.jsx` | Template list/CRUD/send + delivery log |
| Panel — pure logic | `client/src/pages/admin/smsTemplateLogic.js` | Segment counter, placeholder extraction (testable) |
| Sender registration | `server/src/models/SmsSender.js` | Number/service + approval status + destination countries |
| Sender service | `server/src/services/smsSender.js` | CRUD + **delivery gate** (`resolveSenderGate`) |
| Country inference | `server/src/services/smsCountries.js` | E.164 → ISO-3166 (curated list) |
| Panel — senders | `client/src/pages/admin/SmsSenders.jsx` | Sender CRUD, account type, gate status |
| Panel — shared logic | `client/src/utils/smsSenderLogic.js` | `toKeySegment` (enum → i18n key) |

---

## 2. Two kinds of message — why the split?

| | `type='action'` (System) | `type='scheduled'` (Time sensitive) |
|---|---|---|
| Trigger | Domain code (`dispatchSmsEvent`) | Operator (panel) or the scheduler |
| `eventKey` | **Required** | Optional |
| Send from the panel | **Not possible** (`SMS_ACTION_NOT_SENDABLE`) | Possible |
| Examples | Registration, bet won/lost, casino session profit/loss, deposit/withdrawal confirmation, "we miss you" | Bonus expiry warning, weekly bonus, tournament announcement, campaign |

Making action-tied messages unsendable from the panel is deliberate: their
trigger is the player's behavior, not an operator decision. Sending them manually
at the wrong time or to the wrong audience is both a product and a compliance
risk.

If a `type='scheduled'` template has an `eventKey`, the same automatic hooks can
be used (e.g. `bonusExpiring`); without one it is only sent from the panel.

### Event registry

`server/src/services/smsEvents.js`:

```
action:    userRegistered, emailVerified, phoneVerified, depositCompleted,
           withdrawalRequested, withdrawalCompleted, betWon, betLost,
           casinoSessionProfit, casinoSessionLoss, inactiveReminder
scheduled: bonusStarting, bonusExpiring, weeklyBonus, birthdayBonus,
           tournamentReminder, campaignAnnouncement
```

To add a new event: one line in the registry + an
`admin.smsTemplates.event.<key>` entry in the 8 dictionaries. Keys must be
camelCase (the `KEY_RE` rule in `i18n/core.js`; dashes and underscores are
rejected).

---

## 3. Panel

### 3.1 Provider settings — Modules → SMS Gateway

Credentials go **here**, not to the templates page.

> **2026-10-06 IA:** the single "Communication Providers" card was removed; the
> provider + sender fields moved into the body of the `sms-gateway` module card
> (`SmsGatewayBody`, one piece). The **Provider**/**Senders** tabs under
> Communication → SMS were removed on that date; old bookmarks such as
> `?channel=sms&sub=provider|sender` silently fall back to the templates via
> `normalizeSub`. The e-mail counterpart is the Modules → **Email Gateway** card
> (`docs/mail-templates.md` → "SMTP settings").

| Field | DB key | `.env` counterpart |
|-------|--------|--------------------|
| Provider | `sms.provider` | `SMS_PROVIDER` |
| Account SID | `sms.twilio.accountSid` | `TWILIO_ACCOUNT_SID` |
| Auth Token | `sms.twilio.authToken` (**encrypted**) | `TWILIO_AUTH_TOKEN` |
| From number | `sms.twilio.fromNumber` | `TWILIO_FROM_NUMBER` |
| Messaging Service SID | `sms.twilio.messagingServiceSid` | `TWILIO_MESSAGING_SERVICE_SID` |
| Default country code | `sms.twilio.defaultCountryCode` | `TWILIO_DEFAULT_COUNTRY_CODE` |

Rules:

- **`configured` requires all three parts:** Account SID + Auth Token + sender
  (From number **or** Messaging Service SID). With only a provider set, the
  test/delivery returns `SMS_NOT_CONFIGURED`. The missing parts are listed in
  the `missing` field of the `GET /admin/sms/settings` response
  (`accountSid|authToken|sender`); in the panel they appear as a "Missing
  fields" box. The Messaging Service SID is **optional** (Twilio Console →
  Messaging → Messaging Services → SID); without it the From number alone is
  enough.
- **DB first, `.env` as fallback.** The panel shows a `db` / `env` / unset badge.
- **A field left empty does not change anything.** If the source is `.env` the
  field arrives empty — a record in the panel never silently overrides the
  server-side configuration.
- **The Auth Token never returns in plain text.** Without an encryption key
  (`OPERATOR_SECRET_ENCRYPTION_KEY`) the token is **not written** to the DB; the
  panel shows a warning and returns `SMS_ENCRYPTION_KEY_MISSING`. A stored token
  is visible in the panel only as a masked preview (`abcd…wxyz`) with a "Panel"
  badge.
- **"Test connection" does NOT send a message.** It reads Twilio's
  `GET /Accounts/{Sid}.json` endpoint; no cost, and a wrong token is caught by a
  dry run instead of a live message.
- **Error texts are translated on the client.** The server returns a Turkish
  message plus a `code`; known codes (`SMS_NOT_CONFIGURED`,
  `SMS_ENCRYPTION_KEY_MISSING`, `SMS_CREDENTIALS_MISSING`, `SMS_SENDER_MISSING`,
  …) are translated in the UI from the `admin.smsGateway.error.<code>` key (the
  code is camelCased: `SMS_NOT_CONFIGURED` → `smsNotConfigured`) — an English
  panel never shows Turkish text.

### 3.2 Message templates — Communication → SMS → Templates

The main path is `?channel=sms&sub=templates` (the old `/admin/sms-templates`
route redirects here). The Modules → SMS Gateway card has no "Manage →" link
(2026-10-06 IA — licence/manage labels were removed from the cards); templates
are reached from the sidebar **Communication** hub or via the old route
redirect.

- **Templates tab:** KPI strip, search (300 ms debounce), type filter, table
  (title/key, type, event + category, content + segment counter, status toggle,
  sent counter, actions). Row actions: **Send** (`scheduled` only), **Edit**,
  **Delete**.
- **Delivery log tab:** the last 200 records, status counters and error message.
- **Form:** title, type, event, category, message text, active/inactive. When an
  event is selected, the available variables are listed as chips; clicking one
  appends it as `{{variable}}`. Using a variable that the event does not define
  raises a warning.
- **Send modal:** target audience (selected users / all users / one segment) +
  the event's variable fields (except `username` — filled automatically).

### 3.3 Segment counter (70 or 160?)

`admin.smsTemplates.charInfo` shows the segment count per row. The Turkish
characters `ğ Ğ ş Ş ı İ ç` do **not** exist in GSM 03.38; if any of them is
present the limit is not 160 but **70**, and the message is split into two parts
sooner. The counter is code-point based (an emoji is one character).

---

## 4. Delivery rules

`sendTemplate()` checks the following in order and **rejects without sending
anything** at each one:

| Condition | Error code |
|-----------|-----------|
| No template | `NOT_FOUND` |
| Template is `type='action'` | `SMS_ACTION_NOT_SENDABLE` |
| Template inactive | `SMS_TEMPLATE_INACTIVE` |
| Credentials incomplete | `SMS_NOT_CONFIGURED` |
| `sms-gateway` module off | `SMS_MODULE_DISABLED` |
| Audience invalid / no segment / no users selected | `SMS_AUDIENCE_INVALID` / `SMS_SEGMENT_REQUIRED` / `SMS_USERS_REQUIRED` |
| Segment has **no selection criteria** ("everyone") | `SMS_SEGMENT_TOO_BROAD` |

Then:

1. Recipients are resolved — only `isActive: true` users **with** a non-empty
   phone number. A user without a phone is **not attempted** (instead of a silent
   `skipped`, the numeric summary uses the `withoutPhone` logic: not trying at all
   is more honest).
2. The body is rendered (`{{username}}` with the username + `balance` are filled
   automatically). A variable that cannot be found stays empty and is
   **reported** in `missing[]` — a half-rendered message never goes out silently.
3. Delivery runs with concurrency 5; every message is written to `SmsLog`.
4. `sentCount`/`lastSentAt` only increase on **successful** deliveries.

**A segment without criteria is rejected.** `buildQueryFromCriteria({})` produces
an empty query (= all users); in a bulk SMS that would mean "send to everyone".
Therefore a segment must have at least one real criterion — the operator either
defines the segment or deliberately picks **"all users"**.

**Recipient ceiling: `MAX_RECIPIENTS = 2000`.** More than that in one request is
cut off and `capped: true` is returned. SMS costs money and is an irrevocable
message to a player's phone; selecting `all` and accidentally hitting millions of
records with one click is prevented.

### Phone number normalization

Twilio requires E.164:

```
"+90 532 111 22 33"   → +905321112233
"00905321112233"      → +905321112233
"0532 111 22 33"      → +905321112233   (only when defaultCountryCode=90)
"0532 111 22 33"      → null            (country code unknown → NOT guessed)
```

The last line is deliberate: silently sending a `+0…` number to the wrong country
without a country code (e.g. `+53` Colombia) makes the message disappear without
a trace.

---

## 5. Wiring domain code (action messages)

Single entry point (`server/src/services/smsTemplate.js`):

```js
import { dispatchSmsEvent } from '../services/smsTemplate.js';

// registration (controllers/auth.js) — pass the user document directly
dispatchSmsEvent('userRegistered', user, { balance: user.balance }).catch(() => {});

// bet result (models/Bet.js post-save) — if only the id exists, pass deps.userId
import('../services/smsTemplate.js')
  .then(({ dispatchSmsEvent }) => dispatchSmsEvent('betWon', null, {
    betId: String(this._id), amount: this.potentialWin, stake: this.stake,
    market: first.oddLabel || '', odds: this.totalOdds,
  }, { userId: this.userId }))
  .catch(() => {});
```

Contract:

- **Never throws.** The error is caught, written to the console, and
  `{ sent: 0, error }` is returned. An SMS error never breaks the bet result or
  a withdrawal approval.
- Recipient: the `user` document is used when it is **present**; if only
  `deps.userId` is given it is loaded by id (`{ username, phone, balance }`
  selection).
- `{{username}}`, `{{balance}}` and `{{currency}}` are filled even when they are
  not passed as event variables (same behavior as the e-mail `commonVars`).
- Skips with `NO_TEMPLATE` (no usable template), `NOT_CONFIGURED` (no
  credentials), `MODULE_DISABLED` (module off), `NO_PHONE` (no phone), `NO_USER`
  (userId could not be resolved).
- Every attempt is written to `SmsLog`.

### Wired triggers (2026-10-06)

| Event | Fired in | Recipient |
|------|----------|-----------|
| `userRegistered` | `controllers/auth.js` — after registration (same moment as the mail `user.welcome`) | `user` document |
| `emailVerified` | `controllers/auth.js` — after `verifyEmail` | `user` document |
| `depositCompleted` | `services/ledger.js` — `status: 'completed'` + `!metadata.isSeed` | `deps.userId` |
| `withdrawalCompleted` | `services/ledger.js` — same block (a bank withdrawal is already `completed` at that moment) | `deps.userId` |
| `withdrawalRequested` | `routes/crypto.js` — crypto withdrawal **request** (pending; the only flow awaiting admin approval) | `deps.userId` |
| `betWon` / `betLost` | `models/Bet.js` post-save — status `won`/`lost` (no `cancelled` event) | `deps.userId` |
| `casinoSessionProfit` / `casinoSessionLoss` | `models/CasinoSession.js` post-save — `closed` + `netResult !== 0` | `deps.userId` |

**Events in the catalog but not wired** (they show up as "wired templates" in the
Automations panel although no triggering code exists; informational only):

- `phoneVerified` — the `User.phoneVerified` field exists, there is no
  verification flow.
- `inactiveReminder` — no safe automatic trigger (a daily job plus bulk SMS cost
  is an operator decision). Its mail counterpart is the `campaign.inactiveUsers`
  campaign category; in the SMS catalog it lives as an `action`.

---

## 6. Demo data

`initDefaultSmsTemplates()` runs on every boot (`server/src/server.js`) and adds
**15 demo templates**. Behavior:

- `$setOnInsert` — an operator's edit is **never overwritten**.
- A demo key the operator **deleted** is kept as a tombstone in
  `Setting: sms.templates.demoState` and does not come back.
  (Without a tombstone the upsert would resurrect the deleted record on the next
  restart.)

| Type | `key` | Event |
|-----|-------|-------|
| action | `welcomeRegistered` | `userRegistered` |
| action | `emailVerifiedNotice` | `emailVerified` |
| action | `depositCompletedNotice` | `depositCompleted` |
| action | `withdrawalCompletedNotice` | `withdrawalCompleted` |
| action | `betWinNotice` | `betWon` |
| action | `betLossNotice` | `betLost` |
| action | `casinoSessionProfitNotice` | `casinoSessionProfit` |
| action | `casinoSessionLossNotice` | `casinoSessionLoss` |
| action | `weMissYou` | `inactiveReminder` |
| scheduled | `bonusStartingNotice` | `bonusStarting` |
| scheduled | `bonusExpiringNotice` | `bonusExpiring` |
| scheduled | `weeklyBonusNotice` | `weeklyBonus` |
| scheduled | `birthdayBonusNotice` | `birthdayBonus` |
| scheduled | `tournamentReminder` | `tournamentReminder` |
| scheduled | `campaignAnnouncement` | `campaignAnnouncement` |

All of them appear in the panel as **editable** rows; there is no demo badge
because they are real records in the DB.

---

## 7. API

| Method | Path | Permission |
|--------|------|-------|
| `GET` | `/api/admin/sms/templates?search=&type=&isActive=` | `admin:settings:read` |
| `POST` | `/api/admin/sms/templates` | `admin:settings:write` |
| `PATCH` | `/api/admin/sms/templates/:id` | `admin:settings:write` |
| `DELETE` | `/api/admin/sms/templates/:id` | `admin:settings:write` |
| `POST` | `/api/admin/sms/templates/:id/send` | `admin:settings:write` |
| `POST` | `/api/admin/sms/test-send` | `admin:settings:write` |
| `GET` | `/api/admin/sms/logs?status=&limit=` | `admin:settings:read` |
| `GET` | `/api/admin/sms/settings` | `admin:settings:read` |
| `PATCH` | `/api/admin/sms/settings` | `admin:settings:write` |
| `POST` | `/api/admin/sms/settings/test` | `admin:settings:write` |

The `POST /test-send` body is `{ to, message }` — a single test message without a
template (same gates: gateway + module; the result lands in `SmsLog` with
`templateId: null`).

`POST`/`PATCH` template bodies accept `audience`
(`{ type: 'all'|'segment'|'users', segmentId, userIds }`) and `schedule`
(`{ enabled, intervalHours }`) when `type='scheduled'` — for automatic delivery
(§12).

Error bodies use the global `errorHandler`: `{ error: { code, message } }`.
`POST /settings/test` returns `200` + `{ ok:false, code:'SMS_NOT_CONFIGURED', missing:[…] }`
when it is not configured (no network call is made). A `missing:
['accountSid'|'authToken'|'sender']` field was added to the `GET /settings`
response; `configured` is exactly "this list is empty".

---

## 8. Setup with a demo account

Credentials are **never written into code** (AI-GITHUB-WORKFLOW-POLICY §8). Two
ways:

**A) .env (local/demo — recommended)**

```bash
# .env  (gitignored)
OPERATOR_SECRET_ENCRYPTION_KEY=<64 hex characters>   # openssl rand -hex 32
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+90XXXXXXXXXX
TWILIO_DEFAULT_COUNTRY_CODE=90
```

**B) From the panel** — Modules → SMS Gateway, fill in the fields and save. The
Auth Token is encrypted into the DB.

Then: turn the Modules → SMS Gateway switch **on** (with the `sms-gateway`
module off, delivery is rejected with `SMS_MODULE_DISABLED`) and verify end to
end by sending one `scheduled` template to a single user from the SMS Messages
page.

---

## 9. Tests

| File | Scope | DB |
|------|-------|----|
| `server/test/smsAdmin.test.js` | Pure helpers, event registry, phone normalization, Twilio adapter (injected `fetchImpl`), zod schemas, controller DI factory (including testSend) | none |
| `server/test/smsTemplateDb.test.js` | Seed idempotency + tombstone, CRUD, recipient resolution, delivery rules, `dispatchSmsEvent` | `betzone_test_sms` |
| `server/test/sendTestSms.test.js` | Test message: gates (gateway/module), `SmsLog` with `templateId=null`, provider error, log listing | `betzone_test_sms_testsend` |
| `server/test/smsScheduledJob.test.js` | Audience + schedule CRUD rules (`SMS_*` error codes), `runDueScheduledSms`: first due date only sets the schedule, segment-audience send + date advance, inactive/disabled/action filtering, date kept after an error, recipient via `deps.userId` | `betzone_test_sms_job` |
| `client/src/pages/admin/smsTemplateLogic.test.js` | GSM-7/Unicode segment counter, placeholder extraction | none |
| `client/src/pages/admin/communications/communicationsLogic.test.js` | KPI/row normalizers, event catalog, campaign rows (including SMS `schedule`), audience labels | none |
| `client/src/i18n/smsParity.test.js` | `admin.smsGateway.*` + `admin.smsTemplates.*` keys × 8 languages: presence, empty value, key format, placeholder match, English-copy ratio | none |
| `client/src/i18n/communicationsParity.test.js` | Parity of `admin.communications.*` + `admin.communicationProviders.*` + `admin.emailSettings.*` | none |
| `server/test/moduleRegistry.test.js` | The `sms-gateway` registration (updated) | none |
| `server/test/routeWiring.test.js` | New router + validator import (updated) | none |

The `client/src/pages/admin/*.test.js` glob was added to the `npm test` scope
(the logic tests live under `pages/admin/`).

---

## 10. Deliberately out of scope

- **E-mail.** This work covers only the SMS Gateway; mail templates/CRUD are a
  separate task (`docs/mail-templates.md`).
- **OTP / verification SMS.** The `phoneVerified` event is defined, the flow is
  not.
- **`inactiveReminder` trigger.** No safe automatic trigger (see §5); the
  operator can use it as a manual campaign if they want.
- **Bulk send queue.** Delivery is synchronous; the 2000-recipient ceiling keeps
  that reasonable. Larger scale needs a job queue.
- **Rate limit / opt-out (STOP) management.** `Advanced Opt-Out` must be enabled
  on the Twilio side; there is no subscription list in the panel.
- **Segment membership cache.** Segment criteria are turned into a live query at
  delivery time (`buildSegmentQuery`).
- **Opt-out list / subscription preference** (in the panel).
- **License exemption decision.** `slikair-payment` is not bound to the license
  server (`licenseExempt: true`); for `sms-gateway` this flag was
  **deliberately not set** — that is a commercial/license decision. When
  `LICENSE_SERVER_URL` is not defined (the default install) all modules count as
  licensed locally, so installation is not affected. The license server does not
  block SMS: delivery only checks the admin switch (`isEnabled`).

### A pre-existing segment bug fixed in this work

`buildQueryFromCriteria()` checked numeric ranges with `!== null`; `undefined` also
passed that check, so a field **without a criterion** produced `{ vipLevel: {} }`
without an operator — in Mongo that means "match an empty document", i.e. the
segment silently **found nobody**. It was changed to a `typeof === 'number'` check
(the same for `isActive`/`isBot`). This change does not break the existing segment
behavior including `playerSegment.test.js` (same test file: 7/7 on the baseline,
7/7 after the change).

---

---

## 11. Sender registration and country/compliance approval

### 11.1 Why a separate screen is needed

For a number to be able to send messages on Twilio there is not a single gate but
several gates stacked on top of each other. When these rules are invisible in the
panel, the operator learns why a message did not go out only from the Twilio
error code:

| Rule | Source | Effect |
|-------|--------|--------|
| **Trial account: verified recipients only** | Trial limit | At most 5 numbers per account |
| **Trial account: sign-up country only** | Geographic limit | Cannot go to another country |
| **Trial account: Twilio prepends its own text** | Trial limit | Your own message text is not delivered |
| **Trial account: expires after 30 days** | Trial limit | Delivery stops when the period is over |
| **A2P 10DLC (US/Canada long numbers)** | Regulation | Brand + campaign registration mandatory, **paid account required** |
| **Toll-free verification** | Regulation | Verification required to send to US/Canada |
| **Local sender (sender ID) pre-registration** | Varies by country | An unregistered sender is rejected |

Source: Twilio Error & Warning Dictionary (`twilio.com/docs/api/errors`) and
"Get started with your Twilio free trial account". The verified error codes live
in `server/src/services/smsGateway.js` → `TWILIO_ERROR_MEANINGS` as a
**code → meaning** map; the panel turns them into an i18n'd explanation and shows
them in the delivery log.

The real state of this account (from the Twilio API, not an assumption):

```
type        : Trial
number      : +1•••••••  (US trial number)
last message: +90•••••••••55 → delivered
              body: "Sent from your Twilio trial account - ahoy 🫡"
```

> The recipient number is deliberately **masked**. This document and PR bodies are
> visible to the repo team; someone's mobile number must not be written here.
> Even the masked form is enough: what matters is not the number the message went
> to but the behavior of the account.

In short: **a free demo account can only send SMS to a number registered/verified
in the panel.** The panel now states this with an explicit badge instead of "read
the error code until you discover it".

### 11.2 Screen

The **Senders screen** (`pages/admin/SmsSenders.jsx`).

The screen opens **inside the Modules → SMS Gateway** card ("Manage senders";
since 2026-10-08). Between 2026-10-06 and 2026-10-08 it was not reachable from any
route: the `/admin/sms-templates` redirect dropped the `?tab=senders` parameter and
the Communication page had no senders tab for SMS (per the §8 decision it is not
coming back). When the card is closed the delivery status badge is refreshed. API:
`GET/POST /api/admin/sms/senders`, `PATCH/DELETE /api/admin/sms/senders/:id`,
`GET /api/admin/sms/senders/gate`.

Screen content:

- **Account type** card: `Trial (free demo)` / `Paid` / `Unknown`. The real value
  is read **from the Twilio API** (`GET /Accounts/{sid}.json` → `type`) and stored
  only when the operator has not entered a value manually. It can be changed from
  the panel.
- **Delivery status** card: `Ready` / `Blocked — cannot deliver` + the reason.
- If trial, a warning band showing the four rules.
- Table: sender, country, registration type, **approval status**, destination
  countries, active.

A summary is also written to the **Modules → SMS Gateway** card: account type
badge, delivery status and a "Manage senders" link.

### 11.3 Registration fields

| Field | Meaning |
|-------|---------|
| `senderNumber` | E.164 long number / sender ID |
| `messagingServiceSid` | When present, `From` is not sent (Twilio rejects both) |
| `senderCountry` | The country that **issued** the number (ISO-3166 alpha-2) |
| `capability` | long_code / short_code / toll_free / alphanumeric / sender_id / messaging_service |
| `registrationType` | none / a2p_10dlc / toll_free / local_sender_id / alphanumeric |
| `approvalStatus` | not_required / not_submitted / pending / approved / rejected / expired / suspended |
| `destinationCountries` | Approved **destination** countries; empty = no restriction |
| `trialVerifiedNumbers` | Numbers that can be sent to on a trial (Twilio limit: 5) |
| `isActive` | At most **one** active sender at a time |

### 11.4 Delivery gate

`services/smsSender.js` → `resolveSenderGate()`, runs per recipient inside
`sendTemplate()`.

**Registration/account level → all delivery stops:**

| Condition | Error |
|-----------|-------|
| Paid account + no active sender or one that is not `approved`/`not_required` | `SMS_SENDER_NOT_REGISTERED` |
| The gateway's `fromNumber`/`messagingServiceSid` does not match the registration | `SMS_SENDER_MISMATCH` |

**Recipient level → only that recipient is skipped** (the campaign is not
cancelled):

| Condition | Error |
|-----------|-------|
| Trial + list full + the number is not in the list | `SMS_TRIAL_NUMBER_NOT_VERIFIED` |
| Trial + `trialSignUpCountry` declared + the recipient's country differs | `SMS_TRIAL_COUNTRY_DENIED` |
| `destinationCountries` non-empty + the recipient's country is not listed | `SMS_SENDER_COUNTRY_DENIED` |
| The number could not be resolved to E.164 | `SMS_INVALID_PHONE` |

The delivery summary returns a `skipReasons` breakdown; every skipped recipient is
written to `SmsLog` with its `skipReason` and is visible in plain language in the
log screen.

### 11.5 Deliberate decisions

1. **The approval requirement is NOT enforced on a trial account.** A2P 10DLC
   registration formally requires a paid account; on a trial the "waiting for
   approval" status would never become "approved", so the gate would stay closed
   forever and not even one test SMS could be sent. On a trial the real
   restriction is the verified number + the sign-up country.
2. **The default account type is `unknown`, not `paid`.** Assuming `paid` would be
   wrong on a trial account (the restrictions would not be applied, Twilio would
   return 14111 and the messages would be wasted); assuming `trial` would
   unnecessarily block delivery on a paid account. We do not block on uncertainty;
   the panel warns.
3. **Sign-up country ≠ sender country.** A US trial number can also send to
   Turkey; the trial's geographic limit belongs to the **sign-up country** and is
   an account property (`sms.trialSignUpCountry`).
4. **An empty list does not block.** While `trialVerifiedNumbers` is empty,
   numbers the operator verified at Twilio but did not report to us are allowed
   (Twilio returns 14111 anyway, that code lands in the log and the panel shows
   its translated meaning). When the list is **non-empty** the operator's
   declaration is authoritative.
5. **E.164 → country inference is curated.** The `User` schema has no `country`
   field (segment criteria use `query.country` but it drops out in strict mode).
   `services/smsCountries.js` maps E.164 prefixes for 57 countries; for a number
   that is not in the list the country is `null` and **no country restriction is
   applied** — the decision is left to Twilio's 30041/30040 error codes. A huge
   phone→country table would be less honest than a curated list.

### 11.6 New endpoints

| Method | Path | Permission |
|--------|------|-------|
| `GET` | `/api/admin/sms/senders` | `admin:settings:read` |
| `GET` | `/api/admin/sms/senders/gate` | `admin:settings:read` |
| `POST` | `/api/admin/sms/senders` | `admin:settings:write` |
| `PATCH` | `/api/admin/sms/senders/:id` | `admin:settings:write` |
| `DELETE` | `/api/admin/sms/senders/:id` | `admin:settings:write` |

`POST`/`PATCH` responses return `rejectedTrialNumbers`: trial numbers that could not
be resolved to E.164 are **not dropped silently**; the panel shows which one was
not stored and why (`admin.smsSenders.savedWithRejected`).

### 11.7 Configuration with a demo account (`.env`)

`.env` is **gitignored**; credentials are never written into code.

```bash
# worktree/server/.env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC…
TWILIO_AUTH_TOKEN=…
TWILIO_FROM_NUMBER=+1…             # the account's own number (from the Twilio panel)
TWILIO_DEFAULT_COUNTRY_CODE=90
```

They can also be edited from the panel: a DB value **overrides** the `.env`
fallback (the badge becomes `db`). If the source is `.env` the field is
deliberately left empty and the real value is shown underneath as `.env değeri: …`
— otherwise a fake placeholder would mislead the operator.

To try it: Modules → SMS Gateway → **Test connection** (sends nothing, detects the
account type) → **Manage senders** in the same card → add the verified number to
the trial numbers. While the list is empty, delivery is **skipped** with
`SMS_TRIAL_NUMBER_NOT_VERIFIED` (nothing ever reaches Twilio).

---

## 12. Automatic delivery (scheduled SMS + the 15-minute job)

Exactly the same field names as the e-mail `runDueScheduledMails` model: when the
SMS `SmsTemplate` record has `type='scheduled'`

- `audience` — `{ type: 'all'|'segment'|'users', segmentId, userIds }`.
  **Automatic delivery is limited to all/segment** (`users` is manual-only; the
  form does not offer it and the validator rejects it with
  `SMS_AUTO_AUDIENCE_INVALID`).
- `schedule` — `{ enabled, intervalHours, lastSentAt, nextSentAt }`.

The job: `runDueScheduledSms()` + `startScheduledSmsJob()` (`services/smsTemplate.js`),
`server.js` calls `startScheduledSmsJob()` on boot (30 s delay, 15 min interval,
`unref` — it does not block the main loop).

Behavior (identical to e-mail):

- If `schedule.nextSentAt` has **never been computed it does not send
  immediately**, it only sets the due date — this prevents a burst of SMS at
  startup. The first real delivery is done with "Send now" in the panel or the due
  date fills on the next cycle.
- A template that is due (`nextSentAt <= now`) + `isActive` + `schedule.enabled`
  is sent to its `audience` with `sendTemplate`; the due date is advanced to
  `now + intervalHours`.
- On a delivery/gateway/module error the due date is **not advanced** → it is
  retried in 15 minutes.
- The job query also applies the `type: 'scheduled'` filter; a stale
  `schedule.enabled` value never sends action templates.

Form: **Communication → SMS → edit template** → "Automatic delivery" block
(`scheduled` only): on/off, interval (hours), audience (all users / one segment +
segment picker). The manual send window is separate and does **not** touch the
stored `audience`.

Validator + service gates (create/update):

| Code | Condition |
|------|-------|
| `SMS_SCHEDULE_ON_ACTION` | `type: 'action'` + `schedule.enabled` |
| `SMS_AUTO_AUDIENCE_INVALID` | `schedule.enabled` + `audience.type: 'users'` |
| `SMS_SEGMENT_REQUIRED` | `audience.type: 'segment'` + no `segmentId` |
| `SMS_USERS_REQUIRED` | `audience.type: 'users'` + empty `userIds` |
| `SMS_SCHEDULE_INTERVAL_INVALID` | `intervalHours` outside 1..8760 |

**Cost warning:** the demo action templates are seeded with `isActive: true` and
the domain hooks are live after this work. With the gateway + `sms-gateway` module
on, bet/campaign traffic produces real SMS; the operator should deactivate
unnecessary templates before sending. Automatic delivery only runs when
`schedule.enabled` is on and the due date has passed — the default is safe.

---

## 13. Related records

- `docs/admin-redesign/README.md` §6 (SMS gateway) and §7 (communication center + automatic delivery)
- `docs/mail-templates.md` — the same `schedule` model on the e-mail side
- `todo.md` #18 (SMS provider integration) and #19 (campaign delivery)
- `CHANGELOG.md` → `[Yayınlanmadı]`
- `docs/AI-GITHUB-WORKFLOW-POLICY.md` — commit/PR rules