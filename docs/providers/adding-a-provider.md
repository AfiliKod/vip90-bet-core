# Adding a New Provider

This guide describes the repository patterns for adding a provider without weakening tenant isolation. It is an implementation guide, not an integration catalogue: use the provider's API documentation for its protocol and use the code paths below for the platform contract.

There is no generic payment-provider interface in core. Payment providers are provider-specific implementations; follow the Slikair structure rather than inventing a shared abstraction unless core later adds one.

## Rules That Apply to Every Provider

- Keep credentials in a tenant-scoped settings store. `server/src/config/secretSettingsStore.js` encrypts fields marked `secret`; multi mode requires `OPERATOR_SECRET_ENCRYPTION_KEY` for panel-saved secrets.
- In multi mode, a missing tenant setting must not fall back to host environment variables or another tenant's settings. Single mode may retain the documented environment fallback for that store.
- Run tenant-owned work in the correct tenant context and use tenant-scoped models and queries. Callback processing must attribute the tenant before using tenant credentials or records.
- Do not log secrets, payment instruments, identity documents, raw webhook bodies containing PII, or unnecessary provider responses.
- Add the provider to the appropriate module gate and panel configuration surface. A disabled module must fail safely, but callbacks for transactions already started may need to remain available to settle them.
- Update this guide or the provider-specific document, the provider index, product documentation where operators configure the feature, and `CHANGELOG.md` under `[Yayınlanmadı]`.

## Payment Provider Pattern

Slikair is the payment reference implementation. Its configuration is in `server/src/config/slikair.js` and `server/src/config/slikairConfig.js`, its HTTP client is `server/src/services/slikairService.js`, its controller is `server/src/controllers/slikairController.js`, and its routes are `server/src/routes/slikair.js`.

### Files to create or modify

- Create a provider configuration module patterned after `server/src/config/slikairConfig.js`; declare its field names and environment names, and expose a `get...Credentials()` and `is...Configured()` function.
- Create a provider service patterned after `server/src/services/slikairService.js`; keep provider HTTP requests, authentication, timeouts, and provider idempotency headers there.
- Create a controller and route module patterned after `server/src/controllers/slikairController.js` and `server/src/routes/slikair.js`.
- Create tenant-owned payment and payout models patterned after `server/src/models/SlikairPayment.js` and `server/src/models/SlikairPayout.js`, using `defineTenantModel` and `registerTenantIndexes`.
- Add panel handlers, validation, and the module definition/gate in `server/src/modules/registry.js` and `server/src/middleware/moduleGate.js`. The existing Slikair panel API is `/api/admin/slikair/settings` in `server/src/routes/admin.js`.
- Add a health-status field only after implementing a safe, bounded health check. `GET /api/health/status` is defined in `server/src/app.js`.

### Configuration and tenant isolation

Use `createSecretSettingsStore` from `server/src/config/secretSettingsStore.js`, as `createSlikairConfigStore()` does. Slikair fields are read from encrypted database settings first and fall back to `SLIKAIR_*` variables only in single mode. In multi mode, credentials resolve per tenant and no environment fallback is allowed. The same design applies to a new provider: declare the actual environment names in the configuration module, keep secret fields encrypted, and expose only masked values to panel clients.

`server/src/config/crypto.js` is a separate configuration pattern for the built-in crypto payment gateway: `crypto.settings` is tenant-bucketed in multi mode, while `USDT_TRY_RATE` and `TRON_NETWORK` seed single-mode defaults. Do not reuse a global in-memory bucket for a new multi-tenant provider.

### Callbacks, verification, ledger, and reversals

Create provider callbacks under the provider's route namespace. Slikair uses `POST /api/slikair/webhook/payin` and `POST /api/slikair/webhook/payout`. When a callback has no tenant identity, attribute it from the stored record before processing: `findPaymentForCallback()` and `findPayoutForCallback()` in `server/src/tenancy/callbackAttribution.js` make the narrowly scoped platform lookup and return the record's `tenantId`.

Slikair notifications are unsigned, so `handlePayinWebhook()` and `handlePayoutWebhook()` re-fetch the provider status before changing money. A new unsigned provider must implement equivalent verification through its status API and require the stored record, provider status, amount, and currency to match. If the provider signs requests, verify its signature against the tenant's secret before parsing or acting on the event; reject stale/replayed events according to that provider's signed timestamp or event identifier.

Write balance and transaction changes in one database transaction. Use `createTransaction()` from `server/src/services/ledger.js` with a deterministic idempotency key. `reverseCreditedDeposit()` in `server/src/services/pspReversal.js` conditionally claims the original payment and creates a single reversal ledger row; `flagChargebackForReview()` creates the high-severity `PSP_CHARGEBACK` risk finding. Follow that separation for refund and chargeback semantics. Use `server/src/services/riskEngine.js` for normal risk evaluation where the flow requires it.

Do not disable settlement callbacks merely because new deposits are disabled. `createSlikairRouter()` gates only `POST /deposit` with `slikair-payment`; its history and callback routes remain available so already initiated payments can settle.

### Daily statistics and fee schedules

`server/src/services/tenantDailyStat.js` calculates `chargebacks`, `chargebackCount`, `providerFees`, and `providerFeesByProvider` from tenant records. A new payment provider that supports verified chargebacks must create the completed `chargeback` ledger rows consumed by this job. A PSP fee is not inferred from a chargeback; represent a contractual per-chargeback fee through the NGR definition when applicable.

`ProviderFeeSchedule` in `server/src/models/ProviderFeeSchedule.js` applies to casino-provider GGR, not to payment processing fees. It selects an operator-specific schedule before a platform-default one. Do not use it for a payment provider unless the business rule is actually a casino GGR fee.

### Payment tests

Use these Slikair tests as templates:

- `server/test/slikair.test.js` for configuration, models, validation, and state transitions.
- `server/test/slikair-webhook-connectivity.test.js` for webhook discovery, verification, and duplicate delivery.
- `server/test/slikairCallbackAttribution.test.js` for tenant attribution.
- `server/test/slikairChargeback.test.js` for verified and unverified reversals, negative balances, ledger rows, risk review, and daily statistics.
- `server/test/slikairModuleGate.test.js` and `server/test/slikairDepositRisk.test.js` for module and risk gates.
- `server/test/slikair-payout.test.js` for payout idempotency, refunds, and reconciliation.

## KYC Provider Pattern

The local/manual service is `server/src/services/kyc.js`; its configuration is `server/src/config/kyc.js`. The existing remote KYC integration uses `server/src/services/sumsubService.js` and `server/src/routes/sumsubWebhook.js`; see [Sumsub KYC](sumsub-kyc.md) and [Local KYC](local-kyc.md).

Create an adapter that keeps provider authentication and API calls separate from the local KYC state transitions. The existing remote client creates an applicant, generates an SDK token, and retrieves applicant review status. Add only functions that the routes need, and continue to store the platform's KYC state on `User` through the existing KYC service and routes.

The KYC settings store defines `KYC_ENABLED`, `KYC_PROVIDER`, `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_LEVEL_NAME`, `SUMSUB_WEBHOOK_SECRET`, and `KYC_FAILURE_POLICY`; sensitive values are encrypted. Add a new provider's real setting keys, mark secrets as such, expose masked values to the panel, and retain single-mode-only environment fallback. In multi mode, the tenant's settings are the only source.

For a tenant-addressable callback, use the existing URL shape: `POST https://operator.example.com/api/webhook/sumsub/:tenantId`. `server/src/routes/sumsubWebhook.js` resolves the tenant before it selects the webhook secret, requires the tenant segment in multi mode, validates HMAC and `x-app-timestamp`, and uses `runWithTenant()` to load the player. A new KYC callback must provide the same tenant identity, verify its signature and replay window, and return the same not-found response for a player in another tenant as for a missing player.

Add adapter, signature, replay, tenant-attribution, success/rejection, and missing-secret tests. `server/test/sumsub.test.js`, `server/test/sumsubCallbackAttribution.test.js`, and `server/test/security/v11-sumsub-rawbody.test.js` are the templates.

## SMS Provider Pattern

SMS transport adapters live in `server/src/services/smsGateway.js`; settings are in `server/src/services/smsSettings.js`; sender-registration and delivery gates are in `server/src/services/smsSender.js`. The current provider is Twilio. Read [SMS Gateway](../sms-gateway/README.md) before adding a transport.

`smsGateway.js` deliberately gives adapters a small contract: `send()` always returns `{ ok, sid, status, code, error }` and does not throw. Add a new sender and checker in the provider maps there, then add the provider and setting keys to `smsSettings.js`. The existing settings keys map to `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_DEFAULT_COUNTRY_CODE`, `SMS_ACCOUNT_TYPE`, and `SMS_TRIAL_SIGNUP_COUNTRY`; use new, provider-specific names for a new provider.

Encrypt tokens, keep configuration tenant-scoped, and do not permit environment fallback in multi mode. Preserve the sender gate in `smsSender.js`: validate sender identity and recipient eligibility before delivery, record each attempt, and never let an SMS failure break the business action that triggered it. Add adapter unit tests with injected `fetchImpl`, configuration/encryption tests, sender-gate tests, and a documented panel test flow.

## Email Provider Pattern

Email configuration is in `server/src/config/emailConfig.js` and sending is in `server/src/services/email.js`. The current supported settings select Mailtrap API delivery, generic SMTP delivery, or no delivery. `EMAIL_PROVIDERS` includes `mailtrap`, `mailgun`, `ses`, `postmark`, and `custom`; Mailgun can use the SMTP configuration. The actual settings are `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME`, `SMTP_PROVIDER`, `SMTP_GATEWAY_ENABLED`, `MAILTRAP_TOKEN`, `MAILTRAP_SANDBOX`, and `MAILTRAP_INBOX_ID`.

Add a new transport only when the provider cannot use the existing SMTP or Mailtrap paths. Keep the transport pool tenant-keyed as `getSender()` does, include every connection-affecting setting in its cache signature, and clear/rebuild only the affected tenant's transport on setting changes. Encrypt tokens and passwords. In multi mode, `getSender()` must return no sender when a tenant has no configuration; it must not use host credentials. Add unit tests for mode selection, transport pooling, encryption/masking, tenant isolation, and an injected provider client.

## Casino Content or Game Provider Add-on Pattern

Casino-content and game providers belong in a private add-on. Core must not import that add-on. The public extension surface is `server/src/tenancy/index.js`; import tenancy primitives from there, not core internals. The module design is documented in [Module System](../product/03-modul-sistemi.md).

At add-on load time, register idempotent tenant provisioning work with `registerTenantProvisioningHook()` and the per-tenant credential form with `registerTenantCredentialSchema()`. Credential fields have `key`, optional `label`, and boolean `secret`/`required`; the registry validates them. Run tenant data work with `runWithTenant()`.

Every persisted casino round must set `CasinoRound.provider` in `server/src/models/CasinoRound.js` to the provider key. `aggregateTenantDailyStat()` groups GGR by that key and applies `ProviderFeeSchedule` records from `server/src/models/ProviderFeeSchedule.js`; an operator-specific open schedule overrides the platform default. The resulting `providerFees` and `providerFeesByProvider` values support an NGR definition item with category `provider_fee` and `stat_field: providerFees`. A negative provider GGR produces no daily percentage fee; `minimumMonthlyFee` remains contract information rather than a daily deduction.

Create an add-on-local provider client, callback handler, routes, credential schema, module registration, models, and tests. Use a tenant-specific callback URL or otherwise include a trustworthy tenant key, and verify signatures, replays, amount/currency when money is involved, and idempotency before writing a round or ledger movement. Keep PII and credentials out of logs and add-on responses.

## Definition of Done

- [ ] The provider has a provider-specific document and an index entry.
- [ ] Every configuration key, environment variable, model, route, and panel setting is implemented and documented from code.
- [ ] Secrets are encrypted in the panel store, masked in responses, and never logged.
- [ ] Single-mode environment fallback is documented only where the store implements it; multi mode has no cross-tenant or environment fallback.
- [ ] Callback tenant attribution happens before tenant credentials or tenant records are used.
- [ ] Callback authenticity, replay protection, provider status where required, amount/currency matching, and idempotency are covered by tests.
- [ ] All monetary changes use the ledger and a transactional, deterministic idempotency key; refunds and chargebacks cannot double-post.
- [ ] Module gates, panel configuration, health reporting where implemented, risk handling, and tenant daily statistics are updated.
- [ ] Provider-specific and tenancy-isolation tests pass; the documentation links and `CHANGELOG.md` are updated.
