# API Referansı

Tüm uçlar `/api` altında toplanır (kurulum sihirbazı hariç, o `/install`
altındadır). Bu belge önce uç nokta **gruplarını** özetler, ardından her
grup için gerçek route dosyalarından çıkarılmış **uç nokta listesini**
verir. Tam parametre/dönüş tipleri için nihai kaynak yine kodun kendisidir
(`server/src/routes/`), bu belge oraya giden ayrıntılı bir haritadır.

| Grup | Taban yol | Ne içerir |
|---|---|---|
| Kimlik doğrulama | `/api/auth` | Kayıt, giriş, oturum yenileme, e-posta doğrulama, şifre sıfırlama |
| Web3 cüzdan girişi | `/api/auth/wallet` | MetaMask/WalletConnect vb. ile giriş, hesaba cüzdan bağlama |
| Sosyal giriş | `/api/auth` (google/telegram) | Google ve Telegram OAuth ile giriş/hesap bağlama |
| 2FA | `/api/auth/2fa` | Yönetici hesapları için iki faktörlü doğrulama |
| Etkinlikler | `/api/events` | Spor bahis etkinlik listesi, detay — **betting modülü kapısı** |
| Bahisler | `/api/bets` | Kupon oluşturma, bahis detayı — **betting modülü kapısı** |
| Kullanıcılar | `/api/users` | Profil, bakiye, favoriler/son oynananlar, şifre/email değişimi, KVKK veri dışa aktarımı, hesap silme, sorumlu oyun limitleri |
| İşlemler | `/api/transactions` | Basit para yatırma/çekme kayıtları |
| Promosyonlar | `/api/promotions` | Bonus talep etme, aktif promosyonlar, wagering dönüşümü |
| Casino | `/api/casino` | Aggregator-agnostik spin/bakiye ucu — **casino-content modülü kapısı** |
| Palace | `/api/palace` | Casino aggregator'ına özel uçlar (oyun listesi, oturum, callback) — **modül kapısı YOK** |
| In-house oyunlar | `/api/inhouse` | 13 oyunun kendi uçları (`/inhouse/crash/*`, `/inhouse/mines/*` vb.) — çekirdek platform, hiçbir modül kapısı yok |
| Yardım | `/api/help` | AI destek asistanı (chatbot) |
| Kripto | `/api/crypto` | USDT-TRC20 yatırma adresi/takibi + çekim talebi |
| Banka | `/api/bank` | Havale ile yatırma/çekme talepleri + admin onay akışı |
| Destek talepleri | `/api/tickets` | Kullanıcı destek ticket'ları + admin yanıt/durum |
| Sohbet | `/api/chat` | Canlı sohbet odaları + admin moderasyon |
| Tema | `/api/theme` | Panelden yönetilen görsel token'lar (herkese açık) |
| Marka | `/api/branding` | Logo, favicon, site adı, font (herkese açık) |
| Sayfa içerikleri | `/api/pages` | Ana sayfa bölüm sırası + banner'lar (herkese açık) |
| Statik sayfalar | `/api/static-pages` | Hakkımızda/Kariyer/Yasal vb. footer sayfaları (herkese açık) |
| Oyunlar | `/api/games` | Öne çıkan oyun kodları listesi (herkese açık) |
| Para birimi | `/api/currency` | Aktif/desteklenen para birimleri (herkese açık) |
| Yerel ayar | `/api/locale-config` | Operatör saat dilimi (herkese açık) |
| Modüller | `/api/modules` | İstemci menüsü için modül açık/kapalı durumu (herkese açık) |
| VIP | `/api/vip` | Kullanıcının VIP seviyesi/ilerlemesi |
| Admin | `/api/admin` | Kullanıcı/etkinlik/oyun/tema/marka/rol/VIP/bot yönetimi — yönetici yetkisi gerektirir |
| Admin analitik | `/api/admin/analytics` | Gösterge paneli istatistikleri |
| Kurulum | `/install` | Tek sayfalık kurulum sihirbazı (ilk deploy, terminal gerektirmez) |

## Kimlik doğrulama modeli

- Erişim token'ı: kısa ömürlü JWT, `Authorization: Bearer <token>` header'ında.
- Yenileme token'ı: `httpOnly` cookie, `/api/auth/refresh` ile yeni erişim
  token'ı alınır.
- **Misafir uçları** (`/auth/register`, `/auth/login`, `/auth/forgot-password`,
  `/auth/reset-password`, `/auth/wallet/login`, `/auth/google`,
  `/auth/telegram`) `guestOnly` middleware'inden geçer — aktif oturumda
  `403 ALREADY_AUTHENTICATED` döner, açık oturumlu bir kullanıcı bu uçları
  çağıramaz.
- Admin uçları iki katmanlı kontrol ister: `requireAuth` (geçerli JWT) +
  `requireAdmin` (`role: 'admin'`). `/api/auth/2fa/*` istisnadır — yalnızca
  `requireAuth` middleware'i vardır, admin kontrolü handler içinde manuel
  yapılır (`NOT_ADMIN` 403).
- **Demo admin kısıtı**: `isDemoAdmin: true` işaretli yönetici hesapları,
  `blockDemoAdmin` middleware'i uygulanan yıkıcı uçlarda (kullanıcı/bakiye
  silme, event settle, rol/VIP/bot silme, chat/ticket moderasyonu vb.)
  isteği reddeder — vitrin/demo ortamında geri döndürülemez hasar önlenir.

## Hata biçimi

Standart hatalar aynı zarfta döner:

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Kullanıcı adı veya şifre hatalı" } }
```

`code` alanı programatik kontrol için, `message` kullanıcıya gösterilebilir
Türkçe metin için.

**Not (operatörler için önemli):** Bu zarf tutarlı biçimde yalnızca
`createError()` kullanan yeni nesil route'larda (auth, users, admin, ticket,
chat, module gate) uygulanır. Daha eski/basit route'lar (`inhouse.js`,
`casino.js`, `crypto.js`, `palace.js`, `bank.js`'in bazı uçları) hâlâ düz
`{ "error": "mesaj metni" }` biçiminde string hata döndürebiliyor. Bir
istemci/entegrasyon yazarken her iki biçimi de (`error` string veya
`error.code`/`error.message` nesnesi) ele almak gerekir.

## Hız sınırlama

Aşağıdaki limiter'lar `express-rate-limit` ile tanımlıdır (test modunda
devre dışıdır — `NODE_ENV=test` veya `E2E_TEST=true`):

| Limiter | Pencere | Limit | Uygulandığı uçlar |
|---|---|---|---|
| `globalLimiter` | 15 dk | 1200 istek/IP | Tüm `/api/*` (health uçları hariç) |
| `authLimiter` | 15 dk | 5 istek/IP | `/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/resend-verification`, `/auth/wallet/nonce`, `/auth/wallet/login`, `/auth/google`, `/auth/telegram`, `/auth/telegram/widget-state` |
| `financialLimiter` | 60 dk | 10 istek/IP | `/bank/deposit`, `/bank/withdraw` |
| `spinLimiter` | 60 sn | 60 istek/IP | `/casino/spin` |
| `adminLimiter` | 15 dk | 50 istek/IP | `/auth/2fa/setup`, `/auth/2fa/verify`, `/auth/2fa/disable` |
| `palaceCallbackLimiter`, `chatLimiter`, `bonusLimiter` | — | — | Tanımlı ama şu an hiçbir route'a bağlanmamış (kod tabanında hazır, kullanılmıyor) |

Ayrıca kimlik doğrulama uçlarında `/auth/login` art arda başarısız deneme
sonrası `429 TOO_MANY_ATTEMPTS` döner (login lockout, `LOGIN_LOCKOUT_MINUTES`
env'i ile ayarlanır — auth limiter'dan bağımsız, kullanıcı bazlı bir
kilit).

---

## Uç Nokta Detayları

### Kimlik doğrulama — `/api/auth` (`routes/auth.js`)

| Method + Path | Auth | Body şeması | Notlar / hata kodları |
|---|---|---|---|
| `POST /register` | Misafir (`guestOnly`) + `authLimiter` | `registerSchema`: `username` (3-30, `[a-zA-Z0-9_]`), `email`, `password` (8-128, ≥1 büyük harf + ≥1 rakam), `referredBy?`, **`acceptedTerms: true` (zorunlu)**, **`acceptedKvkk: true` (zorunlu)**, `consentVersion?`, `turnstileToken?` | `409 USER_EXISTS` |
| `POST /login` | Misafir + `authLimiter` | `loginSchema`: `username`, `password`, `turnstileToken?` | `429 TOO_MANY_ATTEMPTS`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_BANNED`, `403 EMAIL_NOT_VERIFIED` |
| `POST /refresh` | Public (refresh cookie) | — | `401 NO_REFRESH_TOKEN` / `USER_NOT_FOUND` / `TOKEN_REVOKED` / `INVALID_REFRESH_TOKEN` |
| `POST /logout` | Public | — | Refresh cookie temizler |
| `GET /verify-email` | Public | Query: `token` | `400 INVALID_TOKEN` |
| `POST /verify-email` | Public | `emailVerifySchema`: `token` (10-200) | `400 INVALID_TOKEN` |
| `POST /resend-verification` | `authLimiter` | `resendVerificationSchema`: `email` | |
| `POST /forgot-password` | Misafir + `authLimiter` | `passwordResetRequestSchema`: `email`, `turnstileToken?` | |
| `POST /reset-password` | Misafir + `authLimiter` | `passwordResetConfirmSchema`: `token`, `newPassword` (8-128, büyük harf+rakam) | `400 INVALID_TOKEN` |

### Web3 cüzdan girişi — `/api/auth/wallet` (`routes/web3Auth.js`)

| Method + Path | Auth | Body şeması | Notlar |
|---|---|---|---|
| `POST /nonce` | `authLimiter` | `walletNonceSchema`: `address` (`0x` + 40 hex) | Hem giriş hem hesaba bağlama akışı için ortak, auth gerektirmez |
| `POST /login` | Misafir + `authLimiter` | `walletAuthSchema`: `address`, `signature`, `message`, `walletType?` (metamask/walletconnect/coinbase/injected/unknown), `chainId?` | Yeni kullanıcıysa otomatik hesap oluşturur |
| `POST /link` | Kullanıcı | `walletAuthSchema` (yukarıdaki gibi) | Mevcut hesaba cüzdan bağlar |
| `DELETE /` | Kullanıcı | — | Cüzdan bağını kaldırır |

### Sosyal giriş — `/api/auth` (`routes/socialAuth.js`, Google/Telegram)

| Method + Path | Auth | Notlar |
|---|---|---|
| `GET /google` | Misafir + `authLimiter` | Google OAuth URL'ine redirect |
| `GET /google/callback` | Public | Query `linkGoogleSchema` (`code`,`state`); başarısızsa client'a `?error=` ile redirect |
| `POST /google/link` | Kullanıcı | Bağlama URL'i döner |
| `GET /google/link/callback` | Kullanıcı | Hesaba Google bağlar |
| `DELETE /google` | Kullanıcı | Google bağını kaldırır |
| `GET /telegram` | Misafir + `authLimiter` | Telegram OAuth URL'ine redirect |
| `GET /telegram/widget-state` | `authLimiter` | Telegram Login Widget için taze `state` + bot kullanıcı adı |
| `GET /telegram/callback` | Public | Query `linkTelegramSchema` (`id`,`auth_date`,`hash`,`state`,...) |
| `POST /telegram/link` | Kullanıcı | Bağlama URL'i döner |
| `GET /telegram/link/callback` | Kullanıcı | Hesaba Telegram bağlar |
| `DELETE /telegram` | Kullanıcı | Telegram bağını kaldırır |
| `GET /accounts` | Kullanıcı | Bağlı sosyal hesapların listesi |

### 2FA — `/api/auth/2fa` (`routes/admin2fa.js`)

Sadece `requireAuth` uygulanır; admin kontrolü handler içinde yapılır
(`403 NOT_ADMIN` eğer `role !== 'admin'`).

| Method + Path | Auth | Body | Notlar |
|---|---|---|---|
| `POST /setup` | Kullanıcı + `adminLimiter` | `{ password }` | QR + 10 yedek kod üretir; `400 ALREADY_ENABLED`, `401 WRONG_PASSWORD` |
| `POST /verify` | Kullanıcı + `adminLimiter` | `{ token }` | TOTP veya yedek kod kabul eder; `400 NOT_SETUP`, `401 INVALID_TOKEN` |
| `POST /disable` | Kullanıcı + `adminLimiter` | `{ password, token }` | `400 NOT_ENABLED`, `401 WRONG_PASSWORD`/`INVALID_TOKEN` |
| `GET /status` | Kullanıcı | — | `{ enabled, isAdmin }` |

### Etkinlikler — `/api/events` (`routes/events.js`) — **betting modülü kapısı**

Modül kapalıysa tüm bu uçlar `503 { error: { code: 'MODULE_DISABLED', module: 'betting' } }` döner.

| Method + Path | Auth |
|---|---|
| `GET /` | Public |
| `GET /summary` | Public |
| `GET /:id` | Public |

### Bahisler — `/api/bets` (`routes/bets.js`) — **betting modülü kapısı**

| Method + Path | Auth | Body şeması |
|---|---|---|
| `POST /` | Kullanıcı | `placeBetSchema`: `selections[]` (1-10 adet, her biri `eventId`, `marketType`, `oddId`, `oddLabel`, `oddValue` ≥1.01, `eventLabel`), `type`: `single`\|`combo`, `stake` (1-50000) |
| `GET /:id` | Kullanıcı | — |

### Kullanıcılar — `/api/users` (`routes/users.js`) — tümü kullanıcı girişi gerektirir

| Method + Path | Body şeması | Notlar |
|---|---|---|
| `GET /me` | — | Profil |
| `GET /me/bets` | — | |
| `GET /me/transactions` | — | |
| `GET /me/preferences` / `PUT /me/preferences` | — | |
| `GET /me/favorites` | — | |
| `POST /me/favorites/toggle` | `gameActivitySchema`: `gameId` (1-200), `kind`: `palace`\|`inhouse` | |
| `GET /me/recently-played` / `POST /me/recently-played` | `gameActivitySchema` (POST için) | |
| `PUT /me/password` | `changePasswordSchema`: `currentPassword`, `newPassword` (8-128, büyük harf+rakam) | |
| `PUT /me/email` | `changeEmailSchema`: `password`, `newEmail` | |
| `GET /me/data-export` | `dataExportRequestSchema`: `password` | KVKK md.11 self-service veri dışa aktarımı |
| `DELETE /me` | `accountDeletionRequestSchema`: `password`, `confirm: true` | 30 günlük "vazgeçme" süresi ile hesap silme talebi |
| `POST /me/cancel-deletion` | — | Silme talebini iptal eder |
| `GET /me/limits` / `PUT /me/limits` | — | Sorumlu oyun (kayıp/yatırım/oturum) limitleri |

### İşlemler — `/api/transactions` (`routes/transactions.js`) — kullanıcı girişi gerektirir

| Method + Path | Body şeması |
|---|---|
| `POST /deposit` | `depositSchema`: `amount` (10-50000) |
| `POST /withdraw` | `withdrawSchema`: `amount` (20-50000), `iban` (TR + 24 hane, mod-97 checksum), `fullName` (3-100), `confirmForfeit?` (varsayılan `false`) |

### Promosyonlar — `/api/promotions` (`routes/promotions.js`)

| Method + Path | Auth |
|---|---|
| `GET /` | Public |
| `GET /my-wagerings` | Kullanıcı |
| `POST /:id/claim` | Kullanıcı |
| `POST /:id/wagerings/:wid/convert` | Kullanıcı |

### Casino — `/api/casino` (`routes/casino.js`) — **casino-content modülü kapısı**

| Method + Path | Auth | Body | Hata kodları |
|---|---|---|---|
| `POST /spin` | Kullanıcı + `spinLimiter` | `{ bet, payout, gameId?, gameTitle?, provider? }` | `400 INVALID_BET`, `400 INVALID_PAYOUT`, `404 NOT_FOUND`, `400 INSUFFICIENT_BALANCE` |

### Palace (casino aggregator) — `/api/palace` (`routes/palace.js`) — **modül kapısı yok**

`PALACE_API_TOKEN` env tanımlı değilse tüm uçlar `503 { error: 'Palace Casino API henüz yapılandırılmadı' }` döner. Not: Bu route grubu `requireCasinoContent` gate'inin **dışındadır** — casino-content modülü kapansa bile Palace uçları çalışmaya devam eder (yalnızca `/api/casino/spin` geneleştirilmiş ucu ve casino katalog sayfası kapanır).

| Method + Path | Auth | Notlar |
|---|---|---|
| `GET /agent/info` | Kullanıcı | Agent bakiye/RTP/currency |
| `POST /agent/rtp` | Admin | `{ rtp }` 75-95 arası |
| `POST /agent/callback-test` | Admin | |
| `POST /user/create` | Kullanıcı | `{ name }` 2-50 karakter |
| `POST /user/info` | Kullanıcı | `{ user_code }` |
| `POST /user/deposit` | Admin | `{ user_code, amount }` |
| `POST /user/withdraw` | Admin | `{ user_code, amount }` |
| `POST /user/withdraw-all` | Admin | `{ user_code }` |
| `POST /providers` | Public | Statik katalog, misafire açık |
| `POST /games` | Public | `{ provider_id, lang }` |
| `POST /game/all` | Public | |
| `GET /game/popular` | Public | Son 7 gün en çok oynanan (agregat) |
| `POST /game/url` | Kullanıcı | `{ user_code, provider_id, game_code|game_symbol, win_ratio?, language?, return_url? }` |
| `POST /game/launch` | Kullanıcı | Local bakiyeyi Palace'a transfer edip oyun açar; `409 SESSION_ACTIVE`, `400 INSUFFICIENT_BALANCE`, `503 PALACE_BALANCE_UNAVAILABLE`, `400 PALACE_DEPOSIT_FAILED` |
| `POST /game/close` | Kullanıcı | Oturumu kapatıp bakiyeyi geri çeker |
| `GET /game/session` | Kullanıcı | Aktif oturum kontrolü |
| `POST /game/online` | Kullanıcı | |
| `POST /game/call-config` | Kullanıcı | |
| `POST /bonus/start` | Admin | `{ gplay_id, set_point?, type?, memo? }` |
| `POST /bonus/cancel` | Admin | `{ call_id }` |
| `POST /transactions` | Kullanıcı | `{ start_time, end_time, offset, limit }` |
| `POST /round-details` | Kullanıcı | `{ transaction_id }` |
| `POST /statistics/user` | Admin | |
| `POST /callback` | Provider (özel `callback-token` header) | Bet/Win/BetCancel/BonusCall/Deposit/Withdraw işleme; round_id bazlı tekrar-önleme (5dk TTL) |

### In-house oyunlar — `/api/inhouse` (`routes/inhouse.js`) — çekirdek platform, hiçbir modül kapısı yok

`GET /recent-winners` hariç tümü kullanıcı girişi gerektirir. Her oyunun kendi admin-ayarlanabilir min/max bahis + aktiflik kontrolü vardır (`checkBetAllowed` — kapalıysa `503 GAME_DISABLED`, limit dışıysa `400`).

| Oyun | Uçlar |
|---|---|
| Ortak | `GET /recent-winners` (public) |
| Mines | `POST /mines/start`, `POST /mines/reveal`, `POST /mines/cashout` |
| Plinko | `POST /plinko/drop` (`{ amount, risk?, rows? }`) |
| Dice | `POST /dice/roll` (`{ amount, target, over? }`) |
| Limbo | `POST /limbo/play` (`{ amount, target }`) |
| Wheel | `POST /wheel/spin` (`{ amount, risk? }`) |
| HiLo | `POST /hilo/start`, `POST /hilo/guess` (`{ guess }`), `POST /hilo/cashout` |
| Keno | `POST /keno/play` (`{ amount, picks[] }`, 1-10 seçim) |
| Blackjack | `POST /blackjack/deal`, `POST /blackjack/hit`, `POST /blackjack/stand`, `POST /blackjack/double` |
| European Roulette | `POST /roulette/spin` (`{ amount, bets[] }`) |
| Baccarat | `POST /baccarat/deal` (`{ amount, bet: 'player'|'banker'|'tie' }`) |
| Video Poker | `POST /videopoker/deal`, `POST /videopoker/draw` (`{ holds[] }`) |
| Dragon Tiger | `POST /dragontiger/deal` (`{ amount, bet: 'dragon'|'tiger'|'tie' }`) |

### Yardım — `/api/help` (`routes/help.js`)

| Method + Path | Auth | Body | Notlar |
|---|---|---|---|
| `POST /chat` | Kullanıcı | `{ messages: [{role, content}, ...] }` | Köklenmiş (RAG) AI destek asistanı; `AI_HELP_API_KEY` yoksa sabit "bakımda" cevabı döner |

### Kripto — `/api/crypto` (`routes/crypto.js`) — tümü kullanıcı girişi gerektirir

| Method + Path | Body | Notlar |
|---|---|---|
| `GET /deposit-address` | — | Kullanıcıya özel TRC20 USDT adresi; `CRYPTO_SEED_PHRASE` yoksa `503` |
| `POST /check-deposit` | — | TronGrid sorgular, gelen USDT'yi `USDT_TRY_RATE` ile TRY'ye çevirip bakiyeye ekler |
| `POST /withdraw-request` | `{ address, usdtAmount }` (min 5, `T` + 33 karakter TRC20 adresi) | Manuel/admin onaylı çekim talebi oluşturur |

### Banka — `/api/bank` (`routes/bank.js`)

| Method + Path | Auth | Body şeması |
|---|---|---|
| `GET /info` | Public | — |
| `POST /deposit` | Kullanıcı + `financialLimiter` | `depositSchema` |
| `POST /withdraw` | Kullanıcı + `financialLimiter` | `withdrawSchema` |
| `GET /requests` | Kullanıcı | — |
| `GET /admin/pending` | Admin | — |
| `PATCH /admin/pending/:id/approve` | Admin | — |
| `PATCH /admin/pending/:id/reject` | Admin | — |

### Destek talepleri — `/api/tickets` (`routes/ticket.js`) — modül kapısı yok

| Method + Path | Auth | Body şeması |
|---|---|---|
| `POST /mine` | Kullanıcı | `createTicketSchema`: `subject` (1-200), `message` (1-4000) |
| `GET /mine` | Kullanıcı | — |
| `GET /mine/:id` | Kullanıcı | — |
| `POST /mine/:id/reply` | Kullanıcı | `replySchema`: `message` (1-4000) |
| `GET /` | Admin | — |
| `GET /:id` | Admin | — |
| `POST /:id/reply` | Admin (demo admin engellenir) | `replySchema` |
| `PATCH /:id/status` | Admin (demo admin engellenir) | `setStatusSchema`: `status`: `open`\|`in_progress`\|`resolved`\|`closed` |

### Sohbet — `/api/chat` (`routes/chat.js`) — modül kapısı yok

| Method + Path | Auth | Body şeması |
|---|---|---|
| `GET /rooms` | Kullanıcı | — |
| `GET /rooms/:slug/messages` | Kullanıcı | — |
| `GET /admin/rooms` | Admin | — |
| `POST /admin/rooms` | Admin (demo engellenir) | `createRoomSchema`: `name`, `description?`, `icon?`, `color?`, `isPublic?`, `minLevel?`, `maxUsers?`, `slowMode?` (0-300 sn), `rainSettings?` |
| `PATCH /admin/rooms/:id` | Admin (demo engellenir) | `updateRoomSchema` (yukarıdakine ek `isActive?`, `rain*` düz alanlar) |
| `DELETE /admin/rooms/:id` | Admin (demo engellenir) | — |
| `POST /admin/rooms/:id/ban` | Admin (demo engellenir) | `banUserSchema`: `userId` |
| `DELETE /admin/rooms/:id/ban/:userId` | Admin (demo engellenir) | — |
| `POST /admin/rooms/:id/mute` | Admin (demo engellenir) | `muteUserSchema`: `userId`, `duration` (1-86400 sn), `reason?` |
| `DELETE /admin/rooms/:id/mute/:userId` | Admin (demo engellenir) | — |
| `DELETE /admin/messages/:id` | Admin (demo engellenir) | — |

### Görsel/istatik uçlar (hepsi herkese açık, `Cache-Control: public, max-age=30`)

| Method + Path | Route dosyası | Döner |
|---|---|---|
| `GET /api/theme` | `theme.js` | `{ vars }` — CSS token'ları |
| `GET /api/branding` | `branding.js` | `{ values }` — logo/favicon/site adı/font |
| `GET /api/pages/home` | `pages.js` | `{ content }` — ana sayfa bölüm sırası + banner override'ları |
| `GET /api/static-pages` | `staticPages.js` | `{ pages }` — footer sayfa listesi |
| `GET /api/static-pages/:slug` | `staticPages.js` | `{ page }` — `404 NOT_FOUND` kapalı/yok ise |
| `GET /api/games/featured` | `games.js` | `{ codes }` — öne çıkan oyun kodları |
| `GET /api/currency` | `currency.js` | `{ active, supported }` |
| `GET /api/locale-config` | `localeConfig.js` | `{ timezone }` |
| `GET /api/modules` | `modules.js` | `{ modules: [{ id, title, description, available }] }` — lisans kaynağı sızmaz |

### VIP — `/api/vip` (`routes/vip.js`)

| Method + Path | Auth |
|---|---|
| `GET /status` | Kullanıcı — güncel VIP seviyesi/ilerlemesi |

### Admin — `/api/admin` (`routes/admin.js`) — tümü `requireAuth` + `requireAdmin` + audit log

Yıkıcı/finansal etkili uçlarda ek olarak `blockDemoAdmin` uygulanır (aşağıda **[demo engelli]** ile işaretlendi) — `isDemoAdmin: true` hesaplar bu uçlarda `403` alır.

**Kullanıcılar**
- `GET /users`, `POST /users` (`createUserSchema`: `username`,`email`,`password`,`role?`,`referredBy?`)
- `PATCH /users/:id`
- `DELETE /users/:id` **[demo engelli]**
- `PATCH /users/:id/balance` **[demo engelli]** (`updateBalanceSchema`: `amount` (pozitif), `type`: `credit`\|`debit`\|`bonus`, `note?`)
- `GET /users/:id/referrals`, `GET /users/:id/referral-tree`, `GET /users/:id/transactions`

**Etkinlikler**
- `GET /events/archived`
- `POST /events` (`createEventSchema`: `sport`,`league`,`homeTeam`,`awayTeam`,`startTime`,`markets[]`)
- `PATCH /events/:id`
- `POST /events/:id/settle` **[demo engelli]** (`settleEventSchema`: `results` — oddId veya oddId dizisi, `score?`)

**İstatistik / Görevler**
- `GET /stats`, `GET /tasks`, `PATCH /tasks/:id`

**Casino**
- `GET /casino/stats`, `GET /users/:id/casino-rounds`

**Palace (admin)**
- `GET /palace/agent/info`, `POST /palace/user/create`, `POST /palace/game/launch`, `POST /palace/game/list`
- `GET /palace/test-users`, `POST /palace/withdraw-test-users`, `POST /palace/rtp`, `POST /palace/bonus/start`, `POST /palace/bonus/cancel`, `GET /palace/bonus/config`, `GET /palace/summary`

**Hata günlüğü**
- `GET /errors/recent`, `GET /errors/status`, `POST /errors/clear` **[demo engelli]**

**Tema / Marka / Sayfa / Oyun vitrini**
- `GET /theme`, `PATCH /theme` (`updateThemeSchema`: `id`, `value`)
- `GET /theme/presets`, `POST /theme/apply-preset` (`applyThemePresetSchema`: `id`)
- `GET /branding`, `PATCH /branding` (`updateBrandingSchema`: `id`, `value` — görsel/font alanlar `data:` URL, boyut sınırı tanıma göre değişir)
- `GET /pages/home`, `PATCH /pages/home` (`updateHomeContentSchema`: `sectionOrder[]`, `banners[]`)
- `GET /games/featured`, `PATCH /games/featured` (`updateFeaturedGamesSchema`: `codes[]`, en fazla 60)

**Oyun ayarları (RTP/limit/house edge — 13 in-house oyun)**
- `GET /game-settings`
- `PATCH /game-settings/:gameId` **[demo engelli]** (`updateGameSettingsSchema` — oyuna göre `*MinBet`/`*MaxBet`/`*HouseEdgePercent`/`*PayoutFactor`/`*Mult` alanları, `isActive?`, `reason?`)
- `POST /game-settings/:gameId/simulate-rtp` (`simulateRtpSchema` — yalnızca blackjack/video poker alanları + `hands?` 20000-500000)

**Alarm ayarları**
- `GET /settings/alerts`, `PUT /settings/alerts`, `POST /settings/alerts/test`

**Saat dilimi / Para birimi**
- `GET /settings/timezone`, `PUT /settings/timezone` (`updateTimezoneSchema`: `timezone`)
- `GET /currency`, `PUT /currency` **[demo engelli]** (`updateCurrencySchema`: `code` — yalnızca tanımlı para birimleri)

**Roller / izinler**
- `GET /roles`
- `POST /roles` **[demo engelli]** (`createRoleSchema`: `name` (küçük harf/rakam/_), `displayName`, `description?`, `permissions[]?`, `priority?` 0-99)
- `PUT /roles/:id` **[demo engelli]** (`updateRoleSchema`)
- `DELETE /roles/:id` **[demo engelli]**
- `GET /permissions`
- `POST /users/:id/roles` **[demo engelli]** (`assignRoleSchema`: `roleId`)
- `DELETE /users/:id/roles/:roleId` **[demo engelli]**

**VIP seviyeleri**
- `GET /vip-levels`
- `POST /vip-levels` **[demo engelli]** (`upsertVipLevelSchema`: `level` 1-20, `name`, `xpRequired`, `cashbackPercent?`, `rewardAmount?`, `rewardType?`, `benefits[]?`, `color?`, `icon?`, `isActive?`)
- `DELETE /vip-levels/:level` **[demo engelli]**

**Bot oyuncular**
- `GET /bots`
- `POST /bots` **[demo engelli]** (`createBotSchema`: `username`,`email`,`password?`,`botType?`,`behavior?`,`limits?`,`notes?`)
- `GET /bots/:id`
- `PATCH /bots/:id` **[demo engelli]** (`updateBotSchema`)
- `DELETE /bots/:id` **[demo engelli]**
- `POST /bots/start-all` **[demo engelli]**, `POST /bots/stop-all` **[demo engelli]**

**Sahte kazananlar (kozmetik, gerçek bakiye kullanmaz)**
- `GET /fake-winners`
- `PUT /fake-winners` **[demo engelli]** (`updateFakeWinnersSchema`: `enabled?`,`poolMin?`,`poolMax?`,`intervalMinMs?`,`intervalMaxMs?`,`amountMin?`,`amountMax?`,`includeCasinoWins?`,`includeBettingWins?` — min/max çiftleri karşılıklı doğrulanır)

**Statik sayfalar (footer)**
- `GET /static-pages`
- `PUT /static-pages/:slug` **[demo engelli]** (`upsertStaticPageSchema`: `title`,`intro?`,`sections[]`)
- `PATCH /static-pages/:slug/toggle` **[demo engelli]** (`toggleStaticPageSchema`: `isEnabled`)

**Modüller** (`/api/admin/modules` — ayrı alt router, `controllers/modules.js`)
- `GET /` — modül listesi (durum + lisans birleşik)
- `PATCH /:id` — `{ enabled: boolean }` ile aç/kapa
- `POST /refresh` — modül + lisans önbelleğini tazeler

### Admin analitik — `/api/admin/analytics` (`routes/analytics.js`) — admin

| Method + Path |
|---|
| `GET /overview` |
| `GET /users` |
| `GET /casino` |
| `GET /finance` |
| `GET /sports` |

### Kurulum — `/install` (`routes/install.js`) — `/api` altında değil

| Method + Path | Notlar |
|---|---|
| `GET /install` | Build gerektirmeyen tek sayfalık kurulum formu |
| `GET /install/api/status` | DB bağlantısı + kurulum durumu |
| `POST /install/api/run` | İlk yönetici + site ayarlarını oluşturur, `.env` içeriği üretir; `409` zaten kurulmuşsa, `400` doğrulama hatasında |

### Sağlık / yardımcı uçlar (`app.js` içinde, route dosyası yok)

| Method + Path | Auth | Notlar |
|---|---|---|
| `GET /api/health` | Public | `{ ok: true, env }` — uptime monitoring |
| `GET /api/health/status` | Public | `{ api, db, palace, oddsSource, payment, onlineCount, sync }` — derin sağlık, cache'lenmez |
| `GET /api/img?url=` | Public | Hotlink korumalı CDN görsel proxy'si (yalnızca `image/*` content-type kabul eder) |
