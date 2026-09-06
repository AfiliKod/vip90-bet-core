import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { expandOrigins, canonicalHostRedirect } from './utils/origins.js';
import { getOnlineCount } from './services/onlineCount.js';
import { errorHandler, notFound } from './middleware/error.js';
import { globalLimiter } from './middleware/rateLimit.js';
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
import palaceRoutes from './routes/palace.js';
import helpRoutes from './routes/help.js';
import inhouseRoutes from './routes/inhouse.js';
import cryptoRoutes from './routes/crypto.js';
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
import staticPagesRoutes from './routes/staticPages.js';
import gamesRoutes from './routes/games.js';
import providerRoutes from './provider/routes/index.js';
import inhouseProviderProxyRoutes from './routes/inhouseProviderProxy.js';
import adminModuleSettingsRoutes from './routes/adminModuleSettings.js';
import { getAllOperatorOrigins } from './provider/services/operatorOriginCache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

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

  // Helmet + CSP (Phase B2)
  app.use(helmet({
    contentSecurityPolicy: isProd ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'wss:'],
        frameSrc: ["'self'", 'https://*'],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    } : false, // Dev: CSP kapalı (HMR için)
    crossOriginEmbedderPolicy: false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: false,
  }));

  app.use(cors(corsOptions));
  app.use(compression({ level: 6, threshold: 1024 })); // Phase E2
  // A3 — logo/favicon/font dosyaları data: URL olarak JSON gövdede taşınır,
  // global 10kb sınırına sığmaz. Yalnızca bu yol için önce (daha büyük
  // limitli) bir parser çalıştırılır; body-parser zaten parse edilmiş
  // gövdeyi tekrar okumadığı için aşağıdaki global express.json bu istekler
  // için no-op olur — global limit diğer tüm uçlarda 10kb olarak kalır.
  app.use('/api/admin/branding', express.json({ limit: '1mb' }));
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

  // Production: static assets'i API routes'lardan ÖNCE serve et
  // Böylece /assets/*.js ve /assets/*.css istekleri doğru MIME type ile döner
  if (isProd) {
    const clientDist = join(__dirname, '../../client/dist');
    if (existsSync(clientDist)) {
      app.use(express.static(clientDist, {
        // Vite build çıktısı content-hash içerdiğinden uzun cache güvenlidir
        maxAge: '1y',
        immutable: true,
        // index.html'i static olarak servis etme; SPA fallback bunu halleder
        index: false,
      }));
    }
  }

  // Kurulum sihirbazı (K2) — ilk açılışta terminal gerektirmeden kurulabilsin
  app.use('/install', installRoutes);

  app.use('/api/auth', authRoutes);
  app.use('/api/auth/wallet', web3AuthRoutes);
  app.use('/api/auth', socialAuthRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/promotions', promotionsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/palace', palaceRoutes);
  app.use('/api/inhouse', inhouseRoutes);
  // Çok-kiracılı in-house game provider (bkz. server/src/provider/) — merkezi
  // oyun sunucusunun operatör-tarafı API'si. inhouse-provider: bu sitenin
  // (Operatör #1) provider'a konuşan client + wallet-callback alıcısı.
  app.use('/api/provider/v1', providerRoutes);
  app.use('/api/inhouse-provider', inhouseProviderProxyRoutes);
  app.use('/api/help', helpRoutes);
  app.use('/api/crypto', cryptoRoutes);
  app.use('/api/bank', bankRoutes);
  app.use('/api/admin/analytics', analyticsRoutes);
  app.use('/api/admin', adminModuleSettingsRoutes);
  app.use('/api/auth/2fa', admin2faRoutes);
  app.use('/api/theme', themeRoutes);
  app.use('/api/branding', brandingRoutes);
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
  // inhouse = çekirdek platform (M1), asla gate'lenmez.
  const requireBetting = createModuleGate({ isUsable: isModuleUsable, moduleId: 'betting' });
  const requireCasinoContent = createModuleGate({ isUsable: isModuleUsable, moduleId: 'casino-content' });
  app.use('/api/modules', modulesRoutes); // herkese açık — istemci menü/yönlendirme
  app.use('/api/events', requireBetting, eventsRoutes);
  app.use('/api/bets', requireBetting, betsRoutes);
  app.use('/api/casino', requireCasinoContent, casinoRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/chat', chatRoutes);

  // Health check — Render uptime monitoring için
  app.get('/api/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV }));

  // Derin health/status — Status Page için (public, cache-friendly).
  // onlineCount: tek seferlik/guest kullanım için — bağlı client'lar artık
  // bunu polling ETMİYOR, canlı güncellemeler socket üzerinden 'online:count'
  // event'iyle geliyor (bkz. services/onlineCount.js, socket/handler.js).
  app.get('/api/health/status', async (req, res) => {
    const result = { api: 'up', db: 'unknown', palace: 'unknown', oddsSource: 'unknown', payment: 'up', onlineCount: getOnlineCount() };
    try {
      const mongoose = (await import('mongoose')).default;
      result.db = mongoose.connection.readyState === 1 ? 'up' : 'down';
    } catch { result.db = 'down'; }
    try {
      const start = Date.now();
      const r = await fetch('https://api.casino-provider.example/api/agent/info', {
        method: 'GET',
        headers: { Authorization: `Bearer ${process.env.PALACE_API_TOKEN || ''}` },
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);
      if (!r) result.palace = 'down';
      else if (Date.now() - start > 2000) result.palace = 'degraded';
      else result.palace = 'up';
    } catch { result.palace = 'down'; }
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

  // Görsel proxy — hotlink korumalı CDN'lerden Origin header olmadan çeker
  app.get('/api/img', (req, res) => {
    const raw = req.query.url;
    if (!raw) return res.status(400).end();
    let url;
    try { url = new URL(decodeURIComponent(raw)); } catch { return res.status(400).end(); }
    if (!['http:', 'https:'].includes(url.protocol)) return res.status(400).end();

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

  // SPA fallback — tüm non-API isteklerini index.html'e yönlendir
  if (isProd) {
    const clientDist = join(__dirname, '../../client/dist');
    if (existsSync(clientDist)) {
      app.get('*', (req, res) => {
        res.sendFile(join(clientDist, 'index.html'));
      });
    }
  }

  app.use(errorHandler);
  return app;
}
