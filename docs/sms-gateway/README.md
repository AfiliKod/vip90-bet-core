# SMS Gateway — Twilio entegrasyonu ve mesaj şablonları

**Tarih:** 2026-10-03 · **Dal:** `feat/sms-gateway-twilio` · **Worktree:** `.worktrees/sms-gateway`
**Kapsam:** SMS Gateway entegrasyonu ve kullanımı. E-posta bu işin parçası DEĞİLDİR.

> Bu doküman iki turda tamamlandı: (1) sağlayıcı ayarları + mesaj şablonları
> CRUD'u + gönderim, (2) **gönderici kaydı ve ülke/mevzuat onayı** (§11).

---

## 1. Ne eklendi

| Katman | Dosya | Ne yapar |
|--------|-------|----------|
| Modül kaydı | `server/src/modules/registry.js` | `sms-gateway` modülü (aç/kapa + lisans rozeti, `Modules.jsx` kartı) |
| Ayar deposu | `server/src/services/smsSettings.js` | Twilio kimlik bilgileri: DB önce, `.env` yedeği; Auth Token AES-256-GCM şifreli |
| Gönderim adaptörü | `server/src/services/smsGateway.js` | Twilio REST (native `fetch`), E.164 normalizasyonu, kuru bağlantı testi |
| Olay kayıt defteri | `server/src/services/smsEvents.js` | 11 aksiyon + 6 zaman olayı ve değişken listeleri |
| Şablon servisi | `server/src/services/smsTemplate.js` | CRUD, demo seed, alıcı çözümleme, gönderim, `dispatchSmsEvent` |
| Modeller | `server/src/models/SmsTemplate.js`, `SmsLog.js` | Şablonlar ve alıcı bazında gönderim kaydı |
| HTTP | `server/src/routes/smsTemplate.js` → `admin.js` `/sms` | `/api/admin/sms/*` |
| Doğrulama | `server/src/validators/smsTemplate.js` | zod şemaları |
| Controller | `server/src/controllers/smsTemplate.js` | DI'lı fabrika (test edilebilir) |
| Panel — ayar | `client/src/components/admin/SmsGatewayCard.jsx` | `Modules.jsx` içindeki `sms-gateway` kartının gövdesi |
| Panel — CRUD | `client/src/pages/admin/SmsTemplates.jsx` | Şablon listesi/CRUD/gönderim + gönderim günlüğü |
| Panel — saf mantık | `client/src/pages/admin/smsTemplateLogic.js` | Segment sayacı, placeholder çıkarımı (test edilebilir) |
| Gönderici kaydı | `server/src/models/SmsSender.js` | Numara/Servis + onay durumu + hedef ülkeler |
| Gönderici servisi | `server/src/services/smsSender.js` | CRUD + **gönderim kapısı** (`resolveSenderGate`) |
| Ülke tahmini | `server/src/services/smsCountries.js` | E.164 → ISO-3166 (küratörlü liste) |
| Panel — göndericiler | `client/src/pages/admin/SmsSenders.jsx` | Gönderici CRUD, hesap tipi, kapı durumu |
| Panel — ortak mantık | `client/src/utils/smsSenderLogic.js` | `toKeySegment` (enum → i18n anahtarı) |

---

## 2. İki tür mesaj — neden ayrım var?

| | `type='action'` (Sistem) | `type='scheduled'` (Zamana duyarlı) |
|---|---|---|
| Tetikleyen | Domain kodu (`dispatchSmsEvent`) | Operatör (panel) veya zamanlayıcı |
| `eventKey` | **Zorunlu** | Opsiyonel |
| Panelden gönderim | **Yapılamaz** (`SMS_ACTION_NOT_SENDABLE`) | Yapılabilir |
| Örnek | Kayıt, bahis kazandı/kaybetti, casino oturum kar/zararı, yatırım/çekim onayı, "we miss you" | Bonus bitiş uyarısı, haftalık bonus, turnuva duyurusu, kampanya |

Aksiyona bağlı mesajları panelden gönderilemez yapmak kasıtlıdır: bu mesajların
tetikleyicisi oyuncunun davranışıdır, operatörün kararı değil. Yanlış zamanda
veya yanlış kitleye elle gönderilmesi hem ürün hem mevzuat riskidir.

`type='scheduled'` şablonlarda `eventKey` verilirse aynı otomatik kancalar
kullanılabilir (örn. `bonusExpiring`); verilmezse yalnızca panelden gönderilir.

### Olay kayıt defteri

`server/src/services/smsEvents.js`:

```
action:    userRegistered, emailVerified, phoneVerified, depositCompleted,
           withdrawalRequested, withdrawalCompleted, betWon, betLost,
           casinoSessionProfit, casinoSessionLoss, inactiveReminder
scheduled: bonusStarting, bonusExpiring, weeklyBonus, birthdayBonus,
           tournamentReminder, campaignAnnouncement
```

Yeni olay eklemek: kayıt defterine bir satır + 8 sözlüğe
`admin.smsTemplates.event.<key>` girdisi. Anahtarlar camelCase olmalıdır
(`i18n/core.js` `KEY_RE` kuralı; tire ve alt çizgi yasak).

---

## 3. Panel

### 3.1 Sağlayıcı ayarları — Modüller → SMS Gateway

Kimlik bilgileri **buraya** girilir, şablonlar oraya değil.

> **2026-10-06 IA:** tek "Communication Providers" kartı kaldırıldı; sağlayıcı
> + gönderici alanları `sms-gateway` modül kartının gövdesine (`SmsGatewayBody`,
> tek parça) taşındı. İletişim → SMS altındaki **Sağlayıcı**/**Gönderici**
> sekmeleri bu tarihte kaldırıldı; `?channel=sms&sub=provider|sender` gibi
> eski yer imleri `normalizeSub` ile sessizce şablonlara düşer. E-posta için
> karşılığı Modules → **Email Gateway** kartıdır
> (`docs/mail-templates.md` → "SMTP ayarları").

| Alan | DB anahtarı | `.env` karşılığı |
|------|-------------|------------------|
| Sağlayıcı | `sms.provider` | `SMS_PROVIDER` |
| Account SID | `sms.twilio.accountSid` | `TWILIO_ACCOUNT_SID` |
| Auth Token | `sms.twilio.authToken` (**şifreli**) | `TWILIO_AUTH_TOKEN` |
| Gönderici numara | `sms.twilio.fromNumber` | `TWILIO_FROM_NUMBER` |
| Messaging Service SID | `sms.twilio.messagingServiceSid` | `TWILIO_MESSAGING_SERVICE_SID` |
| Varsayılan ülke kodu | `sms.twilio.defaultCountryCode` | `TWILIO_DEFAULT_COUNTRY_CODE` |

Kurallar:

- **`configured` üç parçayı da ister:** Account SID + Auth Token + gönderici
  (From numarası **veya** Messaging Service SID). Yalnız provider girilmişse
  test/gönderim `SMS_NOT_CONFIGURED` ile döner. Eksik parçalar
  `GET /admin/sms/settings` yanıtındaki `missing` alanında listelenir
  (`accountSid|authToken|sender`); panelde "Eksik alanlar" kutusu olarak
  görünür. Messaging Service SID **isteğe bağlıdır** (Twilio Console →
  Messaging → Messaging Services → SID); yoksa From numarası tek başına
  yeterlidir.
- **DB önce, `.env` yedeği.** Panelde `db` / `env` / unset rozeti gösterilir.
- **Boş bırakılan alan değiştirmez.** Kaynak `.env` ise alan boş gelir —
  paneldeki bir kayıt, sunucu tarafı yapılandırmayı sessizce ezmez.
- **Auth Token düz metne döner, geri dönmez.** Şifreleme anahtarı yoksa
  (`OPERATOR_SECRET_ENCRYPTION_KEY`) token DB'ye **yazılmaz**; panelde uyarı
  çıkar ve `SMS_ENCRYPTION_KEY_MISSING` hatası döner. Kayıtlı token panelde
  yalnız maskeli önizleme (`abcd…wxyz`) + "Panel" rozetiyle görünür.
- **"Bağlantıyı Test Et" mesaj GÖNDERMEZ.** Twilio `GET /Accounts/{Sid}.json`
  ucunu okur; tek kuruş maliyeti yok, yanlış token canlı mesajla değil kuru
  çalışmayla yakalanır.
- **Hata metinleri istemcide çevrilir.** Sunucu Türkçe mesaj + `code`
  döndürür; bilinen kodlar (`SMS_NOT_CONFIGURED`, `SMS_ENCRYPTION_KEY_MISSING`,
  `SMS_CREDENTIALS_MISSING`, `SMS_SENDER_MISSING`, …) arayüzde
  `admin.smsGateway.error.<code>` anahtarından çevrilir (kod camelCase: `SMS_NOT_CONFIGURED` → `smsNotConfigured`) — İngilizce panelde
  Türkçe metin görünmez.

### 3.2 Mesaj şablonları — İletişim → SMS → Şablonlar

Ana yol `?channel=sms&sub=templates` (eski `/admin/sms-templates` rotası bu
adrese redirect edilir). Modules → SMS Gateway kartında "Yönet →" linki
yok (2026-10-06 IA — kartlardan licence/yönet etiketleri kaldırıldı);
şablonlara erişim sidebar **Communication** hub'ından veya eski rota
redirect'inden yapılır.

- **Şablonlar sekmesi:** KPI şeridi, arama (300 ms debounce), tür filtresi,
  tablo (başlık/key, tür, olay+ kategori, içerik + segment sayacı, durum
  anahtarı, gönderim sayacı, aksiyonlar). Satır aksiyonları: **Gönder**
  (yalnız `scheduled`), **Düzenle**, **Sil**.
- **Gönderim günlüğü sekmesi:** son 200 kayıt, durum sayaçları ve hata mesajı.
- **Form:** başlık, tür, olay, kategori, mesaj metni, aktif/pasif. Olay
  seçilince kullanılabilir değişkenler çip olarak listelenir; tıklanınca
  `{{değişken}}` olarak eklenir. Olayda tanımsız değişken kullanılırsa uyarı
  çıkar.
- **Gönderim modalı:** hedef kitle (seçili kullanıcılar / tüm kullanıcılar /
  bir segment) + olayın değişken alanları (`username` hariç — otomatik dolar).

### 3.3 Segment sayacı (70 mı 160 mı?)

`admin.smsTemplates.charInfo` satır başına segment sayısını gösterir. Türkçe
`ğ Ğ ş Ş ı İ ç` GSM 03.38'de **yoktur**; bu karakterlerden biri varsa sınır
160 değil **70** olur ve mesaj daha çabuk iki parçaya bölünür. Sayaç
kod noktası bazlıdır (emoji tek karakter).

---

## 4. Gönderim kuralları

`sendTemplate()` sırayla şunları denetler ve **her birinde hiçbir mesaj
göndermeden** reddeder:

| Koşul | Hata kodu |
|-------|-----------|
| Şablon yok | `NOT_FOUND` |
| Şablon `type='action'` | `SMS_ACTION_NOT_SENDABLE` |
| Şablon pasif | `SMS_TEMPLATE_INACTIVE` |
| Kimlik bilgileri eksik | `SMS_NOT_CONFIGURED` |
| `sms-gateway` modülü kapalı | `SMS_MODULE_DISABLED` |
| Hedef kitle geçersiz / segment yok / kullanıcı seçilmedi | `SMS_AUDIENCE_INVALID` / `SMS_SEGMENT_REQUIRED` / `SMS_USERS_REQUIRED` |
| Segmentin **seçici kriteri yok** ("herkese açık") | `SMS_SEGMENT_TOO_BROAD` |

Sonra:

1. Alıcılar çözülür — yalnız `isActive: true` **ve** telefonu boş olmayanlar.
   Telefonu olmayan kullanıcı gönderim **denenmez** (sessiz `skipped` yerine
   sayısal özette `withoutPhone` mantığı: hiç denenmemek daha dürüst).
2. Gövde render edilir (`{{username}}` kullanıcı adı + `balance` otomatik).
   Bulunamayan değişken boş kalır ve `missing[]` içinde **raporlanır** — yarım
   mesaj sessizce gitmez.
3. Gönderim 5 eşzamanlılıkla yapılır, her mesaj `SmsLog`'a yazılır.
4. `sentCount`/`lastSentAt` yalnızca **başarılı** gönderimlerde artar.

**Kriteri olmayan segment reddedilir.** `buildQueryFromCriteria({})` boş sorgu
(= tüm kullanıcılar) üretir; toplu SMS'te bu "herkese gönder" olurdu. Bu
yüzden segmentin en az bir gerçek kriteri olmalıdır — operatör ya segmenti
tanımlar ya da bilinçli olarak **"tüm kullanıcılar"** seçer.

**Alıcı tavanı: `MAX_RECIPIENTS = 2000`.** Tek istekte daha fazlası kesilir ve
`capped: true` döner. SMS maliyeti para ve oyuncunun telefonuna giden geri
alınamaz bir iletişimdir; `all` seçilip yanlışlıkla milyonlarca kayda
gidilmesi tek tıkla engellenir.

### Telefon numarası normalizasyonu

Twilio E.164 ister:

```
"+90 532 111 22 33"   → +905321112233
"00905321112233"      → +905321112233
"0532 111 22 33"      → +905321112233   (yalnız defaultCountryCode=90 ise)
"0532 111 22 33"      → null            (ülke kodu bilinmiyor → tahmin EDİLMEZ)
```

Son satır kasıtlıdır: ülke kodu olmadan `+0…` bir numarayı sessizce yanlış
ülkeye atmak (ör. `+53` Kolombiya) mesajın sessizce kaybolmasına yol açar.

---

## 5. Domain kodunu bağlamak (aksiyon mesajları)

Tek giriş noktası (`server/src/services/smsTemplate.js`):

```js
import { dispatchSmsEvent } from '../services/smsTemplate.js';

// kayıt (controllers/auth.js) — user dokümanı doğrudan
dispatchSmsEvent('userRegistered', user, { balance: user.balance }).catch(() => {});

// bahis sonucu (models/Bet.js post-save) — yalnızca id varsa deps.userId
import('../services/smsTemplate.js')
  .then(({ dispatchSmsEvent }) => dispatchSmsEvent('betWon', null, {
    betId: String(this._id), amount: this.potentialWin, stake: this.stake,
    market: first.oddLabel || '', odds: this.totalOdds,
  }, { userId: this.userId }))
  .catch(() => {});
```

Sözleşme:

- **Asla throw etmez.** Hata yakalanır, konsola yazılır, `{ sent: 0, error }`
  döner. SMS hatası bahis sonucunu/çekim onayını bozmaz.
- Alıcı: `user` dokümanı VARSA o kullanılır; yalnız `deps.userId` verilmişse
  kimlikten yüklenir (`{ username, phone, balance }` seçimi).
- `{{username}}`, `{{balance}}` ve `{{currency}}` olay değişkeni verilmese de
  doldurulur (e-postadaki `commonVars` ile aynı davranış).
- Kullanılabilir şablon yoksa `NO_TEMPLATE`, kimlik yoksa `NOT_CONFIGURED`,
  modül kapalıysa `MODULE_DISABLED`, telefonu yoksa `NO_PHONE`,
  `userId` çözülemediyse `NO_USER` ile atlar.
- Her deneme `SmsLog`'a yazılır.

### Bağlı tetikleyiciler (2026-10-06)

| Olay | Tetikleyen yer | Alıcı |
|------|----------------|--------|
| `userRegistered` | `controllers/auth.js` — kayıt sonrası (mail `user.welcome` ile aynı an) | `user` dokümanı |
| `emailVerified` | `controllers/auth.js` — `verifyEmail` sonrası | `user` dokümanı |
| `depositCompleted` | `services/ledger.js` — `status: 'completed'` + `!metadata.isSeed` | `deps.userId` |
| `withdrawalCompleted` | `services/ledger.js` — aynı blok (banka çekimi anında `completed`'dir) | `deps.userId` |
| `withdrawalRequested` | `routes/crypto.js` — crypto çekim **talebi** (pending; admin onayı bekleyen tek akış) | `deps.userId` |
| `betWon` / `betLost` | `models/Bet.js` post-save — status `won`/`lost` (`cancelled` olayı yok) | `deps.userId` |
| `casinoSessionProfit` / `casinoSessionLoss` | `models/CasinoSession.js` post-save — `closed` + `netResult !== 0` | `deps.userId` |

**Katalogda olan ama bağlı olmayan olaylar** (Automations panelinde "bağlı
şablon" görünse de tetikleyen kod yok; bilgi amaçlıdır):

- `phoneVerified` — `User.phoneVerified` alanı var, doğrulama akışı yok.
- `inactiveReminder` — güvenli otomatik tetikleyici yok (günlük iş ile toplu
  SMS maliyeti operatör kararıdır). Mail karşılığı `campaign.inactiveUsers`
  kampanya kategorisidir; SMS kataloğunda `action` olarak durur.

---

## 6. Demo veri

`initDefaultSmsTemplates()` her boot'ta çalışır (`server/src/server.js`) ve
**15 demo şablon** ekler. Davranışı:

- `$setOnInsert` — operatörün düzenlemesi **asla ezilmez**.
- Operatörün **sildiği** demo anahtarı `Setting: sms.templates.demoState`
  içinde tombstone olarak tutulur, yeniden doğmaz.
  (Tombstone olmadan upsert, silinen kaydı bir sonraki restart'ta geri
  getirirdi.)

| Tip | `key` | Olay |
|-----|-------|------|
| action | `welcomeRegistered` | `userRegistered` |
| action | `emailVerifiedNotice` | `emailVerified` |
| action | `depositCompletedNotice` | `depositCompleted` |
| action | `withdrawalCompletedNotice` | `withdrawalCompleted` |
| action | `betWinNotice` | `betWon` |
| action | `betLossNotice` | `betLost` |
| action | `casinoSessionProfitNotice` | `casinoSessionProfit` |
| action | `casinoSessionLossNotice` | `casinoSessionLoss` |
| action | `weMissYou` | `inactiveReminder` |
| scheduled | `bonusStartingNotice` | `bonusStarting` |
| scheduled | `bonusExpiringNotice` | `bonusExpiring` |
| scheduled | `weeklyBonusNotice` | `weeklyBonus` |
| scheduled | `birthdayBonusNotice` | `birthdayBonus` |
| scheduled | `tournamentReminder` | `tournamentReminder` |
| scheduled | `campaignAnnouncement` | `campaignAnnouncement` |

Hepsi panelde **düzenlenebilir** satırlar olarak görünür; demo rozeti yoktur,
çünkü DB'de gerçek kayıttırlar.

---

## 7. API

| Yöntem | Yol | Yetki |
|--------|-----|-------|
| `GET` | `/api/admin/sms/templates?search=&type=&isActive=` | `admin:settings:read` |
| `POST` | `/api/admin/sms/templates` | `admin:settings:write` |
| `PATCH` | `/api/admin/sms/templates/:id` | `admin:settings:write` |
| `DELETE` | `/api/admin/sms/templates/:id` | `admin:settings:write` |
| `POST` | `/api/admin/sms/templates/:id/send` | `admin:settings:write` |
| `POST` | `/api/admin/sms/test-send` | `admin:settings:write` |
| `GET` | `/api/admin/sms/logs?status=&limit=` | `admin:settings:read` |
| `GET` | `/api/admin/sms/settings` | `admin:settings:read` |
| `PATCH` | `/api/admin/sms/settings` | `admin:settings:write` |
| `POST` | `/api/admin/sms/settings/test` | `admin:settings:write` |

`POST /test-send` gövdesi `{ to, message }` — şablonsuz tek test mesajı
(same kapılar: gateway + modül; sonuç `SmsLog`'a `templateId: null` düşer).

`POST`/`PATCH` şablon gövdeleri `type='scheduled'` iken `audience`
(`{ type: 'all'|'segment'|'users', segmentId, userIds }`) ve `schedule`
(`{ enabled, intervalHours }`) kabul eder — otomatik gönderim için (§12).

Hata gövdesi global `errorHandler` ile `{ error: { code, message } }`.
`POST /settings/test` yapılandırılmamışsa `200` + `{ ok:false, code:'SMS_NOT_CONFIGURED', missing:[…] }`
döner (ağ çağrılmaz). `GET /settings` yanıtına `missing: ['accountSid'|'authToken'|'sender']`
eklenmiştir; `configured` bu listenin boşluğuyla eşanlamlıdır.

---

## 8. Demo hesabı ile kurulum

Kimlik bilgileri **koda yazılmaz** (AI-GITHUB-WORKFLOW-POLICY §8). İki yol:

**A) .env (yerel/demo — önerilen)**

```bash
# .env  (gitignored)
OPERATOR_SECRET_ENCRYPTION_KEY=<64 hex karakter>   # openssl rand -hex 32
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+90XXXXXXXXXX
TWILIO_DEFAULT_COUNTRY_CODE=90
```

**B) Panelden** — Modüller → SMS Gateway, alanları doldurup Kaydet.
Auth Token şifrelenerek DB'ye yazılır.

Sonra: Modüller → SMS Gateway anahtarını **aç** (`sms-gateway` modülü kapalıyken
gönderim `SMS_MODULE_DISABLED` ile reddedilir) ve SMS Mesajları sayfasından
bir `scheduled` şablonu tek bir kullanıcıya göndererek uçtan uca doğrula.

---

## 9. Testler

| Dosya | Kapsam | DB |
|------|--------|----|
| `server/test/smsAdmin.test.js` | Saf yardımcılar, olay defteri, telefon normalizasyonu, Twilio adaptörü (enjekte `fetchImpl`), zod şemaları, controller DI fabrikası (testSend dahil) | yok |
| `server/test/smsTemplateDb.test.js` | Seed idempotliği + tombstone, CRUD, alıcı çözümleme, gönderim kuralları, `dispatchSmsEvent` | `betzone_test_sms` |
| `server/test/sendTestSms.test.js` | Test mesajı: kapılar (gateway/modül), SmsLog `templateId=null`, sağlayıcı hatası, log listeleme | `betzone_test_sms_testsend` |
| `server/test/smsScheduledJob.test.js` | Kitle + vade CRUD kuralları (`SMS_*` hata kodları), `runDueScheduledSms`: arm-only ilk vade, segment kitleye gönderim + vade ilerletme, pasif/kapalı/aksiyon eleme, hata sonrası vade sabit, `deps.userId` ile alıcı | `betzone_test_sms_job` |
| `client/src/pages/admin/smsTemplateLogic.test.js` | GSM-7/Unicode segment sayacı, placeholder çıkarımı | yok |
| `client/src/pages/admin/communications/communicationsLogic.test.js` | KPI/satır normalizer'ları, olay kataloğu, kampanya satırları (SMS `schedule` dahil), audience etiketleri | yok |
| `client/src/i18n/smsParity.test.js` | `admin.smsGateway.*` + `admin.smsTemplates.*` anahtarları × 8 dil: varlık, boş değer, anahtar biçimi, yer tutucu eşleşmesi, İngilizce kopya oranı | yok |
| `client/src/i18n/communicationsParity.test.js` | `admin.communications.*` + `admin.communicationProviders.*` + `admin.emailSettings.*` paritesi | yok |
| `server/test/moduleRegistry.test.js` | `sms-gateway` kaydı (güncellendi) | yok |
| `server/test/routeWiring.test.js` | Yeni router + validator import (güncellendi) | yok |

`npm test` kapsamına `client/src/pages/admin/*.test.js` glob'u eklendi
(mantık testi `pages/admin/` altında yaşıyor).

---

## 10. Bilinçli kapsam dışı

- **E-posta.** Bu iş yalnız SMS Gateway'i kapsar; mail şablonları/CRUD ayrı
  iştedir (`docs/mail-templates.md`).
- **OTP / doğrulama SMS'i.** `phoneVerified` olayı tanımlı, akışı yok.
- **`inactiveReminder` tetikleyicisi.** Güvenli otomatik tetik yok (bkz. §5);
  operatör isterse manuel kampanya olarak kullanır.
- **Toplu gönderim kuyruğu.** Senkron gönderim; 2000 alıcı tavanı bunu
  makul tutuyor. Daha büyük ölçek için iş kuyruğu (job) gerekir.
- **Rate limit / opt-out (STOP) yönetimi.** Twilio tarafında `Advanced
  Opt-Out` açılmalıdır; panel tarafında abonelik listesi yok.
- **Segment üyeliği önbelleği.** Segment kriteri gönderim anında canlı
  sorguya çevrilir (`buildSegmentQuery`).
- **Opt-out listesi / abonelik tercihi** (panelde).
- **Lisans muafiyeti kararı.** `slikair-payment` `licenseExempt: true` ile
  lisans sunucusuna bağlı değil; `sms-gateway` için bu bayrak **bilinçli olarak
  konulmadı** — ticari/lisans kararıdır. `LICENSE_SERVER_URL` tanımlı değilse
  (varsayılan kurulum) tüm modüller yerinde geçerli sayılır, dolayısıyla
  kurulumda sorun çıkmaz. Sunucu SMS'i engellemez: gönderim yalnız admin
  anahtarını (`isEnabled`) denetler.

### Bu işte düzeltilen önceden var bir segment hatası

`buildQueryFromCriteria()` sayısal aralıkları `!== null` ile denetliyordu;
`undefined` de bu testi geçtiği için **kriteri tanımlanmamış** bir alan
operatörsüz `{ vipLevel: {} }` üretiyordu — Mongo'da bu "boş dokümanla tam
eşleşme" demek, yani segment sessizce **hiç kimseyi** bulmak demekti.
`typeof === 'number'` denetimine çevrildi (`isActive`/`isBot` için de aynı).
Bu değişiklik `playerSegment.test.js` dahil mevcut segment davranışını bozmuyor
(aynı test dosyası baseline'da 7/7, değişiklikten sonra 7/7).

---

---

## 11. Gönderici kaydı ve ülke/mevzuat onayı

### 11.1 Neden ayrı bir ekran gerekiyor

Twilio'da bir numaranın mesaj gönderebilmesi **tek bir kapı değil**, üst üste
binen kapılara bağlıdır. Bu kurallar panelde görünmezse operatör, mesajın neden
gitmediğini yalnız Twilio hata kodundan öğrenir:

| Kural | Kaynak | Etkisi |
|-------|--------|--------|
| **Trial hesap: yalnız doğrulanmış alıcılara** | Trial kısıtı | Hesap başına en fazla 5 numara |
| **Trial hesap: yalnız kayıt ülkesine** | Coğrafi kısıt | Farklı ülkeye gidemez |
| **Trial hesap: Twilio kendi şablonunu ekler** | Trial kısıtı | Kendi mesaj metniniz teslim edilmez |
| **Trial hesap: 30 gün sonra sona erer** | Trial kısıtı | Süre dolunca gönderim durur |
| **A2P 10DLC (ABD/Kanada uzun numara)** | Mevzuat | Marka + kampanya kaydı zorunlu, **ücretli hesap şartı** |
| **Toll-free doğrulaması** | Mevzuat | ABD/Kanada'ya gönderim için doğrulama gerekli |
| **Yerel gönderici (sender ID) ön kaydı** | Ülkeye göre değişir | Kayıtsız gönderici reddedilir |

Kaynak: Twilio Error & Warning Dictionary (`twilio.com/docs/api/errors`) ve
"Get started with your Twilio free trial account" belgesi. Doğrulanan hata
kodları `server/src/services/smsGateway.js` → `TWILIO_ERROR_MEANINGS` içinde
**kod → anlam** eşlemesiyle durur; panel bunları i18n'li açıklamaya çevirip
gönderim günlüğünde gösterir.

Bu hesabın gerçek durumu (Twilio API'sinden, varsayım değil):

```
type        : Trial
numara      : +1•••••••  (ABD trial numarası)
son mesaj   : +90•••••••••55 → delivered
              body: "Sent from your Twilio trial account - ahoy 🫡"
```

> Alıcı numarası bilinçli olarak **maskelendi**. Bu belge ve PR gövdeleri
> repo ekibine görünür; bir kişinin cep telefonu burada yazmamalı. Maskeli
> biçim bile yeterli: denilen şey gönderilen numara değil, hesabın davranışı.

Kısacası: **ücretsiz demo hesabı, yalnız panelde
kayıtlı/doğrulanmış numaraya SMS gönderebiliyor.** Panel bunu artık
"keşfedene kadar hata kodu okuyarak" değil, açık bir rozetle söylüyor.

### 11.2 Ekran

**Göndericiler ekranı** (`pages/admin/SmsSenders.jsx`).

Ekran **Modules → SMS Gateway** kartının içinde açılır ("Göndericileri
yönet"; 2026-10-08'den beri). 2026-10-06 ile 2026-10-08 arasında hiçbir
rotadan erişilemiyordu: `/admin/sms-templates` yönlendirmesi `?tab=senders`
parametresini düşürüyordu ve İletişim sayfasında SMS için gönderici sekmesi
yok (§8 kararı gereği gelmeyecek). Kart kapatıldığında gönderim durumu
rozeti yenilenir. API: `GET/POST /api/admin/sms/senders`,
`PATCH/DELETE /api/admin/sms/senders/:id`, `GET /api/admin/sms/senders/gate`.

Ekranın içeriği:

- **Hesap Tipi** kartı: `Trial (ücretsiz demo)` / `Ücretli` / `Bilinmiyor`.
  Gerçek değer **Twilio API'sinden** okunur (`GET /Accounts/{sid}.json` →
  `type`) ve yalnız operatör elle bir değer girmediyse saklanır. Panelden
  değiştirilebilir.
- **Gönderim Durumu** kartı: `Hazır` / `Engelli — gönderim yapılamaz` + neden.
- Trial ise dört kuralı gösteren uyarı bandı.
- Tablo: gönderici, ülke, kayıt türü, **onay durumu**, hedef ülkeler, aktif.

**Modüller → SMS Gateway** kartına da özet düşer: hesap tipi rozeti, gönderim
durumu ve "Göndericileri yönet" bağlantısı.

### 11.3 Kayıt alanları

| Alan | Anlamı |
|------|--------|
| `senderNumber` | E.164 uzun numara / sender ID |
| `messagingServiceSid` | Varsa `From` gönderilmez (Twilio ikisini kabul etmez) |
| `senderCountry` | Numarayı **veren** ülke (ISO-3166 alpha-2) |
| `capability` | long_code / short_code / toll_free / alphanumeric / sender_id / messaging_service |
| `registrationType` | none / a2p_10dlc / toll_free / local_sender_id / alphanumeric |
| `approvalStatus` | not_required / not_submitted / pending / approved / rejected / expired / suspended |
| `destinationCountries` | Onaylı **hedef** ülkeler; boş = kısıt yok |
| `trialVerifiedNumbers` | Trial'da gönderilebilecek numaralar (Twilio sınırı: 5) |
| `isActive` | Aynı anda en fazla **bir** aktif gönderici |

### 11.4 Gönderim kapısı

`services/smsSender.js` → `resolveSenderGate()`, `sendTemplate()` içinde
alıcı başına çalışır.

**Kayıt/hesap seviyesi → tüm gönderim durur:**

| Koşul | Hata |
|-------|------|
| Ücretli hesap + aktif gönderici yok ya da `approved`/`not_required` değil | `SMS_SENDER_NOT_REGISTERED` |
| Gateway `fromNumber`/`messagingServiceSid` ile kayıt eşleşmiyor | `SMS_SENDER_MISMATCH` |

**Alıcı seviyesi → yalnız o alıcı atlanır** (kampanya iptal edilmez):

| Koşul | Hata |
|-------|------|
| Trial + liste dolu + numara listede değil | `SMS_TRIAL_NUMBER_NOT_VERIFIED` |
| Trial + `trialSignUpCountry` beyan edilmiş + alıcı ülkesi farklı | `SMS_TRIAL_COUNTRY_DENIED` |
| `destinationCountries` dolu + alıcı ülkesi listede değil | `SMS_SENDER_COUNTRY_DENIED` |
| Numara E.164'e çözümlenemedi | `SMS_INVALID_PHONE` |

Gönderim özeti `skipReasons` ile neden kırılımı döner; her atlanan alıcı
`SmsLog`'a `skipReason` ile yazılır; günlük ekranında insan diliyle görünür.

### 11.5 Kasıtlı kararlar

1. **Trial hesapta onay zorunluluğu UYGULANMAZ.** A2P 10DLC kaydı resmen
   ücretli hesap şartı; trial hesapta "onay bekliyor" durumu hiçbir zaman
   "approved" olmayacağı için kapı sonsuza kapalı kalırdı ve trial'da tek bir
   test SMS bile gönderilemezdi. Trial'da asıl kısıt doğrulanmış numara +
   kayıt ülkesidir.
2. **Varsayılan hesap tipi `unknown`, `paid` DEĞİL.** `paid` varsaymak trial
   hesapta yanlış olurdu (kısıtlar uygulanmaz, Twilio 14111 döner, mesajlar
   boşa gider). `trial` varsaymak ise ücretli hesapta gönderimi gereksiz
   engellerdi. Belirsizlikle engellemiyoruz, panel uyarıyor.
3. **Kayıt ülkesi ≠ gönderici ülkesi.** ABD trial numarası Türkiye'ye de
   gönderebilir; trial'in coğrafi kısıtı **kayıt ülkesine** aittir ve bu bir
   hesap özelliğidir (`sms.trialSignUpCountry`).
4. **Liste boşsa engellenmez.** `trialVerifiedNumbers` boşken operatörün
   Twilio'da doğruladığı ama bize bildirmediği numaralara izin verilir (Twilio
   zaten 14111 döner, bu kod log'a düşer ve panelde anlamı çevrilerek görünür).
   Liste **doluysa** operatörün beyanı esas alınır.
5. **E.164 → ülke tahmini küratörlü.** `User` şemasında `country` alanı yok
   (segment kriterleri `query.country` kullanıyor ama strict mode'da düşüyor).
   `services/smsCountries.js` 57 ülke için E.164 öneki eşlemesi yapar; listede
   olmayan numarada ülke `null` döner ve **ülke kısıtı uygulanmaz** — karar
   Twilio'nun 30041/30040 hata kodlarına bırakılır. Devasa bir telefon→ülke
   tablosu küratörlü bir listeden daha dürüst.

### 11.6 Yeni uçlar

| Yöntem | Yol | Yetki |
|--------|-----|-------|
| `GET` | `/api/admin/sms/senders` | `admin:settings:read` |
| `GET` | `/api/admin/sms/senders/gate` | `admin:settings:read` |
| `POST` | `/api/admin/sms/senders` | `admin:settings:write` |
| `PATCH` | `/api/admin/sms/senders/:id` | `admin:settings:write` |
| `DELETE` | `/api/admin/sms/senders/:id` | `admin:settings:write` |

`POST`/`PATCH` yanıtı `rejectedTrialNumbers` döner: E.164'e çözümlenemeyen
trial numaraları **sessizce atılmaz**, panelde hangisinin neden kaydedilmediği
görünür (`admin.smsSenders.savedWithRejected`).

### 11.7 Demo hesabıyla yapılandırma (`.env`)

`.env` **gitignored**'dır; kimlik bilgileri koda yazılmaz.

```bash
# worktree/server/.env
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC…
TWILIO_AUTH_TOKEN=…
TWILIO_FROM_NUMBER=+1…             # hesabın kendi numarası (Twilio panelinden)
TWILIO_DEFAULT_COUNTRY_CODE=90
```

Panelden de düzenlenebilir: DB değeri `.env` yedeğini **ezer** (rozet `db`
olur). Kaynak `.env` ise alan bilerek boş bırakılır ve gerçek değer
`.env değeri: …` olarak altında gösterilir — yoksa sahte bir placeholder
operatörü yanıltırdı.

Denemek için: Modüller → SMS Gateway → **Bağlantıyı Test Et** (mesaj göndermez,
hesap tipini algılar) → aynı kartta **Göndericileri yönet** → trial
numaralarına doğrulanmış numarayı ekleyin. Liste boşken gönderim
`SMS_TRIAL_NUMBER_NOT_VERIFIED` ile **atlanır** (Twilio'ya hiç gidilmez).

---

## 12. Otomatik gönderim (zamanlanmış SMS + 15 dk iş)

E-postadaki `runDueScheduledMails` modeliyle **aynı alan adları**: SMS
`SmsTemplate` kaydı `type='scheduled'` iken

- `audience` — `{ type: 'all'|'segment'|'users', segmentId, userIds }`.
  **Otomatik gönderim all/segment ile sınırlıdır** (`users` yalnız elle
  gönderimde; form bu seçeneği sunmaz, validator `SMS_AUTO_AUDIENCE_INVALID`
  ile reddeder).
- `schedule` — `{ enabled, intervalHours, lastSentAt, nextSentAt }`.

İş: `runDueScheduledSms()` + `startScheduledSmsJob()` (`services/smsTemplate.js`),
`server.js` boot'ta `startScheduledSmsJob()` çağrılır (30 sn gecikme, 15 dk
aralık, `unref` — ana döngüyü kilitlemez).

Davranış (e-posta ile birebir aynı):

- `schedule.nextSentAt` **hiç hesaplanmamışsa HEMEN göndermez**, yalnızca
  vadeyi kurar — açılışta toplu SMS patlamasını önler. İlk gerçek gönderim
  paneldeki "Şimdi gönder" ile yapılır veya vade bir sonraki döngüde dolar.
- Vadesi gelmiş (`nextSentAt <= now`) + `isActive` + `schedule.enabled`
  şablon `audience` kitleye `sendTemplate` ile gönderilir; vade `now +
  intervalHours`'a ilerletilir.
- Gönderim/gateway/modül hatasında vade **ilerletilmez** → 15 dk sonra
  yeniden denenir.
- Job sorgusu `type: 'scheduled'` filtresini de uygular; bayat
  `schedule.enabled` değeri aksiyon şablonlarında asla göndermez.

Form: **İletişim → SMS → şablon düzenle** → "Otomatik Gönderim" bloğu
(yalnız scheduled): aç/kapa, aralık (saat), kitle (tüm kullanıcılar / bir
segment + segment seçici). Elle gönderim penceresi ayrıdır ve kayıtlı
`audience`'a **dokunmaz**.

Validator + servis kapıları (create/update):

| Kod | Koşul |
|-----|-------|
| `SMS_SCHEDULE_ON_ACTION` | `type: 'action'` + `schedule.enabled` |
| `SMS_AUTO_AUDIENCE_INVALID` | `schedule.enabled` + `audience.type: 'users'` |
| `SMS_SEGMENT_REQUIRED` | `audience.type: 'segment'` + `segmentId` yok |
| `SMS_USERS_REQUIRED` | `audience.type: 'users'` + boş `userIds` |
| `SMS_SCHEDULE_INTERVAL_INVALID` | `intervalHours` 1..8760 dışarıda |

**Maliyet uyarısı:** demo aksiyon şablonları `isActive: true` seed edilir ve
bu işten sonra domain kancaları canlıdır. Gateway + `sms-gateway` modülü
açıkken bahis/kampanya trafiği gerçek SMS üretir; operatör gönderimden önce
gereksiz şablonları pasife almalıdır. Otomatik gönderim ise yalnız
`schedule.enabled` açıksa ve vade dolduğunda çalışır — varsayılan güvenlidir.

---

## 13. İlgili kayıtlar

- `docs/admin-redesign/README.md` §6 (SMS gateway) ve §7 (iletişim merkezi + otomatik gönderim)
- `docs/mail-templates.md` — e-postadaki aynı `schedule` modeli
- `todo.md` #18 (SMS provider entegrasyonu) ve #19 (kampanya gönderimi)
- `CHANGELOG.md` → `[Yayınlanmadı]`
- `docs/AI-GITHUB-WORKFLOW-POLICY.md` — commit/PR kuralları
