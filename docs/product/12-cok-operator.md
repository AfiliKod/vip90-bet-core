# Multi-Operator Installation

Since version 1.1.0, one central installation can operate multiple isolated operators. Each operator has separate domains, branding, staff, integration settings, and operating data. The Platform Owner console, partner portal, commission/NGR calculations, and statements are part of that central installation.

This guide is only for **new, clean** multi-operator installations. It is not a migration path for existing single-operator installations.

## Modes

| Mode | Use | Required action |
|---|---|---|
| `single` | One installation, one default operator | No new configuration is required; the existing flow continues. |
| `multi` | One central installation, many independent operators | The environment settings, bootstrap, and domain verification below are required. |

In multi mode, data access is always tenant-scoped. Requesting one operator's record with another operator's identity does not grant access; the client receives `404`. Demo bots, fake winners, instant demo deposits, and demo-data generation are disabled in multi mode.

## Starting a New Multi-Operator Installation

First define the following values in `server/.env`. `JWT_STAFF_SECRET` and `OPERATOR_SECRET_ENCRYPTION_KEY` are production secrets; do not use example values.

| Variable | Multi-mode value/rule | Purpose |
|---|---|---|
| `TENANCY_MODE` | `multi` | Enables central multi-operator operation. |
| `TENANCY_ENFORCEMENT` | `enforce` (no other value is accepted) | Blocks unscoped queries for operator data. |
| `JWT_STAFF_SECRET` | Required | Signs the staff-token family. |
| `OPERATOR_SECRET_ENCRYPTION_KEY` | Required, 64 hexadecimal characters | Encrypts operator secrets saved in the panel. |
| `PLATFORM_HOST` | Platform-console domain, for example `platform.example.com` | Binds `/console` and platform/partner API paths to the platform host. |
| `SCOPE_GATE_ENV` | `staging` or `production` | Records N6 scope-violation measurement. |
| `AUDIT_RETENTION_DAYS` | At least `1825` | Minimum retention period after audit and closure. |
| `DEMO_BOTS`, `DEMO_FAKE_WINNERS`, `DEMO_INSTANT_DEPOSIT`, `DEMO_DATA` | All `false` | Demo behaviour is forbidden in multi mode. |
| `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_REGISTRATION_NO`, `LEGAL_ENTITY_ADDRESS` | Optional for the default operator | Provides legal details when the default tenant is first created. |

The setup wizard is disabled in multi mode. After running migrations, the `platform-001-bootstrap` record prepares platform permissions, role templates, retention settings, and required indexes. Create the first Platform Owner with:

```bash
node scripts/platform-bootstrap.mjs --owner-email owner@example.com --password-stdin
```

`--password-stdin` is optional; without it, the script shows a temporary password only once in the terminal. The Platform Owner must complete 2FA setup at first login. Staff without 2FA verification receive no access token in multi mode.

## Console and Operator Provisioning

In multi mode, the Platform Owner console is available only at `/console` on the platform host, for example `https://platform.example.com/console`. Creating an operator creates a Tenant in `provisioning` status, a default brand, primary Domain, base settings, and optionally its owner staff account.

The owner invitation link is shown only in the first provisioning response. It is single-use and valid for 72 hours. If it is lost, the console can generate it again while the account has not signed in; an owner who has signed in resets their password through their own flow.

### Domain Verification and TLS

Every operator domain must be verified through DNS before it can receive player traffic. Add the token supplied by the console to this TXT name:

```text
_domain-verify.operator.example.com
```

Start DNS verification from the console; verification also accepts the same token at the domain apex. Only domains with a `verifiedAt` record resolve to an operator. Then refresh the TLS status; DNS verification alone does not enable TLS.

### Go-Live Checklist

Complete the console checklist before setting an operator to `active`:

- legal-entity name, registration number, and address;
- written provider approval and document application when casino content is authorised;
- PSP sandbox deposit/withdrawal test;
- KYC webhook test;
- email delivery test;
- verified DNS and active TLS for the primary domain.

The status lifecycle is `provisioning → active ⇄ suspended → closed`. `closed` is terminal. On closure, deletion cannot occur before the configured audit-retention period and five years.

## Staff Access and the Write Exception

Platform-scoped staff can use only GET/HEAD/OPTIONS on operator routes by default. A write attempt returns `403 PLATFORM_READ_ONLY` and creates an audit record. Only a Platform Owner may grant a justified write exception for a named staff member and operator for at most 24 hours. When the grant is revoked or expires, access becomes read-only again.

## Partners

A partner's active status, capabilities (such as `metrics.read`, staff management, operator creation/status/integration/owner invitation), operator quota, permitted modules, and entitlement ceiling are configured separately. A partner staff member's effective permission is the intersection of their role permission and the partner's and, where applicable, operator-link capability; a role alone cannot expand the partner boundary.

The partner portal shows operators in its portfolio, staff, integration settings, metrics, and statements. Metrics are calculated from daily aggregates, contain no player identities, and suppress the value as `"<5"` when `activePlayers < 5`.

An operator owner grants or revokes a PartnerGrant only in the limited cases where the partner needs operator data. A grant records scopes (`players:read`, `players:pii`, `finance:read`, `reports:raw`, `support:write`, `players:status:write`, `promotions:assign`), reason, start/end time, and granting staff member; it can last at most 90 days. Granting, revocation, and use are audited. A partner cannot grant access to itself.

## Billing and NGR

An operator fee plan (K20) supports fixed/turnover percentage/both models for sports and fixed/GGR percentage/both models for the platform. Partner commercial terms select `ggr`, `ngr`, `turnover`, or `fixed` as the commission basis. The statement flow consists of drafting, issuing (`issued`), audited adjustment, voiding (`voided`), and CSV export. The NGR definition version on an issued or settled statement cannot change.

An NGR definition (K28) contains casino and/or sports GGR components and bonus, provider-fee, tax, chargeback, and other deductions. A deduction source is a daily-stat field, fee plan, rate, or daily fixed amount. Definitions are versioned; an NGR term is tied to a specific definition ID and version.

The same cost cannot be deducted twice: an active category can be used once (only `other` may repeat with distinct labels); one statistics field or fee-plan component cannot be tied to two lines; and a cost already netted from GGR cannot be deducted again. `rate` and `fixed` may be separate lines against the same target because they calculate new costs. `providerFees` is calculated daily from provider-specific GGR rates in an open `ProviderFeeSchedule` contract; an operator-specific schedule takes precedence over the platform default for the same date and provider. A provider with negative GGR incurs no daily fee; the monthly minimum is retained as contract information and is not applied to the daily calculation. Use this in NGR as `provider_fee` with `stat_field: providerFees`. The K20 sports-betting feed cost (`fee_plan: sportsbookFee`) is not included in `providerFees`; it is a separate cost. If both are used, one is `provider_fee` and the other an `other` item with a distinct label (each category is used once). `chargebacks` and `chargebackCount` are populated from verified Slikair `chargeback` notifications (see [Slikair](../providers/slikair.md)): the chargeback amount is deducted from the player balance, the account enters risk review, and the NGR `chargeback` item uses that amount through `stat_field: chargebacks`. Define a separate `other` item with `fixed` + `per_chargeback` for a PSP chargeback fee. Refunds and ledger reversals are not chargebacks.

## N6 Scope Gates

When `SCOPE_GATE_ENV` is set, scope violations are persistently counted by UTC day. The console requires 14 consecutive clean days for staging and 7 for production. If the variable is empty, measurement does not start; this does not change the mandatory multi-mode `enforce` behaviour.

## Capacity Measurement (İP-10a)

The platform console's "Capacity Measurement" card shows the latest completed 15-minute-window evaluation beside the N6 gates: concurrent-socket p95, event-loop-delay p99 (ms), and process CPU average (%). Each metric is `ok`, `approaching` (70% of the threshold), or `exceeded`; CPU requires at least three windows above the 70% threshold in the last seven days to become `exceeded`. Defaults are socket p95 2000, event-loop p99 100 ms, and CPU 70%; configure them with `CAPACITY_SOCKETS_P95`, `CAPACITY_EVENT_LOOP_P99_MS`, and `CAPACITY_CPU_PCT`. The same data is available at `GET /api/platform/system/capacity` with `platform:tenants:manage`. Each transition to `approaching` or `exceeded` writes a `[capacity]` warning to the server log and creates an activity record for platform staff (AuditLog, `actorType: system`). Measurement runs in both modes; single mode writes only the log warning, while the activity record is multi-mode-specific.

## Common Errors

| Code | Meaning | Action |
|---|---|---|
| `TENANT_NOT_FOUND` | The host is not linked to a verified Domain. | Complete DNS TXT verification and use the correct domain. |
| `TENANT_NOT_READY` | The operator is still being provisioned. | Complete staff settings and the go-live checklist. |
| `TENANT_SUSPENDED` | The operator is suspended. | Set its status to `active` through the Platform Owner. |
| `TENANT_CLOSED` | The operator is closed. | Provision a new operator; a closed status cannot be reopened. |
| `PLATFORM_READ_ONLY` | Platform staff attempted a write on an operator route. | Use a read-only operation or request a time-limited grant from the Platform Owner. |
| `PARTNER_NOT_ACTIVE` | The partner is suspended or closed. | Activate the partner status. |
| `MAX_TENANTS_EXCEEDED` | The partner has reached its operator quota. | Update the partner limit or end an active link. |
| `MODULE_NOT_ALLOWED` | The requested module is not in the partner's permitted modules. | Match the partner's module ceiling and requested entitlement. |
| `TENANT_KEY_TAKEN` | The operator key belongs to another operator. | Select a unique key. |
| `ERR_TERMS_NGR_DEFINITION` | The NGR commercial term has no valid definition/version. | Create the definition and version, then attach it to the term. |
| `ERR_NGR_DUPLICATE_CATEGORY` / `ERR_NGR_DUPLICATE_SOURCE` / `ERR_NGR_ALREADY_NET_OF` | The NGR definition could deduct the same cost twice. | Remove the conflicting deduction; do not add a cost already netted from GGR. |
| `ERR_NGR_DEFINITION_IN_USE` | An issued statement uses an NGR version. | Do not modify the current version; create a new one. |
| `ERR_STATEMENT_ALREADY_ISSUED` | An issued statement already exists for the period. | Use a new period or review the draft/statement flow. |
| `ERR_INVALID_STATUS` / `ERR_STATEMENT_VOIDED` | The statement status does not allow the requested operation. | Issue only drafts; do not add adjustments to a voided statement. |
| `INVALID_WRITE_GRANT_DURATION` / `REASON_REQUIRED` | The write exception has an invalid duration or reason. | Give a reason and set expiry between now and 24 hours. |
| `OWNER_ALREADY_ACTIVE` | The operator owner has already signed in. | Do not regenerate the invitation; use the owner's password-reset flow. |
| `ERR_NGR_DOUBLE_DEDUCTION` | An NGR deduction conflicted during calculation. | Correct the definition using the double-deduction rules above and use a new version. |

### New Central Installation from an Empty Database

1. Use a new, empty MongoDB replica set; do not move existing single-operator demo data into multi mode.
2. Set `TENANCY_MODE=multi`, `TENANCY_ENFORCEMENT=enforce`, `JWT_STAFF_SECRET`, `OPERATOR_SECRET_ENCRYPTION_KEY`, and `PLATFORM_HOST`, then apply the values in the following table; start the application and complete migration/bootstrap work.
3. Run `node scripts/platform-bootstrap.mjs --owner-email owner@example.com --password-stdin`. Supply the password through standard input rather than the command line.
4. Sign in at `https://platform.example.com/console` and complete mandatory 2FA enrolment.
5. Provision the operator with a unique key, legal entity, domain, currency/timezone, and entitlements; deliver the single-use owner invitation securely.
6. Complete DNS TXT, TLS, PSP/KYC/email tests and, where required, written provider approval. Set the operator to `active` when the checklist is complete.

### Multi-Mode Environment Variables

| Variable | Requirement/default | Effect |
|---|---|---|
| `TENANCY_MODE` | `multi` | Enables central operator isolation. |
| `TENANCY_ENFORCEMENT` | `enforce`; mandatory in multi mode | Rejects unscoped operator queries. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Required | Player access/refresh tokens. |
| `JWT_STAFF_SECRET` | Required in multi mode | Separate staff-token family. |
| `OPERATOR_SECRET_ENCRYPTION_KEY` | Required in multi mode, 64 hexadecimal characters | Encrypts operator secrets saved in the panel. |
| `PLATFORM_HOST` | Strongly recommended in production (not required at startup) | The platform console and platform/partner API are served only on this host; when empty, the path (`/api/platform`, `/api/partner`, `/console`) decides. |
| `MONGODB_URI` | Required | Replica-set connection. |
| `AUDIT_RETENTION_DAYS` | At least `1825` | Minimum audit retention. |
| `SCOPE_GATE_ENV` | Empty, `staging`, or `production` | Enables clean-day measurement for scope gates. |
| `CAPACITY_SOCKETS_P95` | `2000` | Socket-p95 threshold. |
| `CAPACITY_EVENT_LOOP_P99_MS` | `100` | Event-loop-p99 threshold in milliseconds. |
| `CAPACITY_CPU_PCT` | `70` | Process-CPU-average percentage threshold. |
| `DEMO_BOTS`, `DEMO_FAKE_WINNERS`, `DEMO_INSTANT_DEPOSIT`, `DEMO_DATA` | Effectively `false` | Demo functionality is disabled in multi mode. |
| Provider variables (`SUMSUB_*`, `SLIKAIR_*`, etc.) | Depends on integration | In multi mode, credentials come from operator-scoped settings; a missing value never falls back to another operator. |

### Partner Onboarding

1. The Platform Owner creates the partner's key, legal entity/contact details, capabilities, quota, permitted modules, and entitlement ceiling.
2. The partner invites its own staff. Effective access is the intersection of role permission and partner/operator-link capabilities.
3. When within quota, the partner provisions an operator; an active `PartnerOperatorLink` and initial commercial terms are recorded.
4. Operator-specific commercial terms can be defined on the link. Partner metrics contain no player identities and show `"<5"` for fewer than five active players.
5. When access is needed, the operator owner gives a justified, scoped grant for at most 90 days and revokes it after use. A partner cannot grant access to itself.

### Monthly Statement Cycle and NGR Example

1. Create the operator fee plan (`fixed`/`turnover_percentage`/`both` for sports; `fixed`/`ggr_percentage`/`both` for the platform).
2. Create a platform-default or operator-specific schedule for the provider. A new open schedule at the same scope and provider closes the previous one on its effective date.
3. Attach a definition ID and version to the commercial term that requires NGR. Do not deduct a cost already netted in daily statistics again.
4. Generate a draft statement for the partner and period, then review its lines, currency, and calculated NGR.
5. Add a justified adjustment to the draft or issue it. An issued/settled statement and its NGR version cannot change; void the statement if necessary. CSV is available in both platform and partner views.

| NGR item (example) | Source | Amount | Subtotal |
|---|---|---:|---:|
| Casino GGR + realised sports GGR | Components | 1,500 | 1,500 |
| Bonus | `stat_field: bonusCost` | -120 | 1,380 |
| Provider fee | `stat_field: providerFees` | -90 | 1,290 |
| Tax | `rate`, 10% of GGR | -150 | 1,140 |
| Chargeback | `stat_field: chargebacks` | -60 | 1,080 |
| Other: per-event PSP cost | `fixed` + `per_chargeback`, 2 × 10 | -20 | 1,060 |

For this example, NGR is `1,060`. Each category other than `other` can be used at most once. If GGR is already net of a cost such as a bonus or tax, that category belongs in `ggrAlreadyNetOf` and cannot be another item. `minimumMonthlyFee` in a provider schedule is contract information and is not applied to daily `providerFees` calculation.

### When a Chargeback Arrives

1. Slikair sends `status: "chargeback"` for a credited deposit. Because the notification is unsigned, core verifies the identical status, amount, and currency through `get-status`; if it cannot verify them, money does not move, the notification is retained as unverified on the payment record, and a critical log is written.
2. Once verified, the deposit amount is deducted from the player balance **once** (the balance can become negative), a `chargeback` ledger row is linked to the original deposit, and the payment becomes `chargeback`.
3. The account receives a high-severity `PSP_CHARGEBACK` risk finding and reaches at least `REVIEW`; later rule evaluations do not clear it. A `deposit_chargeback` event appears in the administration feed.
4. A player with a negative balance cannot withdraw or bet. Staff review the situation (player contact, documents, PSP dispute process), then mark the finding `resolved` or `dismissed`; the next evaluation returns the account to its normal flow.
5. Verified chargebacks enter that day's `TenantDailyStat.chargebacks` and `chargebackCount`; the NGR `chargeback` item (`stat_field: chargebacks`) and separately labelled PSP fee `other` + `fixed` + `per_chargeback` item use those values. Details: [Slikair](../providers/slikair.md).

### Action by Capacity State

| State | Meaning | Operating action |
|---|---|---|
| `ok` | The latest window is below 70% of every threshold. | Monitor the trend. |
| `approaching` | A metric is at least 70% of its threshold; a limited number of hot CPU windows also appears here. | Review traffic, queries, and socket usage; prepare capacity expansion or horizontal-distribution work. |
| `exceeded` | The socket or event-loop threshold is exceeded, or at least three CPU windows in the last seven days exceeded the threshold. | Review service health, increase capacity, or distribute traffic safely; version 1.2.0 does not auto-scale. |

### Additional Error Codes

| Code | Meaning and action |
|---|---|
| `PROVIDER_RATEOFGGR_AND_CURRENCY_ARE_REQUIRED` | Provider, GGR rate, or currency is missing; enter all three. |
| `INVALID_PROVIDER_FEE_SCHEDULE` | Rate/date is invalid; provide a rate from `0` to `1` and dates in order. |
| `PARTNERID_PERIODSTART_AND_PERIODEND_ARE_REQUIRED` | The statement period is missing; provide the partner and both dates. |
| `AMOUNT_AND_DESCRIPTION_ARE_REQUIRED` | Adjustment amount/description is missing; provide both. |
| `NOT_FOUND` | The platform, partner, or billing record was not found; verify its identity and access scope. |
| `PARTNER_GRANT_REQUIRED` | No active partner grant exists for the operator; its owner must issue one with the required scope. |
| `INVITE_INVALID` | The invitation link is invalid, expired (72 hours), or used; create a new invitation only if the owner has never signed in. |
| `PASSWORD_TOO_SHORT` | The invitation-acceptance password is shorter than 12 characters. |

See [API Reference](05-api-referansi.md) for related routes, [Configuration](02-yapilandirma.md) for every environment variable, and [Installation](01-kurulum.md) for installation detail.
