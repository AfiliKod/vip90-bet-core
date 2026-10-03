# VIP90.bet Documentation

This directory is written for operators who have purchased the product — not for developers who already know the codebase (that documentation is in `docs/superpowers/` and in code comments).

- [01 — Installation](01-kurulum.md) — from scratch to a working core setup (Docker or manual), plus how to install the paid add-ons (In-house Games, Sports Betting, Casino Content).
- [02 — Configuration](02-yapilandirma.md) — `.env` variables (including which listed ones the code does not read) and panel-managed settings with their menu locations.
- [03 — Module System](03-modul-sistemi.md) — the difference between the core platform, the three paid add-ons and the built-in modules; the six modules and their gates.
- [04 — Game Mathematics](04-oyun-matematigi.md) — provably fair mechanism, house edge values.
- [05 — API Reference](05-api-referansi.md) — endpoint summary (core, add-on and admin routes).
- [06 — Frequently Asked Questions](06-sss.md)
- [07 — Video Library Storyboards](07-video-storyboardlari.md) — the foundation for actual video recording, no videos have been produced yet.
- [08 — Asset License Audit](08-varlik-lisans-denetimi.md) — the former critical finding (`casinoGames.js` with unlicensed third-party content) is resolved; the provider logos under `client/public/images/providers/` still need a licensing decision.
- [09 — Known Limitations](09-bilinen-kisitlar.md) — remaining gaps (Live Casino, multi-tier affiliate, provider-side bonus/freeround constraints, Slikair webhook signature, untranslated i18n blocks, multi-brand isolation, reconciliation stubs, commission `sourceId` coverage); items fixed on 2026-10-03 (KYC withdrawal gate, Turnstile/admin IP allowlist, ledger double writes, deploy gaps, Slikair deposit risk check) are kept there as RESOLVED notes.

Related operator documents outside this directory: [`docs/RUNBOOK.md`](../RUNBOOK.md) (operations and incidents), [`docs/seo-settings.md`](../seo-settings.md) (SEO settings), [`docs/providers/`](../providers/) (technical documentation of the Sports Betting, In-house Games, Casino Content, crypto and KYC integrations).

## Status note (honesty)

This documentation reflects the **actual** code in the repository — it does not present unfinished work (e.g., Live Casino, one-click module purchase) as if it exists. Last full audit against the code: 2026-10-03; updated the same day after the PR #132 code fixes. Premium add-on behavior was read from the add-on source in the main checkout; if a statement here and the running system disagree, the code wins and the document should be corrected.