![VIP90.bet](https://img.shields.io/badge/VIP90.bet-iGaming%20Platform-1a2332?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.3.0-6366f1?style=flat-square)
![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/mongodb-8-47A248?style=flat-square&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-commercial-orange?style=flat-square)

# VIP90.bet Core

**Self-hosted iGaming platform core** — kullanıcı/cüzdan/bonus/affiliate/
admin/tema/KYC/ödeme altyapısını içeren, ticari oyun/bahis modülleriyle
genişletilebilen açık kaynak temel.

Bu repo tek başına **eksiksiz bir operatör iskeleti**: kendi kullanıcı
tabanınızı, cüzdanınızı, bonus/çevrim motorunuzu, affiliate sisteminizi,
KYC/ödeme akışınızı ve admin panelinizi bu kod üzerine kurarsınız. Gerçek
gelir getiren içerik (spor bahisleri, in-house oyunlar, üçüncü taraf casino
içeriği) ise ayrı, ticari olarak lisanslanan modüller olarak eklenir —
core bunlar olmadan da eksiksiz çalışır, sadece ilgili API'ler
`MODULE_DISABLED` döner:

```
VIP90.bet Core
│
├── Betting Module        [Commercial]
├── In-house Games        [Commercial]
└── Igames Casino         [Commercial]
```

Core'un kendisi ne satıyor, ne "demo veri" barındırıyor — kullanıcı
yönetimi, cüzdan, bonus/çevrim, affiliate, tema/marka editörü, admin panel,
KYC ve ödeme **soyutlamaları** (built-in çalışan varsayılan
implementasyonlarıyla), modül/lisans sistemi ve sağlayıcı arayüzleri
uçtan uca test edilmiş ve çalışır durumda. Hangi özelliklerin henüz
olgunlaşmadığını gizlemiyoruz — bkz. [Yol Haritası](#yol-haritası).

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
| 🧱 **Eksiksiz operatör çekirdeği** | Kullanıcı/auth, cüzdan, bonus/çevrim motoru, affiliate, admin panel — modüller olmadan da tam çalışır durumda |
| 🧩 **Modül + lisans sistemi** | Bahis / Casino İçeriği / In-house Oyunlar ayrı ticari modüller olarak panelden aç/kapa edilir, API seviyesinde `MODULE_DISABLED` ile uygulanır |
| 🛠️ **Kapsamlı admin panel** | Kullanıcılar, roller/izinler, canlı KPI+gelir grafikli analitik, tema/marka editörü, statik sayfa düzenleyici, modül yönetimi, destek masası |
| 💰 **Ödeme soyutlaması (built-in)** | Banka havalesi + USDT-TRC20 kripto ödeme built-in çalışır — HD cüzdan tabanlı yatırma takibi, hot wallet çekim, cüzdan imzasıyla Web3 girişi |
| 🪪 **KYC soyutlaması (built-in)** | Yerel belge inceleme veya Sumsub entegrasyonu — panelden seçilebilir, ikisi de gerçek/çalışır durumda |
| 👑 **VIP & gerçek zamanlı cashback** | 5 seviyeli VIP programı; her sonuçlanan bahis/rounddan sonra seviyeye göre anlık cashback bakiyeye işler |
| 🌍 **Çok dilli altyapı & PWA** | 8 dilde tam sözlük + global dil değiştirici, kurulabilir Progressive Web App, iOS Capacitor kabuğu |
| 🔌 **Sağlayıcı arayüzleri** | Bahis/casino/oyun sağlayıcıları için genel adaptör kontratları — kendi entegrasyonunuzu bu arayüzlerin üzerine yazabilirsiniz |
| 🚀 **Tek adımda kurulum** | Tarayıcı tabanlı kurulum sihirbazı (`/install`) — terminal veya elle `.env` düzenleme gerekmez |

## Neler Dahil

### 🧱 Core

Satın alma sonrası her zaman açık, hiçbir ticari modüle bağımlı değil:

```
Core
├── User / Auth
├── Wallet
├── Bonus / Wagering
├── Affiliate
├── Admin
├── CMS / Theme
├── KYC abstraction
├── Payment abstraction
├── Module system
├── Licensing
└── Provider interfaces
```

KYC ve Payment burada **soyutlama** olarak listeleniyor çünkü ikisinin de
built-in, gerçekten çalışan bir varsayılan implementasyonu core'da
mevcut (yerel KYC inceleme + Sumsub; banka havalesi + USDT-TRC20) — ayrı
bir ticari modül satın almanız gerekmez, isterseniz kendi sağlayıcınızla
değiştirirsiniz.

### 💼 Ticari Modüller (bu repoya dahil değil)

Aşağıdakilerin gerçek kodu bu repoda **yok** — her biri ayrı, ayrı
ücretlendirilen bir pakette yaşar ve `server/src/premium/` altına git
submodule olarak bağlanır. Bu repo yalnızca her biri için opsiyonel
yükleme kancasını (bkz. [Modül Sistemi](docs/product/03-modul-sistemi.md))
ve modül kapalıyken düzgün 503 dönen API sözleşmesini içerir.

| Modül | Sağlar |
|---|---|
| **Betting** | Spor bahisleri + canlı bahis: oran akışı, kupon, otomatik sonuçlandırma |
| **In-house Games** | Crash, Mines, Plinko, Dice, Limbo, Wheel, Hi-Lo, Keno, Blackjack, Roulette, Baccarat, Video Poker, Dragon Tiger — HMAC-SHA256 provably fair motor + oynanabilir arayüz |
| **Igames Casino** | Üçüncü taraf slot/masa oyunu aggregator entegrasyonu — core'daki genel aggregator arayüzüne (`services/casinoAggregators/`) bağlanan somut bir implementasyon |

### 👤 Kullanıcı, Cüzdan ve Güvenlik

- E-posta/şifre + sosyal giriş + **Web3 cüzdan imzasıyla** kayıt/giriş.
- Banka havalesi (admin onay kuyruğu) ve **USDT-TRC20** kripto ödeme —
  HD cüzdan tabanlı yatırma takibi, hot wallet üzerinden çekim, admin
  panelden işlem bazlı görünürlük.
- **KYC** — yerel belge inceleme (onay/red kuyruğu) veya **Sumsub**
  entegrasyonu, ikisinden biri panelden seçilir.
- Bonus/çevrim (wagering) motoru, 5 seviyeli VIP programı: seviye
  atlayınca tek seferlik bakiye ödülü **+** her sonuçlanan bahis/round
  sonrası seviyeye göre gerçek zamanlı cashback.
- Admin için 2FA (TOTP), tiered admin rolleri/izinleri.

### 🎉 Topluluk ve Elde Tutma Araçları

- Moderasyonlu canlı sohbet, "rain" bonus dağıtımı, oyuncular arası
  bahşiş.
- Canlı kazanç akışı (Son Kazananlar), favoriler, son oynananlar.
- Referans linki ve komisyon sistemi — davet edilen kullanıcının ürettiği
  ev karının bir yüzdesi doğrudan referans veren kullanıcıya ödenir.
- Yapılandırılabilir "çevrimiçi oyuncu" sosyal kanıt katmanı.

### 🎨 Marka ve Görsel Kimlik

- Canlı önizlemeli tema editörü, logo/favicon/font yükleme.
- Sürükle-bırak statik sayfa/blok düzenleyici (Hakkımızda, Kariyer,
  Basın, İletişim, Yardım Merkezi vb. tamamı tek şablondan üretilir).
- Hazır tema seçenekleri.

### 🛠️ Yönetim Paneli

Kullanıcılar · Roller & İzinler · Canlı KPI/Gelir Analitiği ·
Etkinlik Yönetimi · Oyun Ayarları · Modüller · Tema · Marka ·
Statik Sayfalar · VIP · Bahis/Banka Talepleri · Kripto İşlemler ·
KYC İnceleme Kuyruğu · Destek Bileti Sistemi

## Modül Sistemi

VIP90.bet'un çekirdeği (kullanıcı yönetimi, cüzdan, bonus/çevrim motoru,
referans komisyonu, temel admin panel, i18n) satın alma sonrası **her
zaman açıktır** — bir modül değildir, ek bir şey gerekmeden tam çalışır
durumdadır.

Beş ayrı modül, admin panelinden tek bir anahtarla açılıp kapatılır ve
lisans durumuna göre işaretlenir:

| Modül | Sağlar | Bağımlılık |
|---|---|---|
| **Bahis** | Oran akışı, kupon, otomatik sonuçlandırma | Spor verisi sağlayıcısıyla sözleşme |
| **Casino İçeriği** | Slot/masa oyunları aggregator konektörü | Lisanslı aggregator sözleşmesi |
| **In-house Oyunlar** | 13 provably-fair oyun, ayrı bir oyun sunucusundan (JWT+origin korumalı) servis edilir | Üçüncü taraf sözleşmesi gerekmez ama ayrı lisanslı pakette yaşar — bu repoya dahil değil |
| **Crypto Ödeme Ağ Geçidi** | USDT-TRC20 yatırma/çekme | Yok — dahili |
| **KYC Kimlik Doğrulama** | Yerel belge inceleme veya Sumsub | Sumsub seçilirse üçüncü taraf sözleşmesi |

Bir modül kapalıyken ilgili API uçları anlaşılır bir `MODULE_DISABLED`
hatası döner — platformun geri kalanı etkilenmeden çalışmaya devam eder.
Veri/içerik sağlayıcısı sözleşmesi platformdan ayrıdır: **kendi
sağlayıcınızı bağlayın** ya da başlangıç için yönlendirme isteyin.

## Mimari ve Teknoloji Yığını

```
client/   React 19 + Vite + Tailwind + Zustand — SPA, PWA, Capacitor (iOS)
server/   Node.js + Express + MongoDB (Mongoose) + Socket.IO
          JWT auth · Zod doğrulama · Helmet · rate limiting
installer/ Tarayıcı tabanlı kurulum sihirbazı (/install)
```

**Öne çıkan teknik kararlar:**

- **Gerçek zamanlı katman** Socket.IO üzerinden — bahis oranları,
  çevrimiçi oyuncu sayacı, canlı sohbet, kazanç akışı hepsi push
  tabanlı (polling yok).
- **Modül kapısı** (`moduleGate` middleware) her istekte lisans +
  panel anahtarı durumunu kontrol eder, tutarlı hata sözleşmesi sunar.
- **Paylaşılan UI bileşenleri** — sayfa şablonları (`PageWithRail`,
  `HomeSidebar`) tek yerden yönetilir, kopyala-yapıştır drift riski yok.
- Tam otomatik test paketi: auth, bahis, çevrim, modül kapısı ve i18n
  kapsıyor (`npm test`).

## Hızlı Başlangıç

### Tarayıcı tabanlı kurulum (önerilen)

```bash
npm run install:all   # kök + server + client bağımlılıkları
npm run build         # client production build
npm start             # server'ı ayağa kaldır
```

Sunucu ayaktayken tarayıcıdan **`/install`** adresine gidin — veritabanı
bağlantısı, ilk yönetici hesabı ve site ayarları tek sayfalık bir
sihirbazla tamamlanır; terminal veya elle `.env` düzenlemesi gerekmez.

### Geliştirme ortamı

```bash
npm run dev   # server + client'ı eşzamanlı, hot-reload ile başlatır
```

### Testler

```bash
npm test           # birim/entegrasyon testleri (server + i18n)
npm run test:e2e   # Playwright uçtan uca testleri
```

## Güvenlik

- JWT tabanlı oturum, gömülü/casino görünümleri için kapsamlı token'lar.
- `helmet`, `express-mongo-sanitize`, katmanlı `express-rate-limit`.
- Admin için TOTP tabanlı 2FA.
- Modül kapısı ile lisans/yetki sınırları API seviyesinde uygulanır.
- HMAC-SHA256 **provably fair** round üretimi lisanslı In-house Games
  modülünün parçasıdır (bu repoda değil).

## Belgeler

Operatörler için hazırlanan tam dokümantasyon [`docs/product/`](docs/product/)
altında (dizinin kendi indeksi: [docs/product/README.md](docs/product/README.md)):

- [Kurulum](docs/product/01-kurulum.md) · [Yapılandırma](docs/product/02-yapilandirma.md)
- [Modül Sistemi](docs/product/03-modul-sistemi.md)
- [API Referansı](docs/product/05-api-referansi.md) · [SSS](docs/product/06-sss.md)
- [Video Storyboard'ları](docs/product/07-video-storyboardlari.md)
- [Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md)

Core'un built-in kripto ödeme ve KYC sağlayıcıları için teknik dokümantasyon
— [`docs/providers/`](docs/providers/) altında. (Bahis/casino/in-house oyun
sağlayıcı entegrasyonlarının dokümantasyonu ilgili ticari modülün kendi
paketindedir, bu repoda değildir.)

- [Kripto Ödeme Sağlayıcısı — TRC20 USDT](docs/providers/crypto-trc20.md)
- [Yerel (Manuel) KYC Servisi](docs/providers/local-kyc.md) · [Sumsub KYC Entegrasyonu](docs/providers/sumsub-kyc.md)

Sürüm geçmişi için [`CHANGELOG.md`](CHANGELOG.md).

## Yol Haritası

Platform aktif geliştirme altında. Aşağıdakiler, kod tabanında **şema veya
kısmi altyapısı bulunan ama uçtan uca çalışmayan** özellikler — kod
denetimiyle doğrulandı, gizlenmiyor. Tam ayrıntı ve kod referansları için
[Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md):

- **Acente (reseller) sistemi** — `User` modelinde `isAgent`/`agentId`
  alanları tanımlı ama bunları okuyan/yazan hiçbir route, controller
  veya arayüz yok. Şu an tamamen kullanılmayan şema alanları.
- **Çok kademeli affiliate** — bugün yalnızca tek kademe var: davet
  edilen kullanıcının ürettiği ev karının bir yüzdesi doğrudan referans
  verene ödeniyor. Alt-referansların (2. kademe ve ötesi) da komisyon
  getirdiği bir yapı henüz yok.
- **Canlı krupiyeli casino (live casino)** — henüz kod tabanında yok,
  ne core'da ne ticari modüllerde aktif bir implementasyon bulunuyor;
  yalnızca ileriye dönük bir plan.

## Lisanslama

VIP90.bet ticari bir üründür, iki lisans seçeneğiyle sunulur:

- **Regular License** — tek bir son ürün için, son kullanıcıdan
  ürünün kendisi için ücret alınmıyorsa.
- **Extended License** — son kullanıcıların erişim için ödeme yaptığı
  bir üründe kullanım için.

Fiyatlandırma, destek süresi ve tedarik detayları için satış ekibiyle
iletişime geçin.

---

## Proje Geçmişi

Bu commit geçmişi projenin gerçek geliştirme sürecini yansıtır. Platform
zaman içinde iki kez yeniden markalandı — **Betzone** → **Kismethane** →
**VIP90.bet** — bu yüzden eski commit'lerde önceki isimlere rastlayabilirsiniz;
bunlar terk edilmiş bir proje değil, aynı ürünün marka evrimidir.

---

<sub>Node.js · Express · React · MongoDB · Socket.IO ile geliştirildi.</sub>
