# Sistem E-postaları (admin/mail-templates)

Sistem tarafından otomatik gönderilen e-postaların içeriği admin panelinden
düzenlenir: **İletişim → E-posta → Şablonlar** (`/admin/communications?channel=email`).
Eski `/admin/mail-templates` rotası bu adrese redirect edilir. Panel metinleri
8 dilde (`tr/en/ko/th/es/ja/pt/de`) i18n anahtarıyla gelir.

## Ne yapar

| Kategori | Ne zaman gönderilir | Panelden elle gönderim |
| --- | --- | --- |
| `action` — aksiyona bağlı | Sistem olayı anında (kayıt, doğrulama, bahis sonuçlanma, casino oturum kapanışı, yatırım, çekim, KYC) | **Hayır** (`400 MAIL_ACTION_TRIGGER_ONLY`) |
| `scheduled` — zamana duyarlı | Zamanlanmış iş + panelde "Şimdi gönder" | **Evet**, kitle seçilerek |

Kitle tipleri: `all` (tüm kullanıcılar), `segments` (belirli segmentler),
`users` (belirli kullanıcılar), `inactive` (belirli süredir online olmayanlar).

Kitleye giren kullanıcılar: e-postası olan, **silinmemiş** (`deletedAt: null` —
alan `null` olduğu için `$exists:false` kullanılamaz) ve bot olmayanlar.
Segment kriterleri `buildQueryFromCriteria` ile çözülür; `vipLevel` kriteri
seviye NUMARASI aralığıdır ve `VipLevel.level` üzerinden ObjectId'lere çevrilir
(aksi halde `Cast to ObjectId` hatası fırlatır). Olay adları panelde
`admin.mailTemplates.event.<olay>` anahtarından çevrilir.

## Kod haritası

```
server/src/services/mailTemplates.js   MAIL_EVENTS kataloğu, DEFAULT_TEMPLATES (demo),
                                       render, CRUD, 30sn önbellek, ensureDefaultMailTemplates
server/src/services/systemMail.js      sendActionMail, resolveAudience, sendBulk,
                                       runDueScheduledMails, startScheduledMailJob
server/src/models/SystemMailTemplate.js  şablon (event unique, audience/schedule/stats)
server/src/models/SystemMailLog.js       gönderim logu
server/src/routes/adminMailTemplates.js  /api/admin/mail-templates rotaları
server/src/controllers/adminMailTemplates.js
server/src/validators/adminMailTemplates.js  zod şemaları
client/src/pages/admin/MailTemplates.jsx    panel sayfası
```

Rotalar `routes/admin.js`'te `/mail-templates` altında mount edilir; sidebar
öğesi 2026-10-06'da `admin.nav.communication` hub'ıyla birleşti
(`adminNav.config.js` → engagement grubu), `App.jsx`'teki eski rota
`?channel=email` redirect'ine düşer.

## SMTP ayarları — Modules → Email Gateway (2026-10-06)

Sağlayıcı kimlik bilgileri şablon sayfasında DEĞİL, **Modüller → Email
Gateway** kartında (`EmailProviderPanel`). İletişim → E-posta → Provider
sekmesi bu tarihte kaldırıldı.

- **Gateway anahtarı (kart başlığındaki switch — Core rozetinin yerine,
  kart listenin sonunda):**
  - **Açık (varsayılan):** transport panel/DB ayarlarını kullanır
    (`DB > env`, eski davranış — `emailConfig.getAll()`).
  - **Kapalı:** transport **yalnızca sunucu `.env` SMTP'sine** kurulur
    (`emailEnvView()`); paneldeki `smtp.*` DB değerleri bilerek girmez.
    Panelde rozet "Sunucu SMTP (.env)" olur.
- Sunucu anahtarı: `smtp.gatewayEnabled` (Setting) > `SMTP_GATEWAY_ENABLED`
  env > default `'true'`. Alan `PUT /admin/settings/email` gövdesinde
  boolean/`'true'|'false'|''` gelir; boş gönderim DB kaydını silip default'a
  döner.
- Mod, transport imzasının parçasıdır: anahtar değişince transport yeniden
  kurulur (aynı host değeriyle bile). Gönderim/test yolları
  (`sendActionMail`, `sendBulk`, `POST /admin/settings/email/test`) hepsi
  `getTransporter()` üzerinden aynı seçimi uygular.
- Gateway kapalı + `.env`'te `SMTP_HOST` yoksa gönderim `SMTP_NOT_CONFIGURED`
  ile reddedilir (panel değeri olsa bile — kapı kasıtlıdır).

## Olay (`event`) kataloğu

`MAIL_EVENTS` tek doğruluk kaynağıdır: hangi olayın hangi kategoride olduğu ve
o olay için kullanılabilir `{{değişken}}` havuzu. Paneldeki "değişkenler"
çipleri de buradan gelir.

- **aksiyon (10):** `user.emailVerify`, `user.welcome`, `user.passwordReset`,
  `user.passwordChanged`, `kyc.approved`, `kyc.rejected`, `bet.settled`,
  `casino.sessionClosed`, `wallet.depositCompleted`, `wallet.withdrawalCompleted`
- **zamana duyarlı (3):** `campaign.broadcast`, `campaign.inactiveUsers`,
  `campaign.reactivation`

> `COMMON_VARIABLES`: `siteName`, `username`, `currency`, `supportEmail`,
> `currentYear`, `siteUrl` — her olaya otomatik eklenir.

Olay başına **tek** şablon vardır (unique index). Yeni olay eklemek için
`MAIL_EVENTS` + `DEFAULT_TEMPLATES` (isteğe bağlı) + tetikleyen koda
`sendActionMail(...)` çağrısı gerekir.

## Demo verisi

`DEFAULT_TEMPLATES` 7 hazır içerik tanımlar (aksiyon + zamana duyarlı örneği
birden içerir). `ensureDefaultMailTemplates()` sunucu açılışında
(`server/src/server.js`) **yalnızca eksik** kayıtları ekler; mevcut admin
dokümanlarını asla ezmez.

DemoData kategorisine satır **eklenmez** — `demoData-registry.test.js` tam
olarak 8 kategori (`users,sports,casino,kyc,risk,tickets,agents,payments`)
assert eder.

## Şablon sözdizimi

- `{{değişken}}` — gövdede HTML kaçırılır (değerler `&lt;` olur), konu başlığında kaçırılmaz.
- `{{#if x}}…{{/if}}` / `{{#unless x}}…{{/unless}}` — iç içe desteklenir (en-İÇTEKİ blok önce eşleşir).
- `preheader` — gelen kutusu önizlemesi, gövdeye gizlenir.
- `ctaLabel` + `ctaUrl` — render sonrası doluysa bulletproof buton + yedek bağlantı eklenir.
- Tasarım yardımcıları: `email.js` içindeki `layout/button/H1/P/NOTE` ve `.m-h1/.m-p/.m-note` CSS.

Önizleme panelde `POST /api/admin/mail-templates/preview` ile örnek verilerle
yapılır; gerçek alıcıya bir şey gönderilmez.

## Zamanlanmış gönderim

- `startScheduledMailJob()` boot'ta başlar (30sn gecikme, 15dk aralık).
- `schedule.nextSentAt` hiç hesaplanmamışsa iş **hemen göndermez**, yalnızca
  vadeyi kurar — sunucu açılışında toplu patlama olmaz. İlk gönderim
  paneldeki "Şimdi gönder" ile yapılır.
- Toplu gönderim sınırı: `MAIL_SEND_BATCH_LIMIT` (varsayılan 500, max 5000),
  eşzamanlılık 5. `matched > processed` ise sonuçta `truncated: true` döner.
- **SMS aynı modeli kullanır:** `SmsTemplate.schedule`/`audience` alan adları
  birebir aynı, 15 dk'lık `runDueScheduledSms` işi e-posta işiyle birlikte
  boot'ta başlar. Kampanyalar sekmesindeki "otomatik" rozeti her iki kanalda
  `schedule.enabled`'den okunur. Ayrıntı: `docs/sms-gateway/README.md` §12.

## Ortam değişkenleri

| Değişken | Etki |
| --- | --- |
| `MAIL_SYSTEM_DISABLED=true` | Tüm gönderimi kapatır (`503 MAIL_SYSTEM_DISABLED` dahil) |
| `MAIL_SEND_BATCH_LIMIT` | Tek seferde işlenecek alıcı üst sınırı |
| `CLIENT_URL` | Şablonlardaki `{{siteUrl}}` |
| `SMTP_URL` / SMTP_* | `sendEmail` gerçek gönderimi (yoksa mock) |

## Guard'lar

`sendActionMail` hiçbir zaman çağıranı düşürmez — hata/log kaydeder ve
`{ status }` döner:

`system_disabled` · `no_db` · `not_action_event` · `disabled` ·
`no_template` · `no_recipient` · `bot_user` · `no_fallback` · `failed`

Ek olarak `bet.isSeed` ve `metadata.isSeed` kayıt tohumu e-postaları tetiklemez.

## API

| Metot | Yol | İzin |
| --- | --- | --- |
| GET | `/api/admin/mail-templates?page&limit&search&category&enabled` | `admin:settings:read` |
| GET | `/api/admin/mail-templates/stats` | `admin:settings:read` |
| GET | `/api/admin/mail-templates/events` | `admin:settings:read` |
| GET | `/api/admin/mail-templates/logs?page&templateId&status` | `admin:settings:read` |
| POST | `/api/admin/mail-templates/preview` | `admin:settings:read` |
| GET | `/api/admin/mail-templates/:id` | `admin:settings:read` |
| POST | `/api/admin/mail-templates` | `admin:settings:write` |
| PATCH | `/api/admin/mail-templates/:id` | `admin:settings:write` |
| DELETE | `/api/admin/mail-templates/:id` | `admin:settings:write` (sistem şablonu `403`) |
| POST | `/api/admin/mail-templates/:id/send` | `admin:settings:write` |

Hata kodları: `MAIL_UNKNOWN_EVENT` 400 · `MAIL_EVENT_TAKEN` 409 ·
`MAIL_ACTION_TRIGGER_ONLY` 400 · `MAIL_TEMPLATE_DISABLED` 400 ·
`MAIL_SYSTEM_TEMPLATE` 403 · `MAIL_NOT_FOUND` 404 · `MAIL_SYSTEM_DISABLED` 503.

Yeni izin tanımlanmadı — mevcut `admin:settings:read/write` kullanılır.

## Tetikleyici noktaları (değişiklik yaparken dikkat)

| Dosya | Olay |
| --- | --- |
| `controllers/auth.js` | `user.welcome`, `user.emailVerify`, `user.passwordReset`, `user.passwordChanged` (+ SMS: `userRegistered`, `emailVerified`) |
| `controllers/users.js` | `user.passwordChanged` |
| `models/Bet.js` (post save) | `bet.settled` (+ SMS: `betWon`/`betLost`) |
| `models/CasinoSession.js` (pre/post save) | `casino.sessionClosed` (+ SMS: `casinoSessionProfit`/`casinoSessionLoss`) |
| `services/ledger.js` | `wallet.depositCompleted`, `wallet.withdrawalCompleted` (+ SMS: `depositCompleted`/`withdrawalCompleted`) |
| `routes/crypto.js` | (+ SMS: `withdrawalRequested` — çekim talebi/pending anı) |
| `services/kyc.js` | `kyc.approved`, `kyc.rejected` |
| `routes/sumsubWebhook.js` | `kyc.approved`, `kyc.rejected` |

SMS kancaları `dispatchSmsEvent` ile fire-and-forget çağrılır; mail akışını
bekletmezler (`docs/sms-gateway/README.md` §5).

## Testler

```bash
node --test server/test/systemMail.test.js     # render, katalog, validatör, guard, CRUD
node --test client/src/i18n/*.test.js          # i18n anahtar doğrulama
node --test server/test/demoData-registry.test.js
```

`server/test/systemMail.test.js` lokal MongoDB'ye
`mongodb://localhost:27017/betzone_test_systemmail` bağlanır ve test sonunda
databeyi siler.
