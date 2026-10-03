![VIP90.bet](https://img.shields.io/badge/VIP90.bet-iGaming%20Platform-1a2332?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.3.0-6366f1?style=flat-square)
![Node](https://img.shields.io/badge/node-22-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/mongodb-7%20(replica%20set)-47A248?style=flat-square&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-AGPL--3.0%20%2B%20commercial%20add--ons-blue?style=flat-square)

# VIP90.bet

**Self-hosted full-stack betting and casino platform with sportsbook,
live betting, casino, wallet, bonuses, affiliate and admin management.**

Kendi altyapınızda çalışan, kendi markanızı taşıyan online casino + spor
bahisleri platformu. **Çekirdek platform** (hesap, cüzdan, bonus/çevrim, KYC,
risk, admin paneli) temel üründür ve tek başına açılır. **In-house Games
(13 oyun), Sports Betting ve Casino Content ayrı ücretli eklentilerdir**;
çekirdeğe sonradan eklenir — tek kod tabanı, tek admin panel.
**Live Casino** (canlı krupiyeli masalar) planlanan gelecek bir güncellemedir,
bu sürümde yoktur.

Çoğu "casino script"i demo verisine sarılı boş bir kabuk satar; canlıya
almaya çalıştığınız an kırılır. VIP90.bet'un çekirdeği bunun tersi: cüzdan
defteri, bonus/çevrim motoru, risk ve uyumluluk araçları, tema editörü, canlı
sohbet, referans komisyonu — gerçek ve test edilmiş. Hangi özelliklerin henüz
olgunlaşmadığını gizlemiyoruz — bkz. [Yol Haritası](#yol-haritası) ve
[Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md).

---

## İçindekiler

- [Öne Çıkanlar](#öne-çıkanlar)
- [Neler Dahil](#neler-dahil)
- [Modül Sistemi](#modül-sistemi)
- [Mimari ve Teknoloji Yığını](#mimari-ve-teknoloji-yığını)
- [Hızlı Başlangıç](#hızlı-başlangıç)
- [Güvenlik](#güvenlik)
- [Belgeler](#belgeler)
- [Yol Haritası](#yol-haritası)
- [Lisanslama](#lisanslama)

---

## Öne Çıkanlar

| | |
|---|---|
| 🛠️ **Kapsamlı admin panel (çekirdek)** | Kullanıcılar, roller/izinler, canlı KPI+gelir grafikli analitik, tema/marka editörü, statik sayfa ve ana sayfa slider düzenleyicileri, modül aç/kapa, cüzdan (banka/kripto/Slikair), destek masası, oyuncu segmentasyonu, risk/uyumluluk, sistem sağlık izleme |
| 💰 **Uçtan uca kripto ödeme (modül)** | USDT-TRC20 — HD cüzdan tabanlı yatırma takibi + hot wallet üzerinden otomatik/onaylı çekim, admin panelden işlem geçmişi, cüzdan imzasıyla Web3 girişi |
| 💳 **Slikair ödeme ağ geçidi (modül)** | Kart ve alternatif yöntemlerle para yatırma; yalnızca sandbox kimlikleriyle doğrulandı, canlı için Slikair KYB gerekir |
| 🪪 **Çift KYC sistemi (modül)** | Yerel belge inceleme (admin onay/red kuyruğu) veya Sumsub ile otomatik doğrulama — panelden seçilebilir |
| 👑 **VIP & gerçek zamanlı cashback** | Varsayılan 5 seviyeli VIP programı (Bronze–Diamond, panelden düzenlenir); her sonuçlanan bahis/rounddan sonra seviyeye göre anlık cashback bakiyeye işler |
| 🌍 **Çok dilli altyapı & PWA** | 8 dil sözlüğü (TR ve EN tam; diğer 6 dilde 3'er blok çevrilmemiş) + global dil değiştirici, kurulabilir Progressive Web App, iOS Capacitor kabuğu |
| 🧩 **Modüler lisanslama** | Çekirdek her zaman açık; Bahis / Casino İçeriği / In-house Oyunlar / Kripto Ödeme / Slikair / KYC panelden yönetilir; ilk üçü ayrı ücretli eklentidir |
| 💱 **Para birimi, marka, jurisdiction yöneticileri** | Settings altında Currencies / Brands / Jurisdictions sekmeleri; site tek bir görüntüleme para birimiyle çalışır, marka verisi izolasyonu uygulanmaz ([Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md)) |
| 🚀 **Kurulum sihirbazı** | `docker compose up -d` sonrası tarayıcıdan `/install` — ilk yönetici hesabı ve site ayarları; sunucunun açılması için önceden bir `.env` (JWT anahtarları, veritabanı) gerekir |
| 🎰 **13 in-house oyun (ücretli eklenti)** | Crash, Mines, Plinko, Dice, Limbo, Wheel, Hi-Lo, Keno, Blackjack, Roulette, Baccarat, Video Poker, Dragon Tiger — hepsi HMAC-SHA256 **provably fair**, house edge her oyun için panelden ayarlanabilir |
| ⚽ **Spor & Canlı Bahis (ücretli eklenti)** | 30 spor tanımı, canlı oran akışı, kupon (tekli/kombine), otomatik sonuçlandırma |
| 🃏 **Casino İçeriği (ücretli eklenti)** | Aggregator entegrasyonu ile slot ve masa oyunları — iGaming içerik sağlayıcısı entegrasyonu (bugün tek adaptör) |

## Neler Dahil

### 🧱 Çekirdek platform

- Hesap, e-posta doğrulama, şifre sıfırlama; e-posta/şifre + Google/Telegram
  girişi + **Web3 cüzdan imzasıyla** kayıt/giriş.
- Cüzdan defteri (atomik, idempotent), banka havalesi (admin onay kuyruğu),
  bonus/çevrim (wagering) motoru, VIP programı, referans komisyonu.
- Admin: roller/izinler (RBAC), TOTP 2FA, denetim kaydı, risk motoru ve
  kuralları, uzlaşma (reconciliation) çerçevesi, sorumlu oyun kontrolleri,
  oyuncu segmentasyonu, ajan (reseller) sistemi, destek bileti sistemi,
  moderasyonlu canlı sohbet.
- Tema/marka/SEO ayarları, statik sayfalar, çok dilli arayüz.

### 💳 Ödeme ve KYC modülleri (çekirdekle birlikte gelir)

- **USDT-TRC20** kripto ödeme — HD cüzdan tabanlı yatırma takibi, hot wallet
  üzerinden çekim.
- **Slikair** kart/alternatif ödeme ağ geçidi (sandbox; canlı için KYB şart).
- **KYC** — yerel belge inceleme (onay/red kuyruğu) veya **Sumsub**
  entegrasyonu, ikisinden biri panelden seçilir.

### 🎰 13 In-House Oyun (ücretli eklenti)

Hiçbir üçüncü taraf sözleşmesi gerektirmeyen, size ait oyun kütüphanesi:

**Crash · Mines · Plinko · Dice · Limbo · Wheel · Hi-Lo · Keno ·
Blackjack · Roulette · Baccarat · Video Poker · Dragon Tiger**

- Her round `crypto.randomBytes` ile üretilen bir `serverSeed`'in
  HMAC-SHA256 hash'inden türetilir — sonuç sunucu tarafından round
  başlamadan önce belirlenemez (**provably fair**).
- House edge ve bahis limitleri oyun bazında admin panelinden
  (**Products → In-house Games**) ayarlanır — tek bir soyut "RTP" alanı
  değil, her oyunun gerçek matematiğini oluşturan değişkenler doğrudan açılır.
- Oyun arayüzü (`game-host`) ayrı bir uygulamadır, ayrı barındırılır; motor
  ana sunucu sürecine dahil olur.

### ⚽ Spor Bahisleri & Canlı Bahis (ücretli eklenti)

- 30 spor tanımı (futbol, basketbol, tenis, buz hokeyi, boks, rugby, kriket,
  motor sporları, satranç ve daha fazlası) için lig/ülke bazlı hiyerarşik
  listeleme; hangi kategorilerin gösterileceği **Products → Sportsbook →
  Categories** sekmesinden seçilir.
- Canlı ve yaklaşan etkinlikler ayrı akışlarda; etkinlik detay
  sayfasında market bazlı oran tablosu.
- Tekli / kombine kupon, otomatik sonuçlandırma motoru: bahis oynanır,
  etkinlik sonuçlanınca bakiye atomik bir işlemle kredilenir.
- Oran verisi ayrı bir uygulamadan (`odds-provider`) gelir; veri kaynağı
  sözleşmesi sizin sorumluluğunuzdadır.

### 🃏 Casino İçeriği (ücretli eklenti)

- Standart aggregator konektörü — slot ve masa oyunu kataloğunu platforma
  bağlar. Bugün tek bir iGaming içerik sağlayıcısı adaptörü var; ikinci bir
  sağlayıcı yeni bir adaptör yazmakla eklenir.
- Sağlayıcı bazlı filtreleme, favoriler, son oynananlar, arama; admin
  panelden popüler oyunlar ve bonus/freeround yönetimi (**Products → Casino
  Provider**).
- Canlı krupiyeli **Live Casino planlanan gelecek bir güncellemedir**, bu
  sürümde kodu yoktur.

### 🎉 Topluluk ve Elde Tutma Araçları

- Moderasyonlu canlı sohbet, "rain" bonus dağıtımı, oyuncular arası bahşiş.
- Canlı kazanç akışı (Son Kazananlar), favoriler, son oynananlar.
- Tek seviyeli referans linki ve komisyon sistemi — davet edilen kullanıcının
  ürettiği ev karının %10'u doğrudan referans veren kullanıcıya ödenir.
- Yapılandırılabilir "çevrimiçi oyuncu" sosyal kanıt katmanı.

### 🎨 Marka ve Görsel Kimlik

- Canlı önizlemeli tema editörü ve 3 hazır tema, logo/favicon/font yükleme
  (**Personalization**).
- Form tabanlı statik sayfa ve ana sayfa slider düzenleyicileri (Hakkımızda,
  Kariyer, Basın, İletişim vb.); sürükle-bırak editör yoktur.

### 🛠️ Yönetim Paneli

Menü grupları: **Overview** (Dashboard, Analytics) · **Customers** (Users,
Agents, Segments, Tickets) · **Wallet** · **Compliance** (KYC, Risk,
Reconciliation, Responsible Gaming; Audit Log) · **Products** (Casino
Provider, In-house Games, Sportsbook) · **Engagement** (Promotions, VIP, Chat)
· **Platform** (Settings: General · Modules · Currencies · Jurisdictions ·
Brands · SEO; Personalization; Roles; System Health & Logs) ·
**Demo & Simulation** (Demo Data, Bots).

## Modül Sistemi

VIP90.bet'un çekirdeği (kullanıcı yönetimi, cüzdan, bonus/çevrim motoru,
referans komisyonu, KYC, risk, admin panel, i18n) satın alma sonrası **her
zaman açıktır** — bir modül değildir, eklentiler olmadan da tam çalışır.

Altı modül admin panelinden (**Settings → Modules**) tek bir anahtarla
açılıp kapatılır ve lisans durumuna göre işaretlenir
(`server/src/modules/registry.js`):

| Modül | Sağlar | Nasıl gelir | Bağımlılık |
|---|---|---|---|
| **Bahis** (`betting`) | Oran akışı, kupon, otomatik sonuçlandırma | **Ücretli eklenti** (`server/src/premium/betting`) | Spor verisi sağlayıcısıyla sözleşme |
| **Casino İçeriği** (`casino-content`) | Slot/masa oyunları aggregator konektörü | **Ücretli eklenti** (`server/src/premium/igames`) | Aggregator sözleşmesi |
| **In-house Oyunlar** (`inhouse-games`) | 13 provably-fair oyun, ayrı bir oyun sunucusundan (JWT+origin korumalı) servis edilir | **Ücretli eklenti** (`server/src/premium/inhouse-provider`) | Yok — üçüncü taraf sözleşmesi gerekmez |
| **Crypto Ödeme Ağ Geçidi** (`crypto-payment`) | USDT-TRC20 yatırma/çekme | Çekirdekle birlikte | Yok |
| **Slikair Ödeme Ağ Geçidi** (`slikair-payment`) | Kart ve alternatif yöntemlerle yatırma | Çekirdekle birlikte; lisans kontrolünden muaf | Slikair merchant hesabı |
| **KYC Kimlik Doğrulama** (`kyc-verification`) | Yerel belge inceleme veya Sumsub | Çekirdekle birlikte | Sumsub seçilirse üçüncü taraf sözleşmesi |

Üç ücretli eklenti `server/src/premium/` altında **özel git alt modülleri**
olarak durur; çekirdek bunlar olmadan da açılır (opsiyonel dinamik import —
yoksa ilgili uçlar `503 MODULE_NOT_INSTALLED` döner). Bir modül kapalıyken
ilgili API uçları `MODULE_DISABLED` hatası döner — platformun geri kalanı
etkilenmeden çalışmaya devam eder. Eklentilerin kurulumu için
[Kurulum § Add-on modules](docs/product/01-kurulum.md#add-on-modules-in-house-games-sports-betting-casino-content).
**Live Casino planlanan gelecek güncellemedir**, henüz modül olarak yoktur.
Veri/içerik sağlayıcısı sözleşmesi platformdan ayrıdır: **kendi
sağlayıcınızı bağlayın** ya da başlangıç için yönlendirme isteyin.

## Mimari ve Teknoloji Yığını

```
client/    React 19 + Vite + Tailwind + Zustand — SPA, PWA, Capacitor (iOS)
server/    Node.js + Express + MongoDB (Mongoose) + Socket.IO
           JWT auth · Zod doğrulama · Helmet · rate limiting
installer/ Tarayıcı tabanlı kurulum sihirbazı (/install)
deploy/    Caddy ters vekil yapılandırması (Docker)
server/src/premium/   Ücretli eklentiler (özel git alt modülleri)
  inhouse-provider/   oyun motoru + game-host/ (ayrı React/Vite uygulaması)
  betting/            sonuçlandırma + sync job'ları + odds-provider/ (ayrı Node uygulaması)
  igames/             casino aggregator entegrasyonu
```

`docker compose` yalnızca `mongo`, `app` ve `caddy` servislerini çalıştırır;
`game-host` ve `odds-provider` Docker'da **yoktur** — ayrı kurulur
([Kurulum](docs/product/01-kurulum.md)). MongoDB tek düğümlü replica set
olarak çalışmalıdır (çoklu doküman transaction'ları kullanılır).

**Öne çıkan teknik kararlar:**

- **Gerçek zamanlı katman** Socket.IO üzerinden — bahis oranları,
  çevrimiçi oyuncu sayacı, canlı sohbet, kazanç akışı hepsi push
  tabanlı (polling yok).
- **Modül kapısı** (`moduleGate` middleware) her istekte lisans +
  panel anahtarı durumunu kontrol eder, tutarlı hata sözleşmesi sunar
  (`/api/igames` hariç — bu uçlar yalnızca sağlayıcı token'ına bakar).
- **Paylaşılan UI bileşenleri** — sayfa şablonları (`PageWithRail`,
  `HomeSidebar`) tek yerden yönetilir, kopyala-yapıştır drift riski yok.
- Otomatik test paketi: auth, bahis, çevrim, modül kapısı ve i18n
  kapsıyor (`npm test`).

## Hızlı Başlangıç

### Docker ile (önerilen)

```bash
cp .env.docker.example .env     # DOMAIN, JWT_SECRET, JWT_REFRESH_SECRET, CLIENT_URL, SMTP...
docker compose up -d            # mongo + app + caddy
```

Ardından tarayıcıdan **`https://DOMAIN/install`** adresine gidin — ilk yönetici
hesabı ve site adı/para birimi tek sayfalık bir sihirbazla tamamlanır.
`.env` dosyasını önceden doldurmanız gerekir (JWT anahtarları olmadan oturum
açılamaz); sihirbaz yönetici hesabını, site adı/para birimini ve (isteğe bağlı) başlangıçta açık olacak Kripto/KYC modüllerini yazar.

### Elle kurulum

```bash
npm i && npm i --prefix server && npm i --prefix client   # çekirdek bağımlılıklar
cp server/.env.example server/.env                        # MONGODB_URI, JWT_*, CLIENT_URL doldurun
npm start                                                 # client build + server
```

`npm run install:all` eklenti dizinlerini (`game-host`, `odds-provider`) de
kurar; eklentiler yoksa o adımı uyarıyla atlar. MongoDB replica set olmalıdır.
Sunucu ayaktayken **`/install`** adresine gidin.

Eklentileri (In-house Games, Sports Betting, Casino Content) kurmak için:
[docs/product/01-kurulum.md § Add-on modules](docs/product/01-kurulum.md#add-on-modules-in-house-games-sports-betting-casino-content).

### Geliştirme ortamı

```bash
npm run dev   # client + server (+ odds-provider; Sports Betting eklentisi yoksa o süreç başlamaz)
```

### Testler

```bash
npm test           # birim/entegrasyon testleri (server + i18n + admin dashboard)
npm run test:e2e   # Playwright uçtan uca testleri
```

## Güvenlik

- HMAC-SHA256 **provably fair** round üretimi, oyuncu tarafında
  doğrulanabilir.
- JWT tabanlı oturum, gömülü/casino görünümleri için kapsamlı token'lar.
- `helmet`, `express-mongo-sanitize`, katmanlı `express-rate-limit` (sınırlar
  `server/src/middleware/rateLimit.js` içinde sabit, env ile ayarlanmaz).
- Admin için TOTP tabanlı 2FA; isteğe bağlı `ADMIN_ALLOWED_IPS` ile `/api/admin/*` IP/CIDR kısıtı ve Cloudflare Turnstile (ikisi de env tanımlanınca açılır, varsayılan kapalı).
- `kyc-verification` modülü açıkken oyuncu para çekimleri onaylı KYC ister (`KYC_REQUIRED`).
- Modül kapısı ile lisans/yetki sınırları API seviyesinde uygulanır.
- RBAC ile rol bazlı erişim kontrolü — tüm admin endpointleri izin
  doğrulaması yapar.
- Audit trail — tüm kritik admin işlemleri kaydedilir (oyuncu
  müdahaleleri, finansal işlemler, KYC kararları, modül değişiklikleri).
- Sorumlu oyun kontrolleri — para yatırma/çekme/kayıp/çevrim limitleri,
  soğuma süreleri, kendi kendine hariç tutma, hesap kısıtlamaları.
- Canlı sohbet moderasyonu — yasaklama/susturma/mesaj silme işlemleri
  denetim izniyle kaydedilir.
- Finansal defter — tüm cüzdan işlemleri atomik, idempotent ve
  denetlenebilir.
- Varlık lisans denetimi belgelenmiş
  ([Varlık Lisans Denetimi](docs/product/08-varlik-lisans-denetimi.md)); bazı
  görseller için üretim kaynağı hâlâ doğrulanmadı.

## Belgeler

Operatörler için hazırlanan tam dokümantasyon [`docs/product/`](docs/product/)
altında (dizinin kendi indeksi: [docs/product/README.md](docs/product/README.md)):

- [Kurulum](docs/product/01-kurulum.md) · [Yapılandırma](docs/product/02-yapilandirma.md)
- [Modül Sistemi](docs/product/03-modul-sistemi.md) · [Oyun Matematiği](docs/product/04-oyun-matematigi.md)
- [API Referansı](docs/product/05-api-referansi.md) · [SSS](docs/product/06-sss.md)
- [Video Storyboard'ları](docs/product/07-video-storyboardlari.md) · [Varlık Lisans Denetimi](docs/product/08-varlik-lisans-denetimi.md)
- [Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md)

Sağlayıcı/entegrasyon bazlı teknik dokümantasyon — oran akışı sağlayıcısı,
üçüncü taraf casino aggregator'ı, kripto ödeme ve KYC sağlayıcıları,
in-house oyun sunucusu mimarisi — [`docs/providers/`](docs/providers/)
altında (üç ücretli eklentinin kodunu anlatan belgeler `server/src/premium/`
alt modüllerinin varlığını varsayar):

- [Spor Bahisleri Sistemi](docs/providers/betting-sports.md) · [In-House Oyunlar Sistemi](docs/providers/inhouse-games.md)
- [Igames Casino Entegrasyonu](docs/providers/igames-casino.md) · [Sağlayıcının Kendi API Dokümantasyonu (referans)](docs/providers/index.md)
- [Kripto Ödeme Sağlayıcısı — TRC20 USDT](docs/providers/crypto-trc20.md)
- [Yerel (Manuel) KYC Servisi](docs/providers/local-kyc.md) · [Sumsub KYC Entegrasyonu](docs/providers/sumsub-kyc.md)

Operasyon ve olay müdahalesi: [`docs/RUNBOOK.md`](docs/RUNBOOK.md). SEO ayarları:
[`docs/seo-settings.md`](docs/seo-settings.md). Sürüm geçmişi için
[`CHANGELOG.md`](CHANGELOG.md).

## Yol Haritası

Platform aktif geliştirme altında. Aşağıdakiler, kod tabanında **eksik olan,
planlanan ya da şema/kısmi altyapısı bulunan ama uçtan uca çalışmayan**
özellikler — kod denetimiyle doğrulandı, gizlenmiyor. Tam ayrıntı ve kod
referansları için [Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md):

- **Live Casino** — canlı krupiyeli masa/video oyunları planlanan gelecek
  güncellemedir; kodda `live-casino` modülü, bağlayıcı ve kapı yoktur.
- **Çok kademeli affiliate** — bugün yalnızca tek kademe var: davet
  edilen kullanıcının ürettiği ev karının bir yüzdesi doğrudan referans
  verene ödeniyor. Alt-referansların (2. kademe ve ötesi) da komisyon
  getirdiği bir yapı henüz yok.
- **Marka verisi izolasyonu** — çoklu marka yönetimi var, ama çekirdek
  modellerde `brandId` olmadığı için veri izolasyonu uygulanmıyor.

## Lisanslama

Çekirdek platform [GNU Affero General Public License v3.0](LICENSE)
(`AGPL-3.0-only`) ile lisanslıdır ve `vip90-bet-core` adıyla herkese açık
depoda yayımlanır (bu depodan `scripts/sync-core.mjs` ile senkronlanır).
AGPL gereği, çekirdeği değiştirip ağ üzerinden kullanıcılara sunan
operatör, değiştirilmiş kaynak kodunu bu kullanıcılara açmakla yükümlüdür.

In-house Games, Sports Betting ve Casino Content eklentileri ayrı, kapalı
kaynaklı ticari ürünlerdir; kendi private depolarında tutulur ve çekirdek
lisansından bağımsız olarak lisanslanır.

Fiyatlandırma, destek süresi ve tedarik detayları için satış ekibiyle
iletişime geçin.

---

<sub>Node.js · Express · React · MongoDB · Socket.IO ile geliştirildi.</sub>
