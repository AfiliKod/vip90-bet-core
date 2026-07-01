import rateLimit from 'express-rate-limit';

// Global API limit (Render free tier dostu, production'da artır)
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla istek. Lütfen biraz bekleyin.' } },
  skip: (req) => req.path === '/api/health' || req.path === '/api/health/status',
});

// Auth — credential stuffing koruması
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' } },
});

// Financial — deposit/withdraw
export const financialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla finansal işlem. 1 saat sonra tekrar deneyin.' } },
});

// Palace callback — provider-side ama savunma amaçlı
export const palaceCallbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

// AI chat — cost kontrolü
export const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla mesaj gönderdiniz. 1 saat sonra tekrar deneyin.' } },
});

// Admin — abuse koruması
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

// Bonus claim
export const bonusLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});