# Yapılandırma

İki katman var: **`.env` dosyası** (yeniden başlatma gerektirir, sunucu
kurulumuna dair) ve **panelden yönetilen ayarlar** (anında etkili,
operatörün günlük işi).

## `.env` değişkenleri

`server/.env.example` dosyasındaki tüm anahtarların açıklaması:

| Değişken | Zorunlu mu | Ne işe yarar |
|---|---|---|
| `MONGODB_URI` | Evet | Veritabanı bağlantı adresi |
| `MONGO_MAX_POOL_SIZE` / `MIN_POOL_SIZE` | Hayır | Bağlantı havuzu ayarı, varsayılan yeterli |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Evet | Oturum token imzalama anahtarları — üretime almadan önce mutlaka değiştirin |
| `PORT` | Hayır (varsayılan 3001) | API sunucusunun dinlediği port |
| `NODE_ENV` | Evet (`production`) | Geliştirme/üretim davranış farkı (rate limit, cookie güvenliği vb.) |
| `CLIENT_URL` | Evet | Kendi alan adınız — CORS ve e-posta linklerinde kullanılır |
| `PALACE_API_BASE` / `_TOKEN` / `_CALLBACK_TOKEN` | Casino modülü kullanılacaksa | Casino içerik sağlayıcısı erişim bilgileri (bkz. [03 — Modül Sistemi](03-modul-sistemi.md)) |
| `USDT_TRY_RATE` / `TRONGRID_API_KEY` | Kripto ödeme kullanılacaksa | USDT-TRC20 yatırma takibi |
| `AI_HELP_*` | Hayır | Yardım widget'ı için LLM sağlayıcı ayarı |
| `SMTP_*` | Evet | E-posta doğrulama ve şifre sıfırlama e-postaları için |
| `SENTRY_DSN` / `ALERT_WEBHOOK_URL` | Hayır (önerilir) | Hata izleme ve operasyonel uyarılar |
| `TURNSTILE_SITE_KEY` / `_SECRET` | Hayır | Cloudflare Turnstile bot koruması |
| `ADMIN_ALLOWED_IPS` | Hayır | Admin paneline IP kısıtlaması, virgülle ayrılmış liste |
| `DISABLE_TURNSTILE` | Hayır | `true` ise Turnstile kontrolü atlanır (geliştirme için) |
| `LEGAL_VERSION` | Hayır | Kullanım şartları sürüm etiketi, kayıt formunda gösterilir |
| `ODDS_PROVIDER` | Hayır (varsayılan `oddsSource`) | Aktif odds sağlayıcısını seçer — `theoddsapi` yapılırsa lisanslı The Odds API'ye geçilir |
| `ODDS_API_KEY` / `ODDS_API_SPORT` | `ODDS_PROVIDER=theoddsapi` ise zorunlu | The Odds API erişim anahtarı ve spor kodu (bkz. [05 — API Referansı](05-api-referansi.md)) |

> Düzeltme notu: bu belgenin önceki sürümü `ODDS_API_KEY`'i kullanılmayan
> bir kalıntı olarak işaretlemişti — o zaman doğruydu, artık değil.
> T2 kartıyla birlikte gerçek bir sağlayıcıya (The Odds API) bağlandı.

> **Bilinen sınır:** `ODDS_PROVIDER` yukarıdaki tablonun ima ettiğinin
> aksine canlı/fikstür senkronizasyon job'larının HANGİSİNİN çalışacağını
> seçmiyor — `server.js`, `startoddsSourceLiveSync`/`startoddsSourceUpcomingSync`'i
> bu ayardan bağımsız, koşulsuz başlatıyor. Bu job'lar her zaman oddsSource'in
> ayna domain'ini keşfedip WebSocket'le bağlanır; `ODDS_PROVIDER=theoddsapi`
> yapmak yalnızca ayrıştırma mantığını etkiler, bu trafiği durdurmaz. Tam
> sağlayıcı değişimi — theoddsapi için yeni bir senkronizasyon job'ı yazmak
> ve `server.js`'i aktif sağlayıcıya göre doğru job'ı başlatacak şekilde
> güncellemek — ayrı, henüz yapılmamış bir mühendislik kartı gerektiriyor.

## Panelden yönetilen ayarlar

Bu ayarlar `.env`'de değil, veritabanında (`Setting` koleksiyonu) tutulur
ve admin panelinden anında değiştirilebilir — sunucu yeniden başlatmaya
gerek yoktur (değişiklikler 30 saniyelik bir önbellek gecikmesiyle
yayılır):

- **Alarm kanalları** — Telegram bot token/chat id, webhook URL, uyarı
  e-postası. `/admin/settings`.
- **Tema token'ları** — birincil renk, vurgu rengi ve ilgili görsel
  değerler. `GET /api/theme` üzerinden istemciye enjekte edilir,
  değişiklik tüm arayüze anında yansır.
- **Modül durumu** — hangi ek modüllerin (bahis, casino içeriği, canlı
  casino) açık olduğu. Şu an yalnızca kod seviyesinde bir kayıt defteri
  var; panelden açma/kapama ekranı henüz eklenmedi (bkz.
  [03 — Modül Sistemi](03-modul-sistemi.md)).

## Casino sağlayıcısı

Casino oyun kataloğu, `CASINO_AGGREGATOR` ortam değişkeniyle seçilen bir
sağlayıcı üzerinden gelir (varsayılan: `palace`). Bugün yalnızca Palace
adaptörü mevcut; ikinci bir sağlayıcı eklemek (Evolution, Pragmatic,
lisanslı bir aggregator) yeni bir adaptör yazıp kayıt defterine
eklemekten ibarettir — mevcut route/kontrol kodu değişmez.
