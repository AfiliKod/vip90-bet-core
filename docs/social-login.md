# Social Login — Google, Telegram and MetaMask (Web3 wallet)

Three sign-in methods live next to the password login on the login screen
(`/login`): **Google** (OAuth 2.0), **Telegram** (Login Widget) and **MetaMask /
any injected EVM wallet** (signature login). Two of them are configured from the
admin panel, the wallet one needs no configuration at all.

| Method | Configured where | Button on the login screen |
|--------|------------------|----------------------------|
| Google | **Modules → Google Login** card, or `GOOGLE_*` env | Shown only when the method is active (`GET /api/auth/google/state`) |
| Telegram | `TELEGRAM_LOGIN_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` | Always (the widget itself reports whether a bot is configured) |
| MetaMask / wallet | Nothing — no env, no panel | Always; shows `WALLET_NOT_FOUND` when there is no injected wallet |

## Code map

```
server/src/routes/socialAuth.js            /api/auth/{google,telegram}/* routes
server/src/routes/web3Auth.js              /api/auth/wallet/* routes
server/src/services/socialAuth.js          OAuth state store, Google code exchange,
                                           Telegram HMAC check, find-or-create user
server/src/services/web3Auth.js            nonce store, signature recovery (ethers),
                                           find-or-create / link / unlink wallet
server/src/config/googleAuthConfig.js      DB (secret) > env > defaults resolution
server/src/controllers/integrationSettings.js  GET/PUT /api/admin/settings/google-auth
server/src/validators/auth.js              linkGoogleSchema, linkTelegramSchema,
                                           walletNonceSchema, walletAuthSchema
client/src/components/admin/GoogleLoginPanel.jsx   Modules → Google Login card
client/src/components/TelegramLoginWidget.jsx      Telegram Login Widget
client/src/pages/AuthCallback.jsx          the page the OAuth redirect lands on
client/src/store/authStore.js              loginWithWallet()
```

---

## Google login

### Configuration — two sources, panel wins

Resolution order is **DB (client secret encrypted) > server env > defaults**
(`server/src/config/googleAuthConfig.js`, 30 s TTL cache, invalidated on admin
save):

| Field | Panel field | Env | Default |
|-------|-------------|-----|---------|
| Switch | `enabled` (the card header switch) | `GOOGLE_LOGIN_ENABLED` | `'true'` (on) |
| Client ID | `clientId` | `GOOGLE_CLIENT_ID` | — |
| Client secret | `clientSecret` (encrypted, never returned) | `GOOGLE_CLIENT_SECRET` | — |
| Redirect URI | `redirectUri` | `GOOGLE_REDIRECT_URI` | first `CLIENT_URL` origin + `/api/auth/google/callback` |

The method is **active** only when `enabled` is on **and** both the client id and
the secret are present; `GET /api/auth/google/state` returns that as
`{ enabled }` and the login screen only renders the "Continue with Google" button
when it is `true`.

Panel: **Modules → Google Login** (`GoogleLoginPanel.jsx`). Admin API:
`GET/PUT /api/admin/settings/google-auth` (`admin:settings:read/write`), body
validated by `updateGoogleAuthSettingsSchema` — `enabled` (boolean or
`'true'|'false'|''`), `clientId`, `clientSecret`, `redirectUri` (must be
`http(s)://…`), and `clear: ['clientSecret']` to drop the stored secret.

### Google Cloud Console setup

1. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.**
2. Under **Authorized redirect URIs** add exactly the value the panel shows (or
   `GOOGLE_REDIRECT_URI`) — e.g. `https://app.example.com/api/auth/google/callback`.
   The comparison is exact: a trailing slash or a different host produces
   `redirect_uri_mismatch` at Google.
3. Copy the client id and secret into the card (or into `.env`), keep the switch
   on.

> The redirect URI is a **server** URL, not a client route. It points at
> `/api/auth/google/callback` on the API origin, so the frontend origin is
> derived from the first entry of `CLIENT_URL`. With a comma-separated
> `CLIENT_URL`, the **first** origin is the one used (see
> `docs/CHANGELOG.md` → `CLIENT_URL` entry).

### Flow

```
browser  GET /api/auth/google            (guestOnly + authLimiter)
server   → 302 to accounts.google.com?client_id=…&scope=openid email profile
          &access_type=offline&prompt=consent&state=<random 16-byte hex>
          &redirect_uri=<GOOGLE_REDIRECT_URI>
google   authenticates the user, redirects back with ?code=…&state=…
server   GET /api/auth/google/callback
          - consumes the state (single use, 10 min TTL)            → else INVALID_STATE
          - POST https://oauth2.googleapis.com/token  (code → access/refresh token)
          - GET  https://www.googleapis.com/oauth2/v2/userinfo   (profile)
          - find-or-create the user, signs access + refresh tokens
          - sets the refresh cookie
          - 302 to <CLIENT_URL>/auth/callback?token=<accessToken>
client   /auth/callback writes the token to localStorage, calls
          authStore.init() (/auth/refresh for the enriched user) → home
```

The `state` store (`oauthStateStore`) is an in-memory `Map` with a **10 minute**
TTL and single use. It does not survive a server restart and is not shared
between instances — relevant only when running more than one server process.

### Find-or-create rules

| Situation | Result |
|-----------|--------|
| No user with that e-mail | New user: username `google_<googleId[0:10]>`, e-mail = the Google e-mail lowercased, random password (no password login with it), `googleId/googleEmail/googleName/googlePicture` written, `emailVerified: true` (Google already verified it) |
| A user with that e-mail exists and has no `googleId` | The existing account is **linked**: `googleId` + profile fields are written and `emailVerified` is set |
| A user with that e-mail exists and already has a `googleId` | Nothing is changed; the existing password account keeps winning over the OAuth profile |

`googleId` has a sparse unique index, so one Google identity cannot be attached
to two accounts. Because find-or-create is keyed on the **e-mail**, Google login
by default merges into a password account that already uses the same address —
this is intentional (no second account for the same person).

### Errors and troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| No Google button on `/login` | `GET /api/auth/google/state` returned `{ enabled: false }`: the switch is off, or the client id / secret is missing. Check the Modules → Google Login status badge ("Client ID and Secret missing") |
| `GET /api/auth/google` → back at `/auth/callback?error=google_not_configured` | The method became inactive between rendering the button and clicking it |
| Redirect to Google shows `client_id=undefined` | The credentials are empty **and** the flow was started anyway (e.g. the button markup was cached or the request was made directly). With no credentials configured the server does not fail early — configure the client id + secret |
| `?error=invalid_request` | The callback query failed validation (missing `code` or `state`) |
| `?error=INVALID_STATE` | The state was already used, expired (> 10 min) or the server restarted mid-flow |
| `?error=oauth_failed` / other code | Token exchange or userinfo failed; the code after `error=` is the thrown error code |
| `redirect_uri_mismatch` at Google | The URI registered in the console differs from the one in use — register the value shown in the panel |
| Google asks for consent every time | Expected: `prompt=consent` + `access_type=offline` are requested deliberately; we store the Google id, not Google refresh tokens |

The callback page shows a generic error toast (the `?error=` code is not
translated into a specific message yet) and returns to `/login`.

---

## MetaMask / Web3 wallet login

No credentials, no env variables, no panel card: **the signature is verified
server-side** with `ethers`, so there is no external identity provider involved.
Only **injected** browser wallets are supported (`window.ethereum` — MetaMask,
Rabby, Brave wallet, …).

### Flow

```
client   window.ethereum.request({ method: 'eth_requestAccounts' })
server   POST /api/auth/wallet/nonce  { address }        (authLimiter, no session needed)
         → { message }  "<siteName> Girişi\n\nNonce: <hex>\nTimestamp: <ms>\n\n…"
client   window.ethereum.request({ method: 'personal_sign', params: [message, address] })
server   POST /api/auth/wallet/login { address, signature, message, walletType }
         - guestOnly + loginLimiter
         - ethers.verifyMessage(message, signature) must recover `address` → else 401 INVALID_SIGNATURE
         - the message must contain the current, unexpired nonce      → else 401 INVALID_NONCE
         - the nonce is consumed (single use, 5 min TTL)
         - find-or-create the user, signs access + refresh tokens, sets the refresh cookie
         → { accessToken, user }   (user enriched with igames + locked balances)
```

`address` is validated as `0x` + 40 hex characters and stored **lowercase**.
`walletType` is optional and must be one of
`metamask | walletconnect | coinbase | injected | unknown`; `chainId` is optional
(the browser client currently sends only `walletType: 'metamask'`, so
`walletChainId` ends up as the server default `1`).

### Find-or-create rules

| Situation | Result |
|-----------|--------|
| No user with that `walletAddress` | New user: username `web3_<address[2:10]>`, synthetic e-mail `<address>@web3.vip90.local`, random password, `walletAddress`, `walletType`, `walletConnectedAt`, `walletChainId`, `emailVerified: true` (the wallet *is* the proof of ownership) |
| A user with that `walletAddress` exists | Existing account; only `walletType`/`walletChainId` are refreshed and `walletConnectedAt` is stamped |

`walletAddress` has a sparse unique index, so one wallet cannot own two accounts.

**Email is synthetic.** A wallet user has no real e-mail, so:
- system e-mails that need a real address (verification, password reset) are not
  meaningful for that account;
- the synthetic `@web3.vip90.local` address is unique per address, so there is no
  collision with real users;
- if the same person later registers with a real address, that is a **separate**
  account unless the wallet is linked from inside the session (below).

### Errors

| Code | HTTP | Meaning |
|------|------|---------|
| `INVALID_SIGNATURE` | 401 | The recovered address does not match `address` |
| `INVALID_NONCE` | 401 | The nonce is unknown, expired (> 5 min) or already used |
| `WALLET_ALREADY_LINKED` | 409 | That wallet is linked to a different account (linking flow) |
| `USER_NOT_FOUND` | 404 | Linking/unlinking target no longer exists |
| `WALLET_NOT_FOUND` | client only | `window.ethereum` is missing; the user gets `auth.walletNotFound` |
| User rejects in MetaMask | client only | The rejection is handled silently (no toast) so a cancelled popup is not an error |

### Known limitations

- The nonce store is an **in-memory `Map`** (5 min TTL): nonces do not survive a
  restart and are not shared between instances. A single-process deployment is
  fine; with several processes use sticky sessions or a shared store.
- The sign-in message is a **hardcoded Turkish string** in
  `services/web3Auth.js` (`generateAuthMessage`) with a timestamp that is *not*
  validated separately (only the nonce has a TTL).
- `walletType: 'walletconnect'` is accepted by the validator but the browser
  client has no WalletConnect integration (and no relay project id in config) —
  only injected wallets work today.
- A wallet login always creates a **new account** if the address is unknown; there
  is no "sign in with Google, then attach my wallet" flow in the UI (the linking
  endpoint exists, see below).

---

## Telegram login

Extra provider with the same shape as Google, kept here for completeness.

- **Two different bots.** `TELEGRAM_LOGIN_BOT_TOKEN` must be a bot created
  **separately** from the admin notification bot (`TELEGRAM_BOT_TOKEN`); the Login
  Widget bot has to be registered for the production domain with `/setdomain` in
  BotFather, otherwise Telegram refuses the widget. `TELEGRAM_BOT_USERNAME` is the
  widget bot's username.
- The widget runs in Telegram's own page (`data-auth-url` mode). Before
  rendering, the client fetches a fresh state:
  `GET /api/auth/telegram/widget-state` → `{ state, botUsername }`.
- Callback `GET /api/auth/telegram/callback` verifies the state (single use,
  10 min) and the widget payload: the `hash` field is recomputed as
  `HMAC-SHA256(sha256(botToken), data-check-string)` and compared, and `auth_date`
  must be younger than 24 hours (`INVALID_TELEGRAM_DATA`, `EXPIRED_TELEGRAM_AUTH`).
- Find-or-create keys on `telegramId` (sparse unique) instead of the e-mail, since
  Telegram does not provide one: username `tg_<telegramUsername>` (or
  `tg_<id[0:10]>` when the user has no username), synthetic e-mail
  `<id>@telegram.vip90.local`, `emailVerified: true`. A user that already exists
  under the username `tg_<telegramUsername>` is **linked** instead of creating a
  second account.

---

## Linking an identity to an existing account

All link/unlink endpoints exist server-side; **there is no panel/UI for them yet**
— the login screen is the only place these methods are reachable. Use them only
if you build the UI (or call them from your own client).

| Method | Path | Effect |
|--------|------|--------|
| POST | `/api/auth/google/link` | Returns `{ url }` — the OAuth URL with the user id inside `state` |
| GET | `/api/auth/google/link/callback` | Links Google to the session user, then `302 → <CLIENT_URL>/profile?linked=google` |
| DELETE | `/api/auth/google` | Removes `googleId` + Google profile fields from the account |
| POST | `/api/auth/wallet/link` | Links a wallet (same `walletAuthSchema` body as login) |
| DELETE | `/api/auth/wallet` | Removes `walletAddress/walletType/walletConnectedAt/walletChainId` |
| POST | `/api/auth/telegram/link` | Returns the widget URL with the user id in `state` |
| GET | `/api/auth/telegram/link/callback` | Links Telegram, then `302 → <CLIENT_URL>/profile?linked=telegram` |
| DELETE | `/api/auth/telegram` | Removes the Telegram identity |
| GET | `/api/auth/accounts` | Lists the linked social accounts of the session user |

Unlinking does not delete the account and does not remove the password — it only
detaches the identity. Linking a wallet that already belongs to another account
returns `409 WALLET_ALREADY_LINKED`.

---

## API (social + wallet)

Full tables live in
[`docs/product/05-api-referansi.md`](product/05-api-referansi.md) — sections
"Web3 wallet login — `/api/auth/wallet`" and "Social login — `/api/auth`".
Summary of what you need for a client integration:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/auth/google/state` | public | `{ enabled }` — should the button be rendered |
| GET | `/api/auth/google` | guest | Start the OAuth redirect |
| GET | `/api/auth/google/callback` | public | Server-side callback → `?token=` or `?error=` |
| POST | `/api/auth/wallet/nonce` | public | One-time nonce + the message to sign |
| POST | `/api/auth/wallet/login` | guest | Signature login (creates the account if new) |
| POST | `/api/auth/wallet/link` | user | Link a wallet to the session account |
| DELETE | `/api/auth/wallet` | user | Unlink the wallet |
| GET | `/api/auth/telegram/widget-state` | public | Fresh `state` + bot username for the widget |
| GET | `/api/auth/accounts` | user | Linked social accounts |

## Rate limits and guards

- `guestOnly` applies to the login starts: an **already authenticated** session
  gets `403 ALREADY_AUTHENTICATED` from `/auth/google`, `/auth/telegram`,
  `/auth/wallet/login`.
- `loginLimiter` — 15 min / 10 failed attempts per IP on `/auth/login` and
  `/auth/wallet/login`.
- `authLimiter` — 15 min / 5 requests per IP on `/auth/wallet/nonce`,
  `/auth/google`, `/auth/telegram`, `/auth/telegram/widget-state`.
  The limiters are skipped in `NODE_ENV=test` / `E2E_TEST=true`.
- Refresh cookie, access token and "authStore.init()" behave exactly as with
  password login, so session handling needs no special casing.

## Tests

```bash
NODE_ENV=test node --test server/test/socialAuth.test.js server/test/web3Auth.test.js server/test/googleAuthConfig.test.js
NODE_ENV=test node --test server/test/routeWiring.test.js
```

The wallet happy path (nonce → sign → verify → create account → tokens) is
covered end to end by `web3Auth.test.js`; `googleAuthConfig.test.js` covers the
DB/env/default resolution and `socialAuth.test.js` the OAuth state store, the
Telegram HMAC check and the find-or-create rules. `web3Auth.test.js` and
`socialAuth.test.js` need a local MongoDB (they connect with
`mongodb://localhost:27017/…` and drop their database at the end); the config
test needs nothing.

## Related documents

- [`docs/product/02-yapilandirma.md`](product/02-yapilandirma.md#social-login) —
  the `GOOGLE_*` / `TELEGRAM_*` variables in the configuration reference.
- [`docs/product/05-api-referansi.md`](product/05-api-referansi.md) — endpoint
  tables, rate limits, guest-only rules.
- [`docs/product/09-bilinen-kisitlar.md`](product/09-bilinen-kisitlar.md) —
  known limitations.
- `server/.env.example` — the `GOOGLE_*`, `TELEGRAM_LOGIN_*` blocks.