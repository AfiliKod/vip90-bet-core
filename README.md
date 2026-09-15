![VIP90.bet](https://img.shields.io/badge/VIP90.bet-iGaming%20Platform-1a2332?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.3.0-6366f1?style=flat-square)
![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/mongodb-8-47A248?style=flat-square&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-BUSL--1.1-orange?style=flat-square)

# VIP90.bet Core

**Self-hosted iGaming operator core with PAM capabilities** — kullanıcı, cüzdan,
bonus/çevrim, affiliate, admin, CMS/theme, KYC ve ödeme altyapısını tek bir
operatör çekirdeğinde birleştirir; sportsbook, casino content ve proprietary
games gibi yetenekleri ayrı ticari modüller olarak eklemenize izin verir.

VIP90.bet Core, kendi iGaming operasyonunu kurmak isteyen operatörler,
kurucular ve mühendislik ekipleri için tasarlanmıştır. Amaç bir white-label
site kiralamak değil; platformun temelini kendi altyapınızda çalıştırmak,
sağlayıcılarınızı seçmek ve ihtiyaç oldukça modüller eklemektir.

> **Own the core. Add the capabilities you need.**

## Platform modeli

```text
VIP90.bet Platform
│
├── Core Platform                  [Public / BUSL-1.1]
│   ├── Player / Auth
│   ├── Wallet & transactions
│   ├── Bonus / Wagering
│   ├── Affiliate
│   ├── Admin & operations
│   ├── CMS / Theme / Brand
│   ├── KYC abstraction
│   ├── Payment abstraction
│   ├── Module & licensing system
│   └── Provider interfaces
│
└── Commercial Modules             [Separate packages]
    ├── Betting
    ├── iGames
    │   └── Palace provider integration
    └── In-house Games
```

Core platform ile ticari capability modülleri bilinçli olarak ayrıdır. Core,
oyuncu ve operatör yaşam döngüsünün temelini sağlar; ticari modüller bahis,
üçüncü taraf casino içeriği ve proprietary oyunlar gibi gelir üreten
capability'leri ekler.

### Neden bu ayrım?

- **Vendor bağımsızlığı:** Provider seçimi core'un veri modeline gömülmez.
- **Modüler satın alma:** İhtiyacınız olmayan capability için platformu
  baştan satın almanız gerekmez.
- **Self-hosting:** Core kendi altyapınızda çalışır ve kendi markanızla
  işletilebilir.
- **Kaynak görünürlüğü:** Mimari, provider kontratları, module boundary'leri
  ve operasyonel akışlar incelenebilir.
- **AI/GitHub discoverability:** Proje açık mimari ve makinece okunabilir
  dokümantasyonla iGaming operator-core/PAM kategorisinde anlaşılabilir.

> **Lisans notu:** Repository Business Source License 1.1 (BUSL-1.1) ile
> lisanslanır. BUSL, Open Source Initiative anlamında bir Open Source lisansı
> değildir. Lisans, kendi iç/ticari operasyonunuz için self-hosting'e izin
> verir; hosted/managed/white-label platform olarak yeniden sunum ve core'un
> kendisinin rakip bir yazılım ürünü olarak yeniden satılması ayrı ticari
> anlaşma gerektirir. Ayrıntılar için [`LICENSE`](LICENSE) dosyasına bakın.

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
| 🧱 **Operator core / PAM foundation** | Player/auth, wallet, bonus/wagering, affiliate ve admin altyapısı |
| 💳 **Wallet & payments** | Banka havalesi + USDT-TRC20; ödeme sağlayıcıları için abstraction katmanı |
| 🪪 **KYC** | Yerel belge inceleme veya Sumsub; sağlayıcı seçimi core'dan ayrılabilir |
| 🧩 **Module + licensing** | Betting / iGames / In-house Games gibi capability'ler ayrı modüller olarak yönetilir |
| 🛠️ **Operations backoffice** | Kullanıcılar, roller/izinler, analitik, destek, KYC, ödeme ve module yönetimi |
| 👑 **Retention tooling** | 5 seviyeli VIP, wagering ve sonuç sonrası gerçek zamanlı cashback |
| 🌍 **Multi-language + PWA** | 8 dil, global dil değiştirici, PWA ve iOS Capacitor kabuğu |
| 🔌 **Provider interfaces** | Betting, casino ve game provider entegrasyonları için genel adaptör kontratları |
| 🚀 **Browser-based installer** | `/install` üzerinden ilk kurulum ve site yapılandırması |

## Neler Dahil

### Core Platform

Core, herhangi bir ticari capability modülüne bağımlı değildir:

```text
Core
├── User / Auth
├── Wallet
├── Bonus / Wagering
├── Affiliate
├── Admin / Operations
├── CMS / Theme / Brand
├── KYC abstraction
├── Payment abstraction
├── Module system
├── Licensing
└── Provider interfaces
```

KYC ve Payment abstraction'larının core içinde çalışan varsayılan
implementasyonları bulunur (yerel KYC inceleme + Sumsub; banka havalesi +
USDT-TRC20). Bunlar ayrı satın alınması gereken capability modülleri değildir;
kendi sağlayıcınızla değiştirilebilir.

### Ticari capability modülleri

Gerçek modül kodları bu repository'de bulunmaz; ayrı paketler olarak dağıtılır.

| Modül | Sağlar |
|---|---|
| **Betting** | Spor ve canlı bahis, oran akışı, kupon, otomatik sonuçlandırma |
| **iGames** | Üçüncü taraf slot/masa oyunu aggregator entegrasyonu; provider olarak Palace dahil |
| **In-house Games** | Crash, Mines, Plinko, Dice, Limbo, Wheel, Hi-Lo, Keno, Blackjack, Roulette, Baccarat, Video Poker, Dragon Tiger gibi provably-fair oyunlar |

> `iGames` modül adı ürün/capability sınırını ifade eder. `Palace` yalnızca
> gerçek provider entegrasyonunu ifade eder; provider seviyesindeki
> `PalaceProvider`, credential ve API contract isimleri bu nedenle korunur.

### Oyuncu, wallet ve güvenlik

- E-posta/şifre + sosyal giriş + Web3 cüzdan imzasıyla kayıt/giriş.
- Banka havalesi ve USDT-TRC20 ödeme akışları.
- KYC: yerel belge inceleme veya Sumsub.
- Bonus/wagering motoru ve 5 seviyeli VIP programı.
- Sonuçlanan bahis/round sonrası seviyeye göre gerçek zamanlı cashback.
- Admin için TOTP tabanlı 2FA ve tiered roller/izinler.

### Topluluk ve elde tutma

- Moderasyonlu canlı sohbet.
- Rain bonus dağıtımı ve oyuncular arası bahşiş.
- Son kazananlar, favoriler ve son oynananlar.
- Referans linki ve komisyon sistemi.
- Yapılandırılabilir çevrimiçi oyuncu sosyal kanıt katmanı.

### Marka, CMS ve operasyon

- Canlı önizlemeli tema editörü, logo/favicon/font yönetimi.
- Sürükle-bırak statik sayfa/blok düzenleyici.
- Kullanıcılar, roller/izinler, canlı KPI/gelir analitiği, etkinlik,
  modüller, VIP, ödeme talepleri, KYC kuyruğu ve destek biletleri için admin
  araçları.

---

## Modül Sistemi

Core, module boundary'lerini API seviyesinde uygular. Bir capability kurulu
değilse `MODULE_NOT_INSTALLED`; kurulu ama devre dışı veya lisanssızsa
`MODULE_DISABLED` döner. Böylece bir modülün yokluğu platformun kalanını
çökertmez.

Temel capability alanları:

| Capability | API yüzeyi | Not |
|---|---|---|
| **Betting** | `/api/events`, `/api/bets` | Ayrı commercial module |
| **iGames** | `/api/casino` | Core'daki generic aggregator seam'i üzerinden bağlanır; internal legacy gate ID'si `casino-content` olabilir |
| **In-house Games** | `/api/inhouse-provider`, `/api/provider/v1` | Ayrı commercial module |
| **Crypto Payment** | `/api/crypto` | Built-in |
| **KYC** | `/api/kyc` | Built-in |

Lisans kontrolü ve module state merkezi olarak yönetilir; geçici license-server
kesintileri için fail-tolerant grace davranışı, yerel expiration ve fail-closed
API gate'leri belgelenmiştir.

---

## Mimari ve Teknoloji Yığını

```text
client/    React 19 + Vite + Tailwind + Zustand
           SPA · PWA · Capacitor (iOS)
server/    Node.js + Express + MongoDB (Mongoose) + Socket.IO
           JWT auth · Zod validation · Helmet · rate limiting
installer/ Browser-based installation wizard (/install)
```

Öne çıkan teknik kararlar:

- Socket.IO üzerinden gerçek zamanlı oranlar, online player counter,
  live chat ve kazanç akışı.
- `moduleGate` ile API seviyesinde module/license enforcement.
- Paylaşılan UI bileşenleriyle template drift'in azaltılması.
- Auth, betting, wagering, module gate ve i18n için otomatik testler.

---

## Hızlı Başlangıç

### Tarayıcı tabanlı kurulum

```bash
npm run install:all
npm run build
npm start
```

Sunucu çalışırken `/install` adresinden veritabanı bağlantısı, ilk yönetici
hesabı ve site ayarları kurulum sihirbazıyla tamamlanabilir.

### Geliştirme

```bash
npm run dev
```

### Testler

```bash
npm test
npm run test:e2e
```

---

## Güvenlik

- JWT tabanlı oturum.
- `helmet`, Mongo sanitize ve katmanlı rate limiting.
- Admin TOTP 2FA.
- Module/license gate'leri API seviyesinde uygulanır.
- Ticari In-house Games modülündeki provably-fair mekanizma core'un parçası
  değildir.

Bu repository'nin üretim kullanılabilirliği, ayrıca hedeflenen jurisdiction,
ödeme sağlayıcıları, KYC/AML süreçleri, responsible-gaming yükümlülükleri,
operasyonel güvenlik ve ilgili regülasyonlar açısından ayrıca doğrulanmalıdır.

---

## Belgeler

Operatör dokümantasyonu [`docs/product/`](docs/product/) altındadır:

- [Kurulum](docs/product/01-kurulum.md)
- [Yapılandırma](docs/product/02-yapilandirma.md)
- [Modül Sistemi](docs/product/03-modul-sistemi.md)
- [API Referansı](docs/product/05-api-referansi.md)
- [SSS](docs/product/06-sss.md)
- [Video Storyboard'ları](docs/product/07-video-storyboardlari.md)
- [Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md)

Core'un built-in ödeme/KYC sağlayıcıları için [`docs/providers/`](docs/providers/)
altındaki provider dokümanlarına bakın.

---

## Yol Haritası

Aşağıdaki alanlar mevcut kod tabanında kısmi şema veya altyapıya sahip olsa da
uçtan uca tamamlanmış değildir:

- **Acente (reseller) sistemi** — `User` modelinde alanlar mevcut ancak bugün
  aktif route/controller/UI akışı yok.
- **Çok kademeli affiliate** — aktif yapı tek kademelidir.
- **Live casino** — core'da veya aktif commercial module'de çalışan bir
  implementation olarak bulunmaz; ileriye dönük bir alandır.

Ayrıntılar için [Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md).

---

## Lisanslama

Repository **Business Source License 1.1 (BUSL-1.1)** ile lisanslanır.

Lisansın mevcut Additional Use Grant'i kendi internal veya commercial
operation'ınız için self-hosting'e izin verir. Hosted/managed/white-label
PaaS olarak üçüncü taraflara sunmak veya core'u rakip bir software product
olarak yeniden satmak ayrı ticari anlaşma gerektirir.

**Change Date:** 2030-09-11  
**Change License:** Apache License 2.0

Tam şartlar için [`LICENSE`](LICENSE) dosyasına bakın.

---

## Proje Geçmişi

Commit geçmişi gerçek geliştirme sürecini yansıtır. Platform zaman içinde
**Betzone → Kismethane → VIP90.bet** olarak yeniden markalandı; eski
commit'lerdeki isimler aynı ürünün geçmiş marka evrimidir.

---

<sub>Node.js · Express · React · MongoDB · Socket.IO</sub>
