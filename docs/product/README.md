# VIP90.bet Core Documentation

This directory is written for operators who have purchased/deployed the
core platform — not for developers who already know the codebase (that
context is in code comments). It documents the **core** only; each
commercial module (Betting, In-house Games, Palace Casino) ships its own
documentation inside its own package.

- [01 — Installation](01-kurulum.md) — from scratch to a working setup.
- [02 — Configuration](02-yapilandirma.md) — `.env` variables and panel-managed settings.
- [03 — Module System](03-modul-sistemi.md) — the difference between the core platform and separately sold modules.
- [05 — API Reference](05-api-referansi.md) — endpoint summary.
- [06 — Frequently Asked Questions](06-sss.md)
- [07 — Video Library Storyboards](07-video-storyboardlari.md) — the foundation for actual video recording, no videos have been produced yet.
- [09 — Known Limitations](09-bilinen-kisitlar.md) — defined but not end-to-end connected features (KYC flow, agent system, multi-tier affiliate, VIP cashback).

## Status note (honesty)

This documentation reflects the **actual** code in the repository — it does not present unfinished work (e.g., Docker installation, one-click module purchase) as if it exists. These documents will be updated in a future release; until then, what is written here is the system you can set up and run today.