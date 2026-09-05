# Modül Sistemi

VIP90.bet'un çekirdek platformu (13 in-house oyun, kullanıcı yönetimi,
bonus/çevrim motoru, temel admin paneli) her zaman açıktır — bir satın
alma sonrası tamamen çalışır durumdadır, ek bir şey gerekmez.

Üç ek modül **ayrı satılır/lisanslanır**:

| Modül | ID | Ne sağlar | API'de neyi kapatır |
|---|---|---|---|
| **Bahis** | `betting` | Spor + canlı bahis: oran akışı, kupon, otomatik sonuçlandırma | `/api/events`, `/api/bets` |
| **Casino İçeriği** | `casino-content` | Slot ve masa oyunları, bir aggregator üzerinden | `/api/casino` |
| **Canlı Casino** | `live-casino` | Gerçek krupiyeli masa ve video oyunları | *(henüz bağlı bir route yok — bkz. aşağıda)* |

## Bugünkü durum

Bu artık bir mimari niyetten ibaret değil — panelden gerçekten
açılıp kapatılabilen, API seviyesinde gerçekten uygulanan bir sistem.
Dört parçadan oluşur:

### 1. Modül kayıt defteri ve anahtarı

`server/src/modules/registry.js`, üç modülü (`MODULE_DEFINITIONS`) ve
her biri için fail-closed bir `moduleStore` tanımlar: DB okunamazsa
**tüm modüller kapalı sayılır** ("bir ödeme/bahis modülünün ölçülemez
şekilde açık kalması, yanlışlıkla kapalı görünmesinden daha kötü bir
hatadır" — dosyadaki yorum).

`server/src/modules/index.js` bu deftere gerçek bir DB bağlantısı
kurar: her modülün açık/kapalı durumu mevcut `Setting` koleksiyonunda
`module.<id>.enabled` anahtarıyla saklanır (yeni bir şema açılmadı).
`setModuleEnabled(id, enabled, updatedBy)` bu anahtarı yazar ve
30 saniyelik TTL cache'i geçersiz kılar.

### 2. Lisans doğrulama servisi

`server/src/services/licensing/` iki dosyadan oluşur:

- `registry.js` — `createLicenseStore()`: modül store'unun aynı
  DI/TTL desenini kullanır ama **fail yönü kasıtlı olarak tersinedir**.
  Modüller fail-**closed**'dır (DB yoksa hepsi kapalı); lisans ise
  fail-**tolerant**'tır — merkezi lisans sunucusuna geçici olarak
  ulaşılamazsa son bilinen geçerli durum `graceMs` (varsayılan 72 saat)
  boyunca korunur. Gerekçe: geçici bir ağ kesintisi operatörün tüm
  modüllerini kapatmamalı. Buna karşın lisansın `expiresAt` süresi
  dolduysa modül **yerel olarak** (ağ gerekmeden) kapanır.
- `index.js` — üretim bağlantısı. `LICENSE_SERVER_URL` ve
  `LICENSE_KEY` env değişkenleri tanımlıysa merkez sunucudan
  `GET {LICENSE_SERVER_URL}/license?key=...` ile
  `{ "<modülId>": { valid, expiresAt } }` biçiminde durum çekilir.
  **Tanımlı DEĞİLSE ürün "yönetimsiz mod"da çalışır: tanımlı tüm
  modüller otomatik olarak geçerli sayılır.** Bu bilinçli bir tasarım
  kararıdır (kod içi yorum: *"pazarda satılan ürün kutudan
  çıktığı gibi çalışmalıdır; merkezi zorunluluk yalnızca operatör bir
  lisans sunucusuna bağlanmak isterse devreye girer"*) — yani bu
  depoyu satın alıp `LICENSE_SERVER_URL`/`LICENSE_KEY` hiç
  tanımlamadan çalıştırırsanız, lisans kapısı sizi hiç engellemez;
  tek kapı admin panelindeki aç/kapa anahtarı olur.

  `isModuleUsable(id)` iki kapıyı birden sorar: modül **hem** panel
  anahtarında açık **hem de** lisanslı olmalı
  (`moduleStore.isEnabled(id) && licenseStore.isLicensed(id)`). Mongo
  bağlı değilse sorguya bile girmeden `false` döner.

### 3. API kapısı: `moduleGate`

`server/src/middleware/moduleGate.js`, bir modül kapalıyken ilgili
route grubunun **404 değil**, anlamlı bir 503 dönmesini sağlar:

```js
res.status(503).json({
  error: { code: 'MODULE_DISABLED', module: moduleId, message: 'Bu bölüm şu anda kullanılamıyor.' }
});
```

`isUsable()` çağrısı hata fırlatırsa (ör. DB'ye erişilemedi) kapı
güvenli tarafta kalır ve yine 503 döner — asla "belirsizken aç"
davranmaz.

Bu kapı bugün `server/src/app.js` içinde şu şekilde bağlanmış durumda:

```js
const requireBetting       = createModuleGate({ isUsable: isModuleUsable, moduleId: 'betting' });
const requireCasinoContent = createModuleGate({ isUsable: isModuleUsable, moduleId: 'casino-content' });

app.use('/api/events', requireBetting, eventsRoutes);
app.use('/api/bets',   requireBetting, betsRoutes);
app.use('/api/casino', requireCasinoContent, casinoRoutes);
```

Yani örneğin admin panelden `betting` modülünü kapatırsanız, o andan
itibaren `/api/events/*` ve `/api/bets/*` altındaki **her** istek
(zaten oturum açmış kullanıcılar dahil) `503 MODULE_DISABLED` alır;
çekirdek platformun geri kalanı (in-house oyunlar, bonus, cüzdan)
etkilenmez.

**Bilinen boşluk:** `live-casino` modül ID'si kayıt defterinde
tanımlı ve lisans/panel anahtarı sorgulanabilir durumda, ama bugün
onu gerçekten kapatacak bir route/özellik yok — depoda gerçek
krupiyeli canlı casino entegrasyonu henüz yazılmadı, dolayısıyla
`requireLiveCasino` gibi bir kapı da yok. Panelde bu modülü kapatmak
şu an hiçbir API davranışını değiştirmez.

### 4. Admin ekranı

`client/src/pages/admin/Modules.jsx`, `GET /admin/modules` (liste),
`PATCH /admin/modules/:id` (`{ enabled }` gövdesiyle aç/kapa) ve
`POST /admin/modules/refresh` (her iki cache'i de geçersiz kılıp
tazeler) uç noktalarını kullanan gerçek bir toggle ekranıdır
(`server/src/controllers/modules.js`).

Akış:

1. Ekran açıldığında `GET /admin/modules` çağrılır; yanıt her modül
   için `{ id, title, description, enabled, licensed, licenseSource,
   licenseExpiresAt }` döner — `enabled` panel anahtarı, `licensed`
   lisans servisinin sonucudur.
2. Her satırda bir switch (`role="switch"`) vardır; tıklanınca
   `PATCH /admin/modules/:id { enabled: !enabled }` gönderilir ve
   yanıt doğrudan ekranı günceller (ayrı bir yeniden yükleme yok).
3. Bir lisans rozeti gösterilir — üç durumdan biri:
   - **"Lisans: doğrulandı"** (yeşil, `source: 'live'`) — merkez
     sunucudan taze veri geldi (ya da yönetimsiz moddaysanız, tüm
     modüller varsayılan olarak bu durumdadır).
   - **"Lisans: önbellek — merkez erişilemiyor"** (sarı,
     `source: 'cached'`) — merkeze ulaşılamıyor ama grace penceresi
     içinde son bilinen geçerli durumla çalışılıyor.
   - **"Lisans: doğrulanamadı"** (kırmızı, `source: 'closed'`) — ne
     taze ne önbellekte geçerli bir durum var; modül lisans
     tarafından kapalı sayılır.
4. Panel anahtarı açık ama lisans kapalıysa ayrıca kırmızı bir
   **"Lisanssız — ziyaretçilere kapalı"** rozeti belirir — yani
   `enabled=true, licensed=false` durumunda API kapısı yine de
   kapalıdır (`isModuleUsable` iki kapıyı birden ister).
5. **"↻ Durumu Yenile"** butonu `POST /admin/modules/refresh`
   çağırır; bu, hem modül hem lisans TTL cache'ini anında geçersiz
   kılar (örn. lisans sunucusunda bir değişiklik yapıldıysa 30
   saniye beklemeden yansıtmak için kullanışlıdır).

## Tedarik modeli

Bahis ve casino modülleri, üçüncü taraf veri/içerik sağlayıcılarına
bağımlıdır — bu nedenle platformun kendisinden ayrı bir ticari ilişki
gerektirir. Lisanslı bir operatör içinseniz doğrudan bir aggregator ile
sözleşme yapmanız beklenir; lisans süreci devam ediyorsa alternatif
tedarik seçenekleri için satış ekibiyle görüşün.

## Daha fazlası

Modül sisteminin kapsamadığı (KYC akışı, acente sistemi, çok
kademeli affiliate, VIP cashback gibi) bilinen ürün kısıtları için
bkz. [09 — Bilinen Kısıtlar](09-bilinen-kisitlar.md).
