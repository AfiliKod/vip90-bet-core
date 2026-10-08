# Client

Oyuncu sitesi ve admin paneli: React 19 + Vite 8 + Tailwind + Zustand, PWA
(`vite-plugin-pwa`) ve iOS Capacitor kabuğu. Metinler
`src/i18n/dictionaries/` altındaki 8 dil sözlüğünden gelir.

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Vite dev sunucusu (5173); `/api` ve `/socket.io` istekleri `localhost:3001`'deki API sunucusuna aktarılır |
| `npm run build` | Üretim derlemesi `dist/`'e; ardından rota tablosu `dist/routes.json` üretilir (sunucu olmayan sayfalara gerçek 404 verir) |
| `npm run routes:check` | `App.jsx` ile `dist/routes.json`'u karşılaştırır — **yalnız uyarır**, asla başarısız olmaz (CI gate'i değildir) |
| `npm run lint` | ESLint |
| `npm run preview` | Derlenmiş `dist/`'i yerelde sunar |
| `npm run cap:sync` / `cap:sync:dev` | iOS kabuğunu günceller (aşağıya bakın) |

Rota tablosu elle tutulmaz: `build`, `src/App.jsx` içindeki `<Route>`
tanımlarını tarayıp `dist/routes.json` üretir. Yeni bir sayfa eklemek için
`<Route>` eklemek yeterlidir; tablo elle güncellenmez. Ayrıntı:
[`../docs/seo-settings.md`](../docs/seo-settings.md) — "Gerçek 404 (SPA)".

Kökten `npm run dev` client'ı API sunucusuyla birlikte başlatır; testler kökteki
`npm test` ile çalışır.

## Capacitor (iOS)

`capacitor.config.json` üretim yapılandırmasıdır: `server.url` yoktur, uygulama
paketlenmiş `dist/` içeriğini kullanır (`npm run cap:sync` = build + `cap sync`).
Geliştirmede cihazı Vite dev sunucusuna bağlamak için:

```bash
CAP_SERVER_URL=http://<makine-LAN-IP>:5173 npm run cap:sync:dev -- ios
```

Betik yapılandırmayı geçici olarak dev URL'siyle yazar, `cap sync` çalıştırır ve
dosyayı eski haline döndürür (Capacitor JSON yapılandırmasında env desteklemez).
`localhost` cihazdan bu makineyi göstermez; LAN IP kullanın.
