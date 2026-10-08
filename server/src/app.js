import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { expandOrigins, canonicalHostRedirect } from './utils/origins.js';
import { getOnlineCount } from './services/onlineCount.js';
import { errorHandler, notFound } from './middleware/error.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { createAdminIpAllowlist } from './middleware/adminIpAllowlist.js';
import authRoutes from './routes/auth.js';
import web3AuthRoutes from './routes/web3Auth.js';
import socialAuthRoutes from './routes/socialAuth.js';
import eventsRoutes from './routes/events.js';
import betsRoutes from './routes/bets.js';
import usersRoutes from './routes/users.js';
import transactionsRoutes from './routes/transactions.js';
import promotionsRoutes from './routes/promotions.js';
import adminRoutes from './routes/admin.js';
import casinoRoutes from './routes/casino.js';
import helpRoutes from './routes/help.js';
import inhouseRoutes from './routes/inhouse.js';
import cryptoRoutes from './routes/crypto.js';
import kycRoutes from './routes/kyc.js';
import sumsubWebhookRoute from './routes/sumsubWebhook.js';
import bankRoutes from './routes/bank.js';
import analyticsRoutes from './routes/analytics.js';
import admin2faRoutes from './routes/admin2fa.js';
import themeRoutes from './routes/theme.js';
import modulesRoutes from './routes/modules.js';
import { createModuleGate } from './middleware/moduleGate.js';
import { isModuleUsable } from './services/licensing/index.js';
import currencyRoutes from './routes/currency.js';
import vipRoutes from './routes/vip.js';
import localeConfigRoutes from './routes/localeConfig.js';
import demoRoutes from './demo/showcase.js';
import ticketRoutes from './routes/ticket.js';
import chatRoutes from './routes/chat.js';
import installRoutes from './routes/install.js';
import brandingRoutes from './routes/branding.js';
import pagesRoutes from './routes/pages.js';
import slikairRoutes from './routes/slikair.js';
import staticPagesRoutes from './routes/staticPages.js';
import gamesRoutes from './routes/games.js';
import adminModuleSettingsRoutes from './routes/adminModuleSettings.js';
import responsibleGamingRoutes, { adminRouter as responsibleGamingAdminRoutes } from './routes/responsibleGaming.js';
import riskRoutes from './routes/risk.js';
import healthRoutes from './routes/health.js';
import { createSeoPublicRouter, createSpaFallback, createSecurityHeaders } from './seo/http.js';
import { getSiteName } from './branding/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// Igames Casino entegrasyonu ayrı (ücretli) bir pakettir, bu kurulumda hiç
// bulunmayabilir — bu yüzden statik değil, opsiyonel dinamik import ile
// yükleniyor. Paket yoksa /api/igames altında anlamlı bir 503 döner.
let igamesRoutes = null;
try {
  ({ default: igamesRoutes } = await import('./premium/igames/igames.js'));
} catch {
  // Igames entegrasyonu bu kurulumda mevcut değil.
}

// In-house oyun provider'ı (server/src/provider/) da ayrı (ücretli) bir
// pakettir — aynı opsiyonel yükleme deseni. providerRoutes: PROVIDER'ın
// (game-host) operatöre konuştuğu uç. inhouseProviderProxyRoutes: bu
// sitenin provider'a konuşan client'ı. getAllOperatorOrigins: provider'ın
// Operator modeline dayalı CORS origin listesi (paket yoksa boş Set'e düşer).
let providerRoutes = null;
let inhouseProviderProxyRoutes = null;
let getAllOperatorOrigins = async () => new Set();
try {
  ({ default: providerRoutes } = await import('./premium/inhouse-provider/engine/routes/index.js'));
  ({ default: inhouseProviderProxyRoutes } = await import('./premium/inhouse-provider/inhouseProviderProxy.js'));
  ({ getAllOperatorOrigins } = await import('./premium/inhouse-provider/engine/services/operatorOriginCache.js'));

  // Modül yüklendi ama zorunlu env değişkenleri eksikse oyunlar sessizce
  // bozuk kalabilir (bkz. PROVIDER_SESSION_SECRET eksikliğinin 20 gün fark
  // edilmeden production'da oturum değişimini 500'letmesi) — süreci
  // durdurmadan yüksek sesle uyar.
  for (const name of ['GAME_HOST_URL', 'GAME_HOST_SECRET', 'PROVIDER_SESSION_SECRET']) {
    if (!process.env[name]) {
      console.error(`[config] Eksik ortam değişkeni: ${name} (in-house oyun provider'ı bozuk çalışabilir)`);
    }
  }
} catch {
  // In-house oyun provider'ı bu kurulumda mevcut değil.
}

const baseOrigins = expandOrigins(
  (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',').map(s => s.trim()).filter(Boolean),
);

// game-host: in-house oyunların ayrı barındırılan uygulaması (provider
// formatı — bkz. GAME_HOST_URL). Ana site ile farklı origin'de servis
// edildiği için hem REST hem Socket.IO CORS listesine eklenmesi gerekiyor.
if (process.env.GAME_HOST_URL) {
  baseOrigins.push(...process.env.GAME_HOST_URL.split(',').map(s => s.trim()).filter(Boolean));
}

// Railway injects RAILWAY_PUBLIC_DOMAIN automatically — add it so <script crossorigin>
// same-origin requests pass CORS when CLIENT_URL isn't explicitly configured.
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  baseOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

export const corsOptions = {
  // async: DB-tabanlı operatör-origin listesi (provider/services/
  // operatorOriginCache.js, 30sn TTL) statik baseOrigins'e ek olarak
  // kontrol edilir — operatörler aynı statik game-host bundle'ını kendi
  // white-label domain'lerinde barındırabilir, bu yüzden origin listesi
  // artık salt .env değil, DB'den (Operator.allowedOrigins) geliyor.
  origin: async (origin, cb) => {
    if (!origin) return cb(null, false);
    if (baseOrigins.includes('*') || baseOrigins.includes(origin)) return cb(null, true);
    // Development only: ngrok tunnel desteği (Phase B10 — production'da kapalı)
    if (!isProd && (origin.endsWith('.ngrok-free.dev') || origin === 'https://ngrok-free.dev')) {
      return cb(null, true);
    }
    try {
      const operatorOrigins = await getAllOperatorOrigins();
      if (operatorOrigins.has(origin)) return cb(null, true);
    } catch { /* DB erişilemezse statik allowlist'e düş — aşağıda reddedilir */ }
    cb(new Error('CORS: ' + origin));
  },
  credentials: true,
};

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Railway / Render reverse proxy arkasında req.protocol doğru olsun
  app.set('etag', 'strong'); // Phase E12

  // Kanonik host + HTTPS redirect (Phase B5)
  if (isProd) {
    app.use((req, res, next) => {
      const canonicalHost = canonicalHostRedirect(req.headers.host);
      if (canonicalHost) {
        return res.redirect(301, `https://${canonicalHost}${req.url}`);
      }
      if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
  }

  // Helmet + CSP (Phase B2) — CSP, SEO ayarındaki analytics kimliklerine göre
  // dinamiktir (seo/http.js); dev'de kapalı (HMR için).
  app.use(createSecurityHeaders({ isProd }));

  app.use(cors(corsOptions));
  app.use(compression({ level: 6, threshold: 1024 })); // Phase E2
  // A3 — logo/favicon/font dosyaları data: URL olarak JSON gövdede taşınır,
  // global 10kb sınırına sığmaz. Yalnızca bu yol için önce (daha büyük
  // limitli) bir parser çalıştırılır; body-parser zaten parse edilmiş
  // gövdeyi tekrar okumadığı için aşağıdaki global express.json bu istekler
  // için no-op olur — global limit diğer tüm uçlarda 10kb olarak kalır.
  app.use('/api/admin/branding', express.json({ limit: '1mb' }));
  // Slider Düzenleme Aracı: banner/hero slaytlarının görselleri (birden
  // fazla, her biri maks 500kb data: URL) branding'in tek dosyasından daha
  // büyük bir JSON gövdesi taşıyabilir — aynı öncelikli-parser deseni.
  app.use('/api/admin/pages', express.json({ limit: '6mb' }));
  // Wallet-callback alıcısı: HMAC doğrulaması imzalanan TAM ham gövdeyi
  // gerektiriyor (bkz. provider/services/hmacSign.js) — req.body'yi tekrar
  // JSON.stringify etmek anahtar sırası farkıyla imzayı sessizce bozabilir.
  app.use('/api/inhouse-provider/callback', express.json({
    verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); },
  }));
  app.use(express.json({ limit: '10kb' })); // Phase B3
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(mongoSanitize()); // Phase B12
  app.use(cookieParser());

  // Global rate limit (Phase B1)
  app.use('/api', globalLimiter);

  // KYC belgeleri — statik dosya sunumu (yalnızca kendi belgelerine erişim)
  app.use('/uploads/kyc', express.static(join(__dirname, '../uploads/kyc'), { maxAge: '1d', index: false }));

  // Production: static assets'i API routes'lardan ÖNCE serve et
  // Böylece /assets/*.js ve /assets/*.css istekleri doğru MIME type ile döner
  if (isProd) {
    const clientDist = join(__dirname, '../../client/dist');
    if (existsSync(clientDist)) {
      // Rota tablosu sunucunun KENDİ içindir (SPA 404 kararı); dışarı servis
      // edilmez — aksi hâlde 1 yıllık immutable cache'li statik dosya olarak
      // herkese açık hâle gelirdi.
      app.get('/routes.json', (req, res) => res.status(404).type('text/plain').send('Not found'));
      app.use(express.static(clientDist, {
        // Vite build çıktısı content-hash içerdiğinden uzun cache güvenlidir
        maxAge: '1y',
        immutable: true,
        // index.html'i static olarak servis etme; SPA fallback bunu halleder
        index: false,
        // sw.js/registerSW.js/workbox-*.js/manifest.webmanifest içerik-hash
        // TAŞIMAZ (her deploy'da aynı URL, farklı içerik) — üstteki 1 yıllık
        // immutable cache PWA'nın kendi güncelleme mekanizmasını (registerType:
        // 'autoUpdate') kırar: tarayıcı asla yeni sw.js'i görmediği için yeni
        // build'ler prod'a çıksa bile eski precache'ten servis etmeye devam
        // eder (2026-09-17'de gözlemlendi: sw.js Cloudflare'de "HIT", 10+ gün
        // önceki build'e ait, sert yenileme/sekme kapatma bile çözmedi).
        setHeaders: (res, filePath) => {
          if (/[/\\](sw\.js|registerSW\.js|workbox-[^/\\]+\.js|manifest\.webmanifest)$/.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }));
    }
  }

  // Kurulum sihirbazı (K2) — ilk açılışta terminal gerektirmeden kurulabilsin
  app.use('/install', installRoutes);

  // ADMIN_ALLOWED_IPS tanımlıysa /api/admin/* yalnız o IP/CIDR'lerden (varsayılan kapalı)
  app.use('/api/admin', createAdminIpAllowlist());
  app.use('/api/auth', authRoutes);
  app.use('/api/auth/wallet', web3AuthRoutes);
  app.use('/api/auth', socialAuthRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/promotions', promotionsRoutes);
  app.use('/api/admin', adminRoutes);
  if (igamesRoutes) {
    app.use('/api/igames', igamesRoutes);
  } else {
    app.use('/api/igames', (req, res) => res.status(503).json({ error: 'MODULE_NOT_INSTALLED', message: 'Igames Casino entegrasyonu bu kurulumda mevcut değil.' }));
  }
  app.use('/api/inhouse', inhouseRoutes);
  // Çok-kiracılı in-house game provider (bkz. server/src/provider/) — merkezi
  // oyun sunucusunun operatör-tarafı API'si. /api/provider/v1: PROVIDER'ın
  // (game-host) bu operatöre konuştuğu uç, kendi launch/session JWT'siyle
  // korunuyor, module gate'ten BAĞIMSIZ (aksi halde oyun içi callback'ler
  // modül kapatılınca kırılırdı). /api/inhouse-provider: bu sitenin (Operatör
  // #1) provider'a konuşan client'ı — 'inhouse-games' modül gate'i altta
  // tanımlanıp aşağıda uygulanıyor (bkz. "M4" bloğu). Paket mevcut değilse
  // (opsiyonel dinamik import yukarıda) anlamlı bir 503 döner.
  if (providerRoutes) {
    app.use('/api/provider/v1', providerRoutes);
  } else {
    app.use('/api/provider/v1', (req, res) => res.status(503).json({ error: 'MODULE_NOT_INSTALLED', message: 'In-house oyun provider\'ı bu kurulumda mevcut değil.' }));
  }
  app.use('/api/help', helpRoutes);
  app.use('/api/bank', bankRoutes);
  app.use('/api/slikair', slikairRoutes);
  app.use('/api/admin/analytics', analyticsRoutes);
  app.use('/api/admin', adminModuleSettingsRoutes);
  app.use('/api/auth/2fa', admin2faRoutes);
  app.use('/api/theme', themeRoutes);
  app.use('/api/branding', brandingRoutes);
  // SEO: /robots.txt, /sitemap.xml (SPA fallback'ten ÖNCE) ve /api/seo (herkese açık)
  app.use(createSeoPublicRouter());
  app.use('/api/pages', pagesRoutes);
  app.use('/api/static-pages', staticPagesRoutes);
  app.use('/api/games', gamesRoutes);
  app.use('/api/currency', currencyRoutes);
  app.use('/api/vip', vipRoutes);

  // U5 — operatör saat dilimi (herkese açık; istemci render'da uygular)
  app.use('/api/locale-config', localeConfigRoutes);

  // V1 — demo vitrini: "modül gerektirir" rozetinin veri katmanı (herkese açık)
  app.use('/api/demo', demoRoutes);

  // M4 — modül kapalıyken zarif bozulma: ilgili bölümler 404 yerine anlamlı
  // 503 (MODULE_DISABLED) döner; site geri kalanında hatasız çalışır.
  const requireBetting = createModuleGate({ isUsable: isModuleUsable, moduleId: 'betting' });
  const requireCasinoContent = createModuleGate({ isUsable: isModuleUsable, moduleId: 'casino-content' });
  const requireInhouseGames = createModuleGate({ isUsable: isModuleUsable, moduleId: 'inhouse-games' });
  const requireCryptoPayment = createModuleGate({ isUsable: isModuleUsable, moduleId: 'crypto-payment' });
  const requireKycVerification = createModuleGate({ isUsable: isModuleUsable, moduleId: 'kyc-verification' });
  app.use('/api/modules', modulesRoutes); // herkese açık — istemci menü/yönlendirme
  app.use('/api/events', requireBetting, eventsRoutes);
  app.use('/api/bets', requireBetting, betsRoutes);
  app.use('/api/casino', requireCasinoContent, casinoRoutes);
  if (inhouseProviderProxyRoutes) {
    app.use('/api/inhouse-provider', requireInhouseGames, inhouseProviderProxyRoutes);
  } else {
    app.use('/api/inhouse-provider', (req, res) => res.status(503).json({ error: 'MODULE_NOT_INSTALLED', message: 'In-house oyun provider\'ı bu kurulumda mevcut değil.' }));
  }
  app.use('/api/crypto', requireCryptoPayment, cryptoRoutes);
  app.use('/api/kyc', requireKycVerification, kycRoutes);
  app.use('/api', sumsubWebhookRoute); // Sumsub webhook — module gate'den bağımsız
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/responsible-gaming', responsibleGamingRoutes);
  app.use('/api/admin/responsible-gaming', responsibleGamingAdminRoutes);
  app.use('/api/admin/risk', riskRoutes);
  // 2026-10-02: routes/health.js HİÇ MOUNT EDİLMEMİŞTİ — Health.jsx'in
  // çağırdığı /admin/health, /admin/health/system, /admin/health/services ve
  // /admin/health/metrics rotaları hiç var olmadığı için admin Health sayfası
  // tamamen 404 veriyordu. Mount yolu client'ın zaten beklediği yol.
  app.use('/api/admin/health', healthRoutes);

  // Health check — Render uptime monitoring için
  // version: çalışan sürüm (server/package.json; scripts/release.mjs üçünü
  // aynı numaraya çeker) — "canlıda hangi sürüm var" sorusunun cevabı.
  const APP_VERSION = (() => {
    try { return JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')).version || null; }
    catch { return null; }
  })();
  app.get('/api/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV, version: APP_VERSION }));

  // Derin health/status — Status Page için (public, cache-friendly).
  // onlineCount: tek seferlik/guest kullanım için — bağlı client'lar artık
  // bunu polling ETMİYOR, canlı güncellemeler socket üzerinden 'online:count'
  // event'iyle geliyor (bkz. services/onlineCount.js, socket/handler.js).
  app.get('/api/health/status', async (req, res) => {
    const result = { api: 'up', db: 'unknown', igames: 'unknown', oddsSource: 'unknown', payment: 'up', onlineCount: getOnlineCount() };
    try {
      const mongoose = (await import('mongoose')).default;
      result.db = mongoose.connection.readyState === 1 ? 'up' : 'down';
    } catch { result.db = 'down'; }
    try {
      const { getActiveCasinoAggregator } = await import('./services/casinoAggregators/index.js');
      const start = Date.now();
      const agg = await getActiveCasinoAggregator();
      const ok = await Promise.race([
        agg.healthCheck(),
        new Promise(resolve => setTimeout(() => resolve(false), 3000)),
      ]);
      if (!ok) result.igames = 'down';
      else if (Date.now() - start > 2000) result.igames = 'degraded';
      else result.igames = 'up';
    } catch { result.igames = 'unavailable'; }
    // Kaynak sağlığı: eskiden sabit kodlanmış bir mirror'a HEAD atılıyordu. O
    // domain artık ölü ve zaten sync'in gerçek durumuyla hiçbir bağı yoktu —
    // endpoint "up" derken senkronizasyon 25 saattir kopuk olabiliyordu.
    // Artık gerçek sync sağlığı raporlanıyor.
    try {
      const { snapshot } = await import('./services/syncHealth.js');
      result.sync = snapshot();
      result.oddsSource = result.sync.live?.state === 'stale' ? 'down' : 'up';
    } catch {
      result.oddsSource = 'unknown';
    }
    res.set('Cache-Control', 'no-store');
    res.json(result);
  });

  // Risk observability — non-sensitive risk stats for ops monitoring
  app.get('/api/health/risk', async (req, res) => {
    try {
      const { getRiskStats } = await import('./services/riskEngine.js');
      const stats = await getRiskStats();
      res.set('Cache-Control', 'no-store');
      res.json(stats);
    } catch {
      res.json({ statusStats: [], levelStats: [], evaluationStats: [] });
    }
  });

  // Görsel proxy — hotlink korumalı CDN'lerden Origin header olmadan çeker
  // SECURITY FIX (H2): SSRF protection — block internal IPs and cloud metadata
  app.get('/api/img', (req, res) => {
    const raw = req.query.url;
    if (!raw) return res.status(400).end();
    let url;
    try { url = new URL(decodeURIComponent(raw)); } catch { return res.status(400).end(); }
    if (!['http:', 'https:'].includes(url.protocol)) return res.status(400).end();

    // Block internal/private IPs to prevent SSRF
    const hostname = url.hostname;
    const blockedPatterns = [
      /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./,
      /^0\./, /^localhost$/i, /^::1$/, /^\[::1\]$/,
      /^169\.254\./, // cloud metadata
      /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // carrier-grade NAT
    ];
    if (blockedPatterns.some(p => p.test(hostname))) {
      return res.status(403).json({ error: 'Internal URLs not allowed' });
    }

    const mod = url.protocol === 'https:' ? https : http;
    const proxyReq = mod.request(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept': 'image/*,*/*' } },
      (proxyRes) => {
        const ct = proxyRes.headers['content-type'] || 'image/jpeg';
        if (!ct.startsWith('image/')) return res.status(502).end();
        res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', () => res.status(502).end());
    proxyReq.setTimeout(8000, () => { proxyReq.destroy(); res.status(504).end(); });
    proxyReq.end();
  });

  // API 404 — tanımsız /api/* route'ları için
  app.use('/api', notFound);

  // SPA fallback — non-API isteklerini index.html'e yönlendir. Rota tablosu
  // (client/dist/routes.json) varsa tabloda olmayan yol gerçek 404 + noindex
  // alır; tablo yoksa fail-open (tüm yollar 200, eski davranış).
  if (isProd) {
    const clientDist = join(__dirname, '../../client/dist');
    if (existsSync(clientDist)) {
      app.get('*', createSpaFallback({
        indexPath: join(clientDist, 'index.html'),
        routesPath: join(clientDist, 'routes.json'),
        getSiteName,
      }));
    }
  }

  app.use(errorHandler);
  return app;
}
