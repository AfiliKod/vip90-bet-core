# Contributing

Thanks for your interest in VIP90.bet.

## How this repository is maintained

This public repository is the AGPL-3.0 core of the platform and, since
2026-11-12, the place where the core is developed: changes are made here in
pull requests to `main` and merged here. The paid add-ons live in private
repositories and attach to the core through hooks; they are not needed to run
or test the core.

- **Issues are welcome** for bugs, documentation problems and feature
  requests. Please search existing issues first and include your version
  (`GET /api/health` returns it), steps to reproduce and logs where relevant.
- **Pull requests are welcome** and are reviewed and merged here.
- **Security issues** go through private reporting, not issues or PRs; see
  [`SECURITY.md`](SECURITY.md).
- **Numbering note.** Entries in `CHANGELOG.md` and documents written before
  2026-11-12 may mention a pull request (for example "internal PR #132") or a
  path from the former private development repository. Those numbers do not
  exist here; history before that date is short because the core was then
  synchronised from that repository, one commit per release line.

## Making a change

- Requirements: Node.js 22 or newer and MongoDB running as a replica set
  (see [Installation](docs/product/01-kurulum.md)).
- Run `npm test` before opening a PR; most server tests need a local MongoDB
  at `localhost:27017`.
- Keep changes focused: one fix or feature per PR, with a test when behaviour
  changes.
- If the change affects behaviour, configuration, an API or the database,
  describe it the way [`CHANGELOG.md`](CHANGELOG.md) entries are written (see
  [`docs/CHANGELOG_GUIDE.md`](docs/CHANGELOG_GUIDE.md)), including what an
  existing installation must do to upgrade.

## Your first PR

If this is your first contribution to this repository:

1. Pick an issue labelled `good first issue`, or open a small one first and
   say what you would change. Issue titles are in English; some bodies and
   code comments mix English and Turkish, and either language is fine in a PR.
2. Branch from `main`, install dependencies, and run the test suite before
   you change anything so you know the starting state. Note that
   `docker compose up` and the test overlay can currently interfere with each
   other — see issue #9, which is open; if your install behaves oddly, say so
   in the PR rather than assuming you did something wrong.
3. Open the PR with a short description of the behaviour change and, if it
   changes user-visible behaviour, a `CHANGELOG.md`-style note.
4. What happens next: we read every PR and reply — the working target is
   about three working days, but it is a target, not a guaranteed SLA.
   An accepted PR is merged here and ships with the next release.
5. If a PR is closed for another reason (out of scope, superseded, no
   response), the reason is stated in the closing comment. Ask before
   re-opening; a quick issue thread usually settles it.

## License

By contributing you agree that your contribution is licensed under the
[GNU Affero General Public License v3.0](LICENSE), the license of this
repository.
