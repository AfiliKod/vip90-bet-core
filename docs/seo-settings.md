# SEO ayarları

Admin: **Settings → SEO** (`/admin/platform?tab=seo`). Değerler `Setting`
koleksiyonunda tek kayıt (`seo.config`, JSON) olarak durur.

## Nerede ne var

| Parça | Dosya |
|---|---|
| Alan tanımı, regex'ler, zod şeması | `server/src/seo/schema.js` |
| Depo (30 sn cache, kayıtta geçersiz kılma) | `server/src/seo/store.js` |
| Etiket üretimi + enjeksiyon, CSP ekleri, robots/sitemap metni | `server/src/seo/render.js` |
| HTTP: `/robots.txt`, `/sitemap.xml`, `GET /api/seo`, SPA fallback, dinamik CSP | `server/src/seo/http.js` |
| Rota eşleştirici (saf, sunucu + testler ortak) | `shared/route-matcher.js` |
| Rota tablosu üretimi (`App.jsx` → `dist/routes.json`) + denetimi | `client/scripts/emit-route-manifest.mjs`, `check-route-manifest.mjs` |
| Admin uçları `GET/PUT /api/admin/settings/seo` (`admin:settings:read/write`) | `server/src/routes/seoAdmin.js` |
| Sekme arayüzü | `client/src/pages/admin/SeoSettings.jsx` |
| `document.title` tek sahibi (şablon + sayfa adı) | `client/src/seo/SeoManager.jsx`, `titles.js` |

## Davranış

- Ayar kaydı **hiç yoksa** index.html aynen servis edilir (eski davranış).
- Varsa `index.html` bellekte tutulur; `<title>`, description/keywords/robots,
  canonical (istek yoluna göre), OG, Twitter, doğrulama meta'ları ve
  GA4/GTM/Pixel snippet'leri `<head>`'e (noscript'ler `<body>` başına) eklenir.
  Giriş/admin/profil gibi özel yollar `noindex` alır ve canonical üretmez.
- Serbest HTML/script alanı yoktur. Script'e yalnız regex'le doğrulanmış kimlik
  girer (`G-XXXX`, `GTM-XXXX`, rakamlı Pixel); render katmanı kimliği tekrar doğrular.
- CSP (yalnız prod): temel liste + sadece girilen kimliğin alan adları
  (`createSecurityHeaders`). Dev'de CSP kapalı kalır.
- `robots.txt`: `noindex` iken `Disallow: /`; değilse admin/api yolları kapalı +
  `Sitemap:`. `sitemap.xml`: `/`, açık modüllerin `/bahis` `/canli` `/casino`
  rotaları ve etkin statik sayfalar; `noindex` iken 404. Taban URL: canonical
  ayarı, yoksa isteğin (biçimi doğrulanmış) host'u.

## Gerçek 404 (SPA)

Olmayan bir sayfa **200 + ana sayfa** dönmemeli. Rota tablosu TEK doğruluk
kaynağı olan `App.jsx`'ten **build sırasında** türetilir:
`npm run build --prefix client` → `vite build` sonrası
`client/scripts/emit-route-manifest.mjs` `client/dist/routes.json` üretir
(`{ generatedAt, count, patterns }`). Sunucu bu dosyayı bir kez okuyup
`req.path`'i eşleştirir (`shared/route-matcher.js`):

| İstek | Yanıt |
|---|---|
| Tablodaki bir rota | `200` + `index.html` (SEO enjeksiyonu eskisi gibi) |
| Tabloda olmayan yol | `404` + `X-Robots-Tag: noindex` + `Cache-Control: no-cache` + `index.html`; kanonik/SEO etiketi **enjekte edilmez**, SPA kendi 404 sayfasını çizer (`client/src/pages/NotFound.jsx`) |
| `routes.json` yoksa/bozuksa | **fail-open**: tüm yollar `200` (eski davranış), ilk istekte bir kez `console.warn` |
| `ROUTE_404_REPORT_ONLY=1` | 404 yerine yalnız `[route-404] (rapor modu) manifest dışı: …` logu, yanıt `200` |

Kurallar ve sınırlar:

- Tablo **elle tutulmaz**; yeni sayfa eklemek `App.jsx`'e `<Route>` eklemektir.
  Bu yüzden CI "manifest senkron mu" diye kırılmaz — senkron denetimi
  (`npm run routes:check --prefix client`) yalnız **uyarı** düzeyindedir ve
  asla başarısız değildir. Doğruluk parser'ın birim testleriyle garanti edilir;
  parser rota üretemezse **build fail eder** (sessizce boş tablo olmaz).
- `/admin/*` için joker kullanılmaz; 40+ çocuk rotanın tamamı tabloda yazılıdır,
  böylece `/admin/yok-boyle` gerçekten 404 verir. `<Navigate>` ile yönlenen
  admin rotaları (`/admin/casino`, `/admin/bank`, …) çalışan URL'ler oldukları
  için **tutulur**.
- `express.static` fallback'ten önce çalışır: `/assets/*`, `/uploads/kyc/*`
  (var olan dosyalar) ve `/api/*`, `/robots.txt`, `/sitemap.xml` etkilenmez.
  `routes.json` sunucunun kendi verisidir ve dışarı servis edilmez (`/routes.json`
  → `404`).
- İki aşamalı dağıtım: önce `ROUTE_404_REPORT_ONLY=1` ile loglar gözden geçirilir,
  sonra değişken kaldırılır (bkz. `docs/RUNBOOK.md`).

## Test

```
cd server
NODE_ENV=test node --test test/seoInject.test.js
NODE_ENV=test node --test test/seoRobotsSitemap.test.js
NODE_ENV=test node --test test/seoCsp.test.js
NODE_ENV=test node --test test/seoAdmin.test.js
cd .. && node --test shared/route-matcher.test.js client/scripts/__tests__/parse-routes.test.mjs
cd client && npx vite build && node --test src/i18n/*.test.js src/seo/*.test.js
```

`seoInject.test.js`'in "rota tablosu ile gerçek 404" bölümü tabloyu **gerçek**
`client/src/App.jsx`'ten üretir: parser eksik rota verirse veya sunucu
eşleştirmeyi bozarsa test kırılır.

Elle: prod modunda (`NODE_ENV=production`, `client/dist` hazır) `curl -s
http://localhost:PORT/casino | head -40`, `curl /robots.txt`, `curl /sitemap.xml`;
ayar kaydedikten sonra en geç 30 sn içinde (kayıtta anında) etiketler görünür.
404 tarafı: `curl -i localhost:PORT/bahis` → `200`, `curl -i
localhost:PORT/olmayansayfa` → `404` + `X-Robots-Tag: noindex`,
`curl -i localhost:PORT/admin/yok-boyle` → `404`.
