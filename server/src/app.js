import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { errorHandler, notFound } from './middleware/error.js';
import authRoutes from './routes/auth.js';
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const baseOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);

// Railway injects RAILWAY_PUBLIC_DOMAIN automatically — add it so <script crossorigin>
// same-origin requests pass CORS when CLIENT_URL isn't explicitly configured.
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  baseOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

export const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (baseOrigins.includes('*') || baseOrigins.includes(origin)) return cb(null, true);
    if (origin.endsWith('.ngrok-free.dev') || origin === 'https://ngrok-free.dev') return cb(null, true);
    cb(new Error('CORS: ' + origin));
  },
  credentials: true,
};

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Railway / Render reverse proxy arkasında req.protocol doğru olsun
  app.use(helmet({
    contentSecurityPolicy: false, // Casino iframe relay kendi CSP'sini yönetiyor
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

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

  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/bets', betsRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/transactions', transactionsRoutes);
  app.use('/api/promotions', promotionsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/casino', casinoRoutes);
  app.use('/api/palace', palaceRoutes);
  app.use('/api/inhouse', inhouseRoutes);
  app.use('/api/help', helpRoutes);
  app.use('/api/crypto', cryptoRoutes);
  app.use('/api/bank', bankRoutes);
  app.use('/api/admin/analytics', analyticsRoutes);

  // Health check — Render uptime monitoring için
  app.get('/api/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV }));

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
