# Security Policy

VIP90.bet handles player balances, payments and identity documents, so we
treat security reports as a priority.

## Supported versions

Security fixes are made on the latest release line. Please upgrade to the
most recent version before reporting.

| Version | Supported |
|---|---|
| 0.4.x | ✅ |
| < 0.4 | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: open the repository's **Security** tab and
choose **Report a vulnerability**. Include:

- the affected version or commit,
- the component (API route, admin page, payment/KYC flow, etc.),
- steps to reproduce or a proof of concept,
- the impact you expect (for example balance manipulation, account takeover,
  data exposure).

We aim to acknowledge reports within 3 business days and to keep you updated
until the issue is resolved. Fixes are released as a new version and listed
under the **Güvenlik** (Security) headings in [`CHANGELOG.md`](CHANGELOG.md).

## Scope

In scope: the code in this repository (server, client, installer, deployment
files). Out of scope: third-party services you connect (payment providers,
KYC providers, casino content aggregators), your own server configuration,
and the separately licensed paid add-ons, which have their own support
channel.

Please test only against your own installation. Do not access other people's
data or disrupt live services.
