import rateLimit from 'express-rate-limit';

// Test mode check
const isTestMode = process.env.NODE_ENV === 'test' || process.env.E2E_TEST === 'true';

const createLimiter = (options) => {
  if (isTestMode) {
    return (req, res, next) => next();
  }
  return rateLimit(options);
};

// Global API limit — IP başına. 200/15dk (eski değer) modern bir SPA'nın
// normal kullanımını (anasayfa ilk yüklemede 10+ paralel istek, sağ raydaki
// çevrimiçi sayacı 10sn'de bir polling, birden fazla sekme/kullanıcı aynı
// IP'den) kolayca aşıp meşru trafiği 429'a düşürüyordu — artırıldı.
export const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla istek. Lütfen biraz bekleyin.' } },
  skip: (req) => req.path === '/api/health' || req.path === '/api/health/status',
});

// Auth — credential stuffing koruması
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' } },
});

// Kayıt / giriş / e-posta akışları ayrı sayaçlarda. Eskiden hepsi authLimiter'ı
// (IP başına 15dk'da 5, başarılı/başarısız hepsi sayılır) paylaşıyordu: formu bir
// iki kez hatalı gönderip (kullanıcı adı alınmış, zayıf şifre) sonra giriş yapan
// yeni oyuncu "Çok fazla deneme" alıyordu.

// Kayıt — yalnızca başarıyla açılan hesaplar sayılır (toplu hesap açmayı keser),
// hatalı form gönderimleri kullanıcıyı kilitlemez.
export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Bu ağdan çok fazla hesap açıldı. Bir saat sonra tekrar deneyin.' } },
});

// Giriş — credential stuffing koruması: yalnızca başarısız denemeler sayılır.
export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla hatalı giriş denemesi. 15 dakika sonra tekrar deneyin.' } },
});

// Doğrulama e-postası / şifre sıfırlama — e-posta gönderen uçlar.
export const emailFlowLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla istek. 15 dakika sonra tekrar deneyin.' } },
});

// Financial — deposit/withdraw
export const financialLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla finansal işlem. 1 saat sonra tekrar deneyin.' } },
});

// Igames callback — provider-side ama savunma amaçlı
export const igamesCallbackLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

// AI chat — cost kontrolü
export const chatLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla mesaj gönderdiniz. 1 saat sonra tekrar deneyin.' } },
});

// Admin — abuse koruması
export const adminLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

// Bonus claim
export const bonusLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

// Spin — brute-force / crash exploitation koruması
export const spinLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla spin isteği. Lütfen yavaşlayın.' } },
});

// Admin test e-postası — gerçek SMTP'ye giden, kötüye kullanılabilecek uç.
export const emailTestLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Çok fazla test e-postası. 15 dakika sonra tekrar deneyin.' } },
});
