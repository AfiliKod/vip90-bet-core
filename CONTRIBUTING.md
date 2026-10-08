# Contributing

Thanks for your interest in VIP90.bet.

## How this repository is maintained

This public repository is the AGPL-3.0 core of the platform. Development
happens in a private repository together with the paid add-ons, and the core
is synchronised here from there. Because of that:

- **Issues are welcome** for bugs, documentation problems and feature
  requests. Please search existing issues first and include your version
  (`GET /api/health` returns it), steps to reproduce and logs where relevant.
- **Pull requests are welcome** too. We do not merge them here directly;
  an accepted change is applied in the main repository, credited to you
  (`Co-authored-by`), and arrives here with the next synchronisation. We will
  close your PR with a link to the release that contains it.
- **Security issues** go through private reporting, not issues or PRs; see
  [`SECURITY.md`](SECURITY.md).

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

## License

By contributing you agree that your contribution is licensed under the
[GNU Affero General Public License v3.0](LICENSE), the license of this
repository.
