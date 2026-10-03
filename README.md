![VIP90.bet](https://img.shields.io/badge/VIP90.bet-iGaming%20Platform-1a2332?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.3.0-6366f1?style=flat-square)
![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/mongodb-8-47A248?style=flat-square&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)

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
├── Core Platform                  [Open source / AGPL-3.0]
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
└── Commercial Modules             [Separate packages / commercial license]
    ├── Betting
    ├── iGames
    │   └── Palace provider integration
    └── In-house Games
```

Core platform ile ticari capability modülleri bilinçli olarak ayrıdır. Core,
oyuncu ve operatör yaşam döngüsünün temelini sağlar; ticari modüller bahis,
üçüncü taraf casino içeriği ve proprietary oyunlar gibi capability'leri ekler.

### Neden bu ayrım?

- **Vendor bağımsızlığı:** Provider seçimi core'un veri modeline gömülmez.
- **Modüler satın alma:** İhtiyacınız olmayan capability için platformu
  baştan değiştirmeniz gerekmez.
- **Self-hosting:** Core kendi altyapınızda çalışır ve kendi markanızla
  işletilebilir.
- **Kaynak görünürlüğü:** Mimari, provider kontratları, module boundary'leri
  ve operasyonel akışlar incelenebilir.
- **AI/GitHub discoverability:** Proje açık mimari ve makinece okunabilir
  dokümantasyonla iGaming operator-core/PAM kategorisinde anlaşılabilir.

> **Lisans notu:** Core, OSI onaylı **GNU Affero General Public License v3.0**
> (AGPL-3.0-only) ile açık kaynaktır. Core'u kullanabilir, değiştirebilir ve
> kendi altyapınızda işletebilirsiniz; değiştirilmiş bir sürümü ağ üzerinden
> kullanıcılara sunuyorsanız, o sürümün kaynak kodunu da aynı lisansla
> kullanıcılarınıza sağlamanız gerekir. Ticari modüller (Betting, iGames,
> In-house Games) bu lisansa dahil değildir ve ayrı ticari lisansla dağıtılır.
> Ayrıntılar için [`LICENSE`](LICENSE) ve [Lisanslama](#lisanslama).

---

## İçindekiler

- [Öne Çıkanlar](#öne-çıkanlar)
- [Neler Dahil](#neler-dahil)
- [Modül Sistemi](#modül-sistemi)
- [Mimari ve Teknoloji Yığını](#mimari-ve-teknoloji-yığını)
- [Hızlı Başlangıç](#hızlı-başlangıç)
- [Güvenlik](#güvenlik)
- [Belgeler](#belgeler)
- [Bilinen Sınırlar](#bilinen-sınırlar)
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
| 🛠️ **Operations backoffice** | Kullanıcılar, analitik, destek, KYC, ödeme ve module yönetimi |
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
- Banka havalesi, USDT-TRC20 ve Slikair (kart/alternatif yöntemler — şu an
  yalnızca sandbox) ödeme akışları.
- KYC: yerel belge inceleme veya Sumsub.
- Bonus/wagering motoru ve 5 seviyeli VIP programı.
- Sonuçlanan bahis/round sonrası seviyeye göre gerçek zamanlı cashback.
- Admin için TOTP tabanlı 2FA ve rol/izin tabanlı admin yetkilendirmesi.

### Topluluk ve elde tutma

- Gerçek zamanlı canlı sohbet.
- Rain bonus dağıtımı ve oyuncular arası bahşiş.
- Son kazananlar, favoriler ve son oynananlar.
- Referans linki ve komisyon sistemi.
- Yapılandırılabilir çevrimiçi oyuncu sosyal kanıt katmanı.

### Uyum, risk ve finans operasyonları

- Sorumlu oyun: oyuncu tarafında yatırma/kayıp/bahis limitleri (günlük,
  haftalık, aylık), cool-off ve self-exclusion; admin tarafında hesap
  kısıtlama ve denetim kaydı.
- Kural tabanlı risk/fraud motoru: sinyaller, kurallar, bulgular ve risk
  panosu.
- Idempotent finansal ledger ve admin denetim izi (audit trail).
- Mutabakat (reconciliation) işleri — kripto kanalı TronGrid'e karşı gerçek
  veriyle; banka ve Slikair kanalları henüz dış kaynağa bağlı değil.
- Acente (reseller) yönetimi: oyuncu atama, fon transferi, komisyon.
- Oyuncu segmentleri; çoklu para birimi, marka ve jurisdiction tanımları
  (marka bazlı veri izolasyonu uygulanmaz — bkz. Bilinen Sınırlar).

### Marka, CMS ve operasyon

- Canlı önizlemeli tema editörü, logo/favicon/font yönetimi.
- Statik sayfa/blok içerik düzenleyici.
- Kullanıcı yönetimi, analitik, etkinlik, modüller, VIP, ödeme talepleri,
  KYC kuyruğu ve destek biletleri için admin araçları.
- Admin canlı aktivite akışı ve sohbet moderasyonu (sessize alma, yasaklama,
  mesaj silme).
- SEO ayarları: sunucu tarafı meta etiketleri, `robots.txt` ve `sitemap.xml`.
- Demo verisi tohumlama (vitrin/deneme kurulumları için).

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

## Bilinen Sınırlar

README yalnızca bugün doğrulanabilir olarak çalışan yetenekleri iddia eder.
Aşağıdaki noktalar özellikle tamamlanmış gibi sunulmaz:

- **Slikair ödeme ağ geçidi:** Entegrasyon yalnızca sandbox kimlik
  bilgileriyle çalışır; canlı ödeme için sağlayıcı tarafında KYB gerekir.
- **Mutabakat:** Banka ve Slikair kanallarında dış kaynak henüz yok; bu
  kanallardaki işler tüm kayıtları "dışarıda eksik" gösterir.
- **Çoklu marka:** `User`, `Transaction`, `Bet` gibi çekirdek modellerde
  `brandId` yoktur; markalar arası veri izolasyonu uygulanmaz.
- **Static page builder:** Statik sayfa/blok düzenleme vardır; tam sürükle-bırak
  görsel builder olarak sunulmaz.
- **Çok kademeli affiliate:** Aktif yapı tek kademelidir.
- **Live casino:** Core'da veya aktif commercial module'de çalışan bir
  implementation olarak bulunmaz.

Daha ayrıntılı kod referansları için [Bilinen Kısıtlar](docs/product/09-bilinen-kisitlar.md).

---

## Yol Haritası

Önceliklendirme, üretim kullanımı için gerekli güvenilirlik ve operatör
kontrol yüzeylerine göre yapılır. Özellikle aşağıdaki alanlar ürünün
olgunlaşma sırasındadır:

- Banka ve Slikair kanalları için gerçek mutabakat kaynakları
- Marka bazlı veri izolasyonu (çekirdek modellerde `brandId`)
- Görsel page-builder / drag-and-drop içerik düzenleme
- Çok kademeli affiliate
- İleri compliance otomasyonları ve regulatory reporting
- Live casino capability

---

## Lisanslama

Core, **GNU Affero General Public License v3.0** (`AGPL-3.0-only`) ile
lisanslanır.

- Kullanabilir, inceleyebilir, değiştirebilir ve kendi altyapınızda
  ticari olarak işletebilirsiniz.
- Değiştirilmiş bir sürümü ağ üzerinden kullanıcılara sunuyorsanız
  (AGPL §13), o sürümün tam kaynak kodunu kullanıcılarınıza aynı lisansla
  sağlamanız gerekir.
- Core'dan türetilmiş çalışmaları yeniden dağıtırken de AGPL-3.0 geçerlidir.

**Ticari modüller** (Betting, iGames, In-house Games) bu repository'de
bulunmaz, AGPL-3.0 kapsamında değildir ve ayrı ticari lisansla dağıtılır.

Tam şartlar için [`LICENSE`](LICENSE) dosyasına bakın.

---

## Proje Geçmişi

Commit geçmişi gerçek geliştirme sürecini yansıtır. Platform zaman içinde
**Betzone → Kismethane → VIP90.bet** olarak yeniden markalandı; eski
commit'lerdeki isimler aynı ürünün geçmiş marka evrimidir.

---

<sub>Node.js · Express · React · MongoDB · Socket.IO</sub>
