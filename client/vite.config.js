import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { appNavigateAllowlist } from './scripts/pwa-route-allowlist.mjs'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      // Manifest build sırasında ÜRETİLMEZ. `/manifest.webmanifest` sunucudan
      // gelir (İP-8, server/src/routes/manifest.js): tek modda kurulumun
      // ayarlarındaki site adı/marka rengi, çok modda istek host'una çözülen
      // operatörün markası. Build'de üretilen sabit manifest hem çekirdeğe ürün
      // adı taşıyordu hem de service worker onu precache'leyip kiracıya özel
      // yanıtı gölgeliyordu. index.html'deki <link rel="manifest"> bağlantısı
      // bu rotayı gösterir; manifest precache listesine GİRMEZ (pwa-build-check).
      manifest: false,
      workbox: {
        // 2026-10-02: skipWaiting/clientsClaim YOKTU. Bu yüzden yeni service
        // worker indirilip "waiting"de kalıyor ve eski bundle'ı servis etmeye
        // devam ediyordu. Sunucu tarafındaki no-cache başlığı sw.js'in
        // ÇEKİLMEŞİNİ düzeltir, AKTİVASYONUNU düzeltmez — kullanıcı yeni
        // build'e geçemeden eski kodda kalıyordu (belgelenen olay:
        // dashboard eski ucu çağırıp 404 alıyordu).
        // Bu iki ayar yeni SW'nin beklemeden devreye girmesini ve açık
        // sekmeleri hemen devralmasını sağlar.
        skipWaiting: true,
        clientsClaim: true,
        // material-symbols-outlined.woff2 (~4MB, tüm ikon setini kapsıyor)
        // service-worker precache'ine dahil edilmiyor — normal HTTP cache
        // (uzun max-age) yeterli, precache manifest'i şişirmesin.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // public/images (oyun kapakları, banner'lar, ~25 MB) da precache'e
        // girmez: kurulumda her ziyaretçiye hepsini indirtiyordu. Görseller
        // uzun max-age'li normal HTTP cache'ten gelir.
        globIgnores: ['fonts/material-symbols-outlined.woff2', 'images/**'],
        // Service worker YALNIZCA gerçek uygulama rotalarını index.html'e
        // düşürür. Allowlist `App.jsx`'ten build sırasında türetilir
        // (`scripts/pwa-route-allowlist.mjs`); bilinmeyen yollar, `/api/*`,
        // `/install`, `/uploads/*`, `robots.txt`, `sitemap.xml` ve statik
        // dosyalar AĞA gider ve sunucunun yanıtı geçerli olur — yani SPA'nın
        // gerçek 404'ü (server/src/seo/http.js + dist/routes.json) SW kurulu
        // tarayıcıda da 404 kalır. Daha önce yalnız sunucu yollarını reddeden
        // `navigateFallbackDenylist` vardı; o, bilinmeyen uygulama yollarını
        // 200'e çeviriyordu (2026-10-08).
        navigateFallbackAllowlist: appNavigateAllowlist(),
        // Fontlar artık self-hosted (bkz. client/public/fonts/) — Google Fonts'a
        // özel runtime-cache kuralları kaldırıldı, gerek kalmadı.
        runtimeCaching: [
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      // Dev'de service worker KAPALI (vite-plugin-pwa'nın varsayılanı da bu) —
      // önceden burada enabled:true idi ve Crash socket'inin (uzun-polling +
      // WS yükseltme el sıkışması) SW'nin fetch interception katmanından geçen
      // istekleriyle arada bir aralıklı, hatasız-sessiz bir şekilde çakışıp
      // bağlantının hiç kurulamadan (ne 'connect' ne 'connect_error') askıda
      // kalmasına yol açtığı gözlemlendi (bkz. Crash.jsx bağlantı bekçisi
      // yorumu). Production build'de PWA/SW tamamen etkin kalmaya devam ediyor —
      // yalnızca dev sunucusunda kapatıldı.
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true, rewriteWsOrigin: true },
      '/gs2c': {
        target: 'https://demogamesfree.pragmaticplay.net',
        changeOrigin: true,
        secure: true,
      }
    }
  }
})
