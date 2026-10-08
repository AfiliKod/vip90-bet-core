# SEO Settings

Admin: **Settings → SEO** (`/admin/platform?tab=seo`). The values live as a
single record (`seo.config`, JSON) in the `Setting` collection.

## Where things are

| Piece | File |
|---|---|
| Field definitions, regexes, zod schema | `server/src/seo/schema.js` |
| Store (30 s cache, invalidated on save) | `server/src/seo/store.js` |
| Tag generation + injection, CSP extras, robots/sitemap text | `server/src/seo/render.js` |
| HTTP: `/robots.txt`, `/sitemap.xml`, `GET /api/seo`, SPA fallback, dynamic CSP | `server/src/seo/http.js` |
| Route matcher (pure, shared by server + tests) | `shared/route-matcher.js` |
| Route manifest generation (`App.jsx` → `dist/routes.json`) + check | `client/scripts/emit-route-manifest.mjs`, `check-route-manifest.mjs` |
| Admin endpoints `GET/PUT /api/admin/settings/seo` (`admin:settings:read/write`) | `server/src/routes/seoAdmin.js` |
| Tab UI | `client/src/pages/admin/SeoSettings.jsx` |
| Single owner of `document.title` (template + page name) | `client/src/seo/SeoManager.jsx`, `titles.js` |

## Behavior

- If **no** settings record exists at all, `index.html` is served verbatim (the
  previous behavior).
- If it exists, `index.html` is held in memory and `<title>`,
  description/keywords/robots, canonical (derived from the requested path), OG,
  Twitter, verification metas and GA4/GTM/Pixel snippets are injected into
  `<head>` (noscripts go at the top of `<body>`). Special paths such as
  login/admin/profile get `noindex` and no canonical.
- There is no free-form HTML/script field. Only regex-validated identifiers
  enter the snippets (`G-XXXX`, `GTM-XXXX`, numeric Pixel); the render layer
  validates the identifier a second time.
- CSP (production only): the base list plus the domains of the entered
  identifiers only (`createSecurityHeaders`). CSP stays off in development.
- `robots.txt`: `Disallow: /` when `noindex`; otherwise admin/api paths are
  blocked plus a `Sitemap:` line. `sitemap.xml`: `/`, the `/bahis`, `/canli`,
  `/casino` routes of enabled modules and active static pages; `404` while
  `noindex` is set. Base URL: the canonical setting, otherwise the (format
  validated) host of the request.

## Real 404 (SPA)

A page that does not exist must **not** answer `200` with the home page. The
route table is derived **at build time** from `App.jsx`, the single source of
truth: `npm run build --prefix client` → after `vite build`,
`client/scripts/emit-route-manifest.mjs` writes `client/dist/routes.json`
(`{ generatedAt, count, patterns }`). The server reads that file once and
matches `req.path` against it (`shared/route-matcher.js`):

| Request | Response |
|---|---|
| A route in the table | `200` + `index.html` (SEO injection as before) |
| A path not in the table | `404` + `X-Robots-Tag: noindex` + `Cache-Control: no-cache` + `index.html`; canonical/SEO tags are **not injected**, the SPA renders its own 404 page (`client/src/pages/NotFound.jsx`) |
| `routes.json` missing/broken | **fail-open**: every path `200` (previous behavior), one `console.warn` on the first request |
| `ROUTE_404_REPORT_ONLY=1` | No 404; only the `[route-404] (rapor modu) manifest dışı: …` log, response `200` |

Rules and limits:

- The table is **never maintained by hand**; adding a page means adding a
  `<Route>` to `App.jsx`. That is why CI does not break on a "is the manifest in
  sync?" check — the sync check (`npm run routes:check --prefix client`) is
  **warning** level only and never fails. Correctness is guaranteed by the
  parser's unit tests; if the parser cannot produce routes the **build fails**
  (there is never a silently empty table).
- No wildcard is used for `/admin/*`; the full list of 40+ child routes is
  written out, so `/admin/yok-boyle` really returns 404. Admin routes that
  redirect with `<Navigate>` (`/admin/casino`, `/admin/bank`, …) are working
  URLs and are therefore **kept**.
- `express.static` runs before the fallback: `/assets/*`, `/uploads/kyc/*`
  (existing files) and `/api/*`, `/robots.txt`, `/sitemap.xml` are unaffected.
  `routes.json` is the server's own data and is not served (`/routes.json` →
  `404`).
- Two-phase deployment: first review the logs with `ROUTE_404_REPORT_ONLY=1`,
  then remove the variable (see `docs/RUNBOOK.md`).

## Tests

```
cd server
NODE_ENV=test node --test test/seoInject.test.js
NODE_ENV=test node --test test/seoRobotsSitemap.test.js
NODE_ENV=test node --test test/seoCsp.test.js
NODE_ENV=test node --test test/seoAdmin.test.js
cd .. && node --test shared/route-matcher.test.js client/scripts/__tests__/parse-routes.test.mjs
cd client && npx vite build && node --test src/i18n/*.test.js src/seo/*.test.js
```

The "rota tablosu ile gerçek 404" section of `seoInject.test.js` builds the
table from the **real** `client/src/App.jsx`: the test breaks if the parser
produces an incomplete table or if the server breaks the matching.

Manual: in production mode (`NODE_ENV=production`, `client/dist` ready),
`curl -s http://localhost:PORT/casino | head -40`, `curl /robots.txt`,
`curl /sitemap.xml`; after saving a setting the tags appear within at most 30 s
(immediately, on save). For the 404 side: `curl -i localhost:PORT/bahis` → `200`,
`curl -i localhost:PORT/olmayansayfa` → `404` + `X-Robots-Tag: noindex`,
`curl -i localhost:PORT/admin/yok-boyle` → `404`.