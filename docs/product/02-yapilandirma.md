# Yapılandırma

İki katman var: **`.env` dosyası** (yeniden başlatma gerektirir, sunucu
kurulumuna dair) ve **panelden yönetilen ayarlar** (anında etkili,
operatörün günlük işi — veritabanında tutulur).

## `.env` değişkenleri

`server/.env.example` dosyasındaki tüm anahtarların açıklaması:

### Veritabanı

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `MONGODB_URI` | Evet | Veritabanı bağlantı adresi |
| `MONGO_MAX_POOL_SIZE` / `MONGO_MIN_POOL_SIZE` | Hayır | Bağlantı havuzu ayarı, varsayılan (20/5) çoğu kurulum için yeterli |

### Sunucu / oturum

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `PORT` | Hayır (varsayılan 3001) | API sunucusunun dinlediği port |
| `NODE_ENV` | Evet (`production`) | Geliştirme/üretim davranış farkı (rate limit, cookie güvenliği vb.) |
| `CLIENT_URL` | Evet | Kendi alan adınız — CORS ve e-posta linklerinde kullanılır |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Evet | Oturum token imzalama anahtarları — üretime almadan önce mutlaka değiştirin (`openssl rand -base64 64`) |
| `EMAIL_VERIFICATION_CUTOFF` | Hayır | ISO 8601 tarih — bu tarihten önce kayıt olan kullanıcılar e-posta doğrulama zorunluluğundan muaf (grandfathering). Boşsa koddaki varsayılana düşer |

### Rate limiting

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | Hayır | Genel rate-limit penceresi (ms), varsayılan 900000 (15 dk) |
| `RATE_LIMIT_MAX` | Hayır | Pencere başına genel istek sınırı, varsayılan 200 |
| `AUTH_RATE_LIMIT_MAX` | Hayır | Giriş/kayıt uçları için ayrı, daha sıkı sınır (varsayılan 5) |
| `FINANCIAL_RATE_LIMIT_MAX` | Hayır | Para yatırma/çekme uçları için ayrı sınır (varsayılan 10) |

### Casino sağlayıcısı (Palace)

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `PALACE_API_BASE` / `PALACE_API_TOKEN` / `PALACE_CALLBACK_TOKEN` | Casino modülü kullanılacaksa | Casino içerik sağlayıcısı erişim bilgileri (bkz. [03 — Modül Sistemi](03-modul-sistemi.md)) |

### Ödeme / kripto

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `USDT_TRY_RATE` | Kripto ödeme kullanılacaksa | USDT→TRY sabit kur (otomatik piyasa fiyatı çekilmiyor, elle güncellenir) |
| `TRONGRID_API_KEY` | Hayır | TronGrid'e istek sınırını artırır; boşsa USDT-TRC20 takibi düşük limitle çalışmaya devam eder |

### Yapay zeka destek asistanı

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `AI_HELP_BASE_URL` | Hayır (varsayılan OpenRouter) | Destek chatbot'unun konuştuğu LLM API adresi |
| `AI_HELP_API_KEY` | Hayır | Boşsa chatbot "şu an bakımda, ticket açın" yanıtı döner — çökmez |
| `AI_HELP_MODEL` | Hayır (varsayılan `meta-llama/llama-3.1-8b-instruct:free`) | Kullanılacak model kimliği |

Bu üçlü, `docs/product/*.md` ve `CHANGELOG.md`'yi okuyup parçalayan
gerçek bir doküman-temelli chatbot'u besler — bkz.
[06 — SSS](06-sss.md).

### E-posta

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Evet | E-posta doğrulama ve şifre sıfırlama e-postaları için |

### İzleme / uyarı

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `SENTRY_DSN` | Hayır (önerilir) | Hata izleme |
| `ALERT_WEBHOOK_URL` | Hayır (önerilir) | Operasyonel uyarılar (ör. Slack webhook) |

### Güvenlik / bot koruması

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | Hayır | Cloudflare Turnstile bot koruması |
| `DISABLE_TURNSTILE` | Hayır | `true` ise Turnstile kontrolü atlanır (geliştirme için) |
| `ADMIN_ALLOWED_IPS` | Hayır | Admin paneline IP kısıtlaması, virgülle ayrılmış liste |
| `LEGAL_VERSION` | Hayır | Kullanım şartları sürüm etiketi, kayıt formunda gösterilir |

### Sosyal giriş

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google ile giriş kullanılacaksa | Google Cloud Console'da oluşturulan OAuth 2.0 istemcisi |
| `TELEGRAM_LOGIN_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | Telegram ile giriş kullanılacaksa | Login Widget'a özel bot — admin bildirim botundan (panelden ayarlanır) **farklı** olmalı, BotFather'da `/setdomain` ile prod domain'e kayıtlı olması gerekir |

Web3 cüzdan girişi (MetaMask vb.) için ayrı bir env değişkeni yoktur —
imza doğrulama sunucu tarafında (`ethers`) yapılır, dış kimlik bilgisi
gerekmez.

### Lisans (opsiyonel modül denetimi)

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `LICENSE_SERVER_URL` / `LICENSE_KEY` | Hayır | Tanımlıysa modül açık/kapalı durumu merkezi bir lisans sunucusundan da doğrulanır. **Tanımlı değilse ürün "yönetimsiz" modda çalışır: tanımlı üç modülün (bahis, casino içeriği, canlı casino) hepsi lisanslı sayılır** — pazardan indirilen ürün kutudan çıktığı gibi çalışsın diye bilinçli varsayılan budur |

Bu iki değişken `server/.env.example`'da **yer almaz** —
`server/src/services/licensing/index.js`'te doğrudan `process.env`'den
okunur. Bir lisans sunucunuz yoksa hiç dokunmanıza gerek yok.

### Odds (spor bahis) kaynağı

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `ODDS_PROVIDER` | Hayır (varsayılan `oddsSource`) | Aktif odds sağlayıcısını seçer — `theoddsapi` yapılırsa lisanslı The Odds API'ye geçilir |
| `ODDS_API_KEY` / `ODDS_API_SPORT` | `ODDS_PROVIDER=theoddsapi` ise zorunlu | The Odds API erişim anahtarı ve spor kodu (bkz. [05 — API Referansı](05-api-referansi.md)) |
| `ODDS_SOURCE_HOST_TEMPLATE` | oddsSource kullanılacaksa | Kaynağın mirror domain'lerinin ortak öneki — boşsa domain keşfi hiçbir şey bulamaz |
| `ODDS_SOURCE_PROXY_URL` | Hayır | Bazı barındırma bölgelerinde Cloudflare'in kaynağın origin'ine ulaşamadığı durumlar için HTTP proxy relay |
| `ODDS_SOURCE_COOKIES` | Hayır | Elle export edilmiş çerezler (öncelik `cookies.json` dosyasında; bu env yalnızca dosya yoksa okunur) |
| `ODDS_SOURCE_SCAN_AHEAD` / `ODDS_SOURCE_WIDE_SCAN_AHEAD` / `ODDS_SOURCE_DNS_CONCURRENCY` | Hayır | Domain keşfi tarama pencereleri — yalnızca keşif sürekli başarısız oluyorsa değiştirin |

> Düzeltme notu: bu belgenin önceki sürümü `ODDS_API_KEY`'i kullanılmayan
> bir kalıntı olarak işaretlemişti — o zaman doğruydu, artık değil.
> T2 kartıyla birlikte gerçek bir sağlayıcıya (The Odds API) bağlandı.

> **Bilinen sınır:** `ODDS_PROVIDER` yukarıdaki tablonun ima ettiğinin
> aksine canlı/fikstür senkronizasyon job'larının HANGİSİNİN çalışacağını
> seçmiyor — `server.js`, `startOddsSourceLiveSync`/`startOddsSourceUpcomingSync`'i
> bu ayardan bağımsız, koşulsuz başlatıyor. Bu job'lar her zaman OddsSource'in
> ayna domain'ini keşfedip WebSocket'le bağlanır; `ODDS_PROVIDER=theoddsapi`
> yapmak yalnızca ayrıştırma mantığını etkiler, bu trafiği durdurmaz. Tam
> sağlayıcı değişimi — theoddsapi için yeni bir senkronizasyon job'ı yazmak
> ve `server.js`'i aktif sağlayıcıya göre doğru job'ı başlatacak şekilde
> güncellemek — ayrı, henüz yapılmamış bir mühendislik kartı gerektiriyor.

## Panelden yönetilen ayarlar

Bu ayarlar `.env`'de **değil**, veritabanında (`Setting` koleksiyonu,
`key`/`value` çiftleri) tutulur ve admin panelinden anında değiştirilebilir
— sunucu yeniden başlatmaya gerek yoktur (çoğu değer 30 saniyelik bir
önbellek gecikmesiyle yayılır, `invalidate*()` fonksiyonları çağrıldığında
anında):

- **Alarm kanalları** — Telegram bot token/chat id, webhook URL, uyarı
  e-postası. `/admin/settings`.
- **Tema token'ları** (`theme.<id>` anahtarları) — birincil renk, vurgu
  rengi ve ilgili görsel değerler. `GET /api/theme` üzerinden istemciye
  enjekte edilir, değişiklik tüm arayüze anında yansır. Kaynak:
  `server/src/theme/index.js`.
- **Marka kimliği** (`branding.<id>` anahtarları) — site adı, logo,
  favicon, yazı tipi ailesi/dosyası. Kaynak: `server/src/branding/index.js`.
- **Aktif para birimi** (`currency.code` anahtarı) — bkz. aşağıdaki
  "Para birimi" bölümü.
- **Modül durumu** (`module.<id>.enabled` anahtarları) — bahis, casino
  içeriği, canlı casino modüllerini admin panelindeki **Modüller**
  ekranından (`client/src/pages/admin/Modules.jsx`) açıp kapatabilirsiniz;
  `PATCH /admin/modules/:id` anında uygular, sayfa yeniden başlatma
  gerekmez. Kapalı bir modülün sayfaları ziyaretçiye `ModuleGate`
  bileşeniyle nazikçe gizlenir ("Bu bölüm şu anda kapalı" mesajı),
  çekirdek platform etkilenmez. Bir modül ayrıca lisanslı olmalıdır —
  `LICENSE_SERVER_URL`/`LICENSE_KEY` tanımlı değilse hepsi otomatik
  lisanslı sayılır (bkz. yukarıdaki "Lisans" bölümü). *(Not: bu ekran
  [03 — Modül Sistemi](03-modul-sistemi.md)'nin "henüz yok" dediği
  panelden aç/kapa özelliğidir — o belge henüz güncellenmedi.)*
- **Oyun ekonomisi ayarları** — 13 in-house oyunun (Crash, Roulette,
  Mines, Dice, Limbo, Hi-Lo, Dragon Tiger, Plinko, Wheel, Keno,
  Baccarat, Blackjack, Video Poker) her biri için house edge/payout
  faktörü, min/max bahis, zamanlama (bekleme/animasyon süresi) gibi
  gerçek RTP'yi belirleyen değişkenler `GameSettings` koleksiyonunda
  tutulur ve admin panelindeki **Oyun Ayarları** ekranından
  (`client/src/pages/admin/GameSettings.jsx`, `PATCH
  /admin/game-settings/:gameId`) değiştirilebilir. Her değişiklik
  `changeLog` alanına kim/ne zaman/eski-yeni değer olarak kaydedilir.
  Kaynak: `server/src/models/GameSettings.js`,
  `server/src/services/gameSettings.js`.
- **VIP seviyeleri** — seviye eşiği (XP), cashback yüzdesi, tek seferlik
  ödül, renk/ikon `/admin/vip-levels` uçlarından yönetilir. Kaynak:
  `server/src/models/VipLevel.js`.
- **Sahte kazananlar havuzu** ("Son Kazananlar" simülasyonu) —
  havuz büyüklüğü aralığı, kazanç tutarı aralığı, tetiklenme sıklığı
  aralığı, casino kazançlarının dahil edilip edilmeyeceği
  `/admin/fake-winners` uçlarından ayarlanır. Bu **gerçek kullanıcı,
  bahis ya da bakiye değişimi içermez** — yalnızca gerçek kazananlarla
  aynı `winners:new` socket olayını yayınlar. Casino kazançları yalnızca
  ilgili modül (`casino-content`) açıkken gösterilir. Kaynak:
  `server/src/services/fakeWinners.js`.

## Para birimi

Site genelinde **tek bir aktif para birimi** vardır (kullanıcı başına
çoklu para birimi cüzdanı değildir — `User.balance` tek bir `Number`
alanıdır). Admin panelinden `TRY`, `USD`, `EUR` arasından seçilebilir
(`currency.code` anahtarı, `Setting` koleksiyonunda); seçim, sembolü ve
locale biçimlendirmesini (`₺`/`tr-TR`, `$`/`en-US`, `€`/`de-DE`)
değiştirir. Herkese açık `GET /api/currency` ucu aktif para birimini ve
desteklenen listeyi döner. Kaynak: `server/src/currency/registry.js`,
`server/src/currency/index.js`, `server/src/routes/currency.js`.

## Çok dilli destek (i18n)

İki sözlük dosyası: `client/src/i18n/dictionaries/tr.js` (varsayılan
dil, `DEFAULT_LOCALE = 'tr'`, aynı zamanda fallback — `tr`'de olmayan bir
anahtar hiçbir dilde bulunamaz) ve `dictionaries/en.js`. Her ikisi de
~1490 anahtar içerir. Yeni bir dil eklemek: `dictionaries/` altına dosya
+ `client/src/i18n/index.js`'te `dictionaries` nesnesine kayıt.

Dil değiştirici (`LanguageSwitcher`) global gezinme çubuğunda
(`Navbar.jsx`) yer alır, yani sitenin her yerinden erişilebilir — önceki
sürümlerde yalnızca giriş ekranında vardı. 67 sayfa bileşeninden 59'u
`useTranslation()`/`t()` üzerinden sözlükten okuyor. Ama **çeviri hâlâ
tam değil**: `HomePage.jsx`, `Bahis.jsx`, `Live.jsx`,
`CasinoRedesign.jsx`, `Profile.jsx` gibi büyük sayfalarda hâlâ
doğrudan gömülü Türkçe metin var (kod içinde arama yapıp kontrol
edebilirsiniz). Kısacası: altyapı ve gezinme geneli tamam, sayfa
içerikleri kısmen çevrilmiş, aktif bir geliştirme akışı.

## Casino sağlayıcısı

Casino oyun kataloğu, `CASINO_AGGREGATOR` ortam değişkeniyle seçilen bir
sağlayıcı üzerinden gelir (varsayılan: `palace`). Bugün yalnızca Palace
adaptörü mevcut; ikinci bir sağlayıcı eklemek (Evolution, Pragmatic,
lisanslı bir aggregator) yeni bir adaptör yazıp kayıt defterine
eklemekten ibarettir — mevcut route/kontrol kodu değişmez.
