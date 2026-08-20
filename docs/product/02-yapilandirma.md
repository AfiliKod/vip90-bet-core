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

`.env.example`'daki `ODDS_API_KEY` **kullanılmayan, kaldırılması gereken
bir kalıntıdır** — kodda hiçbir yerde okunmuyor, dosyada kafa
karıştırmasın diye burada not düşülüyor.

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
