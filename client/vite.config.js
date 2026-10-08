import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'VIP90.bet',
        short_name: 'VIP90.bet',
        description: 'Spor bahis ve casino platformu',
        theme_color: '#7c3aed',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png'
          },
          {
            src: '/icons/icon-96x96.png',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: '/icons/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png'
          },
          {
            src: '/icons/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png'
          },
          {
            src: '/icons/icon-152x152.png',
            sizes: '152x152',
            type: 'image/png'
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
      },
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
        globIgnores: ['fonts/material-symbols-outlined.woff2'],
        // Sunucunun yanıtladığı yollara yapılan sayfa geçişleri SPA'ya
        // (index.html) düşmemeli: aksi halde "Google ile devam et"
        // (/api/auth/google) gibi bağlantılar sunucuya hiç gitmeden React'in
        // 404 sayfasını açıyordu (2026-10-08). Yalnız SW kurulu tarayıcıda
        // görülür; curl ve ilk ziyaret etkilenmez.
        navigateFallbackDenylist: [/^\/api\//, /^\/install(\/|$)/, /^\/uploads\//, /^\/robots\.txt$/, /^\/sitemap\.xml$/],
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
