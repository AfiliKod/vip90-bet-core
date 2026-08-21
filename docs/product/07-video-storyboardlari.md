# Video Kütüphanesi — Storyboard'lar

> **Durum notu:** Bu belge D2 kartının (15-20 kısa video) çekim temelidir.
> Gerçek video kaydı/kurgusu yapılmadı — bu bir yetenek sınırı (kayıt ve
> düzenleme araçlarına erişimim yok). Aşağıdaki her storyboard, ekranda
> ne olacağını, ne söyleneceğini ve süresini adım adım tarif eder; bir
> kayıt aracı ya da video üretim modeli (metin/ekran-kaydından video
> üretebilen bir araç) bu temelin üzerine gerçek videoyu üretebilir.
> Hangi aracın kullanılacağına dair araştırma, geliştirme akışının
> sonunda yapılacak — bu belge o zamana kadar değişmeyecek bir temel.
>
> **Yalnızca bugün var olan özellikler storyboard'landı.** Henüz
> tamamlanmamış kartlara (K2-K4, O6 birleşmemiş) bağlı videolar ayrı
> işaretlendi — o kartlar bittiğinde çekilebilir hale gelecek.

## Format kuralı

Her video: **60-120 saniye**, ekran kaydı + ses üstü anlatım (voice-over),
alt yazı Türkçe + İngilizce (i18n altyapısı hazır, metin dosyaları ayrı
tutulacak). Her storyboard şu yapıyı takip eder:

- **Sahne** — ekranda ne görünüyor (saniye aralığıyla)
- **Anlatım** — voice-over metni
- **Ekran metni** — varsa vurgulanan başlık/callout

---

## Grup 1 — Kurulum (3 video)

### V1.1 — "VIP90.bet'u 5 Dakikada Kurmak" (90 sn)

| Sahne | Anlatım |
|---|---|
| 0-10s: Terminal ekranı, boş bir VPS | "VIP90.bet'u kurmak için tek ihtiyacınız bir VPS ve beş dakika." |
| 10-30s: `npm run install:all` çalışıyor | "Önce bağımlılıkları kuruyoruz — tek komut, hem sunucu hem istemci." |
| 30-55s: `.env` dosyası düzenleniyor, zorunlu alanlar vurgulanıyor | "Sonra `.env` dosyasında veritabanı adresinizi ve güvenlik anahtarlarınızı giriyoruz." |
| 55-75s: `npm run build && npm start` | "Derleyip başlatıyoruz." |
| 75-90s: Tarayıcıda çalışan site | "İşte bu kadar — VIP90.bet artık çalışıyor." |

**Ekran metni:** "01 — Kurulum · docs/product/01-kurulum.md"

### V1.2 — "Docker ile Tek Komut Kurulum" — **K1 tamamlandı, çekilebilir**

Docker Compose + Caddy ters vekil akışını gösterir: `docker compose up`,
otomatik SSL sertifikası, servislerin ayağa kalkışı.

### V1.3 — "Kurulum Sihirbazı" — **K2 bekliyor, bitince çekilecek**

Terminal açmadan tamamlanan kurulum akışını gösterecek.

---

## Grup 2 — İlk Yapılandırma (3 video)

### V2.1 — "İlk Giriş ve Admin Paneline Genel Bakış" (100 sn)

| Sahne | Anlatım |
|---|---|
| 0-15s: Giriş ekranı, admin hesabıyla giriş | "Kurulumdan sonra admin hesabınızla giriş yapın." |
| 15-40s: Admin panel ana ekranı, sol menü gezintisi | "Sol menüde kullanıcılar, etkinlikler, casino istatistikleri ve ayarlar bulunuyor." |
| 40-70s: Ayarlar sayfası, panelden yönetilen değerler | "Bazı ayarlar `.env` dosyasında, bazıları panelden anında değiştirilebiliyor — tema rengi gibi." |
| 70-100s: Genel gösterge paneli, analitik grafikleri | "Ana panelde günlük istatistikleri görürsünüz." |

### V2.2 — "Ortam Değişkenlerini Anlamak" (110 sn)

`.env` dosyasındaki her bölümü (MongoDB, JWT, SMTP, Casino sağlayıcı)
tek tek gösterip açıklar — [02 — Yapılandırma](02-yapilandirma.md)'nın
görsel karşılığı.

### V2.3 — "Site Adı, Logo ve İlk Marka Ayarları" — **A3 tamamlandı, çekilebilir**

Panelden logo/favicon/site adı/font yükleme akışı.

---

## Grup 3 — Tema Editörü (3 video) — **A1/A2 tamamlandı, hepsi çekilebilir**

### V3.1 — "Renk Temasını Değiştirmek" (75 sn)

| Sahne | Anlatım |
|---|---|
| 0-10s: Admin panel, Tema sekmesi açılıyor | "Tema editörüne admin panelden ulaşırsınız." |
| 10-40s: Birincil renk değiştiriliyor, canlı önizleme | "Rengi değiştirdiğinizde, sağdaki önizleme anında güncelleniyor." |
| 40-60s: Kaydet'e basılıyor, siteye geçiliyor, aynı renk her yerde | "Kaydedince değişiklik kod yazmadan tüm siteye yayılıyor." |
| 60-75s: Kapanış | "Hiçbir yeniden derleme gerekmiyor." |

### V3.2 — "Üç Hazır Tema Arasında Geçiş" — **A6 tamamlandı**

Hazır tema paketlerinin (varsayılan + 2 alternatif) arasında geçişi gösterir.

### V3.3 — "Ana Sayfa Düzenini Değiştirmek" — **A4 tamamlandı**

Banner, kampanya bloğu ve bölüm sırasının panelden düzenlenmesi.

---

## Grup 4 — Modül Aktivasyonu (2 video) — **M2/M3 bekliyor**

### V4.1 — "Modüller Nedir, Nasıl Çalışır" (90 sn) — **kısmen çekilebilir**

Bugün panelden aç/kapa ekranı olmadığı için bu video kavramsal kalır:
çekirdek platform ile bahis/casino/canlı-casino modülleri arasındaki
farkı, [03 — Modül Sistemi](03-modul-sistemi.md) temelinde anlatır.
Panelden aktivasyon ekranı (M3) bittiğinde bu video **elden geçirilip**
gerçek ekran kaydıyla güncellenecek.

### V4.2 — "Bir Modülü Etkinleştirmek" — **M3 bekliyor, bitince çekilecek**

---

## Grup 5 — Oyun Ayarları (2 video) — **O6, henüz ana dala birleşmedi**

### V5.1 — "House Edge ve Bahis Limitlerini Ayarlamak" — **O6 bekliyor**

Panelden Crash/Roulette için house edge ve min/max bahis ayarlarının
değiştirilmesi. O6 kartı `feat/akis-bc` dalında tamamlandı ama henüz
`feat/integration`'a birleşmedi — birleştikten sonra çekilebilir.

### V5.2 — "Oyun Matematiğini Anlamak (Provably Fair)" (100 sn) — **bugün çekilebilir**

| Sahne | Anlatım |
|---|---|
| 0-20s: Bir Crash round'u oynanıyor | "Her round, önceden belirlenemeyen bir sunucu tohumuyla hesaplanır." |
| 20-60s: [04 — Oyun Matematiği](04-oyun-matematigi.md)'ndeki HMAC formülü ekranda, basitleştirilmiş anlatım | "HMAC-SHA256 ile hash'lenen bu tohum, sonucu belirler — kimse önceden bilemez." |
| 60-100s: House edge tablosu gösteriliyor | "Her oyunun house edge değeri belgelerde açık şekilde yazılı." |

---

## Grup 6 — Ödeme Akışı (2 video) — **bugün çekilebilir**

### V6.1 — "Banka Havalesi ile Para Yatırma" (85 sn)

Oyuncu tarafı: yatırma talebi oluşturma. Admin tarafı: talebi onaylama,
bakiyenin güncellenmesi.

### V6.2 — "USDT-TRC20 ile Kripto Yatırma" (85 sn)

Cüzdan adresi gösterimi, işlem takibi, otomatik onay akışı.

---

## Grup 7 — Destek Araçları (3 video) — **D3/D5 tamamlandı, hepsi çekilebilir**

### V7.1 — "Yardım Asistanına Soru Sormak" (70 sn)

Chatbot widget'ı açılır, bir kurulum sorusu sorulur, dokümana dayalı
cevap gösterilir. Ardından bilinmeyen bir konu sorulup asistanın
"destek talebi açın" yönlendirmesi gösterilir — D3'ün kabul kriterinin
görsel kanıtı.

### V7.2 — "Destek Talebi Açmak" (75 sn)

Oyuncu tarafında ticket oluşturma — **not: bu akışın istemci ekranı
henüz yok (D5 yalnızca backend), bu video o ekran eklenince çekilecek.**

### V7.3 — "Admin Panelinden Tikete Yanıt Vermek" (70 sn)

Admin tarafında tiket listesi, yanıtlama, durum değiştirme.

---

## Özet tablo

| Grup | Video sayısı | Bugün çekilebilir | Bekleyen kart |
|---|---|---|---|
| Kurulum | 3 | 2 | K2 |
| İlk Yapılandırma | 3 | 3 | — |
| Tema Editörü | 3 | 3 | — |
| Modül Aktivasyonu | 2 | 0,5 | M2, M3 |
| Oyun Ayarları | 2 | 1 | O6 (birleştirme bekliyor) |
| Ödeme Akışı | 2 | 2 | — |
| Destek Araçları | 3 | 2 | D5 istemci ekranı |
| **Toplam** | **18** | **13,5** | |

18 video storyboard'landı (D2'nin istediği 15-20 aralığında). Bugün
itibarıyla 13-14'ü gerçekten çekilebilir durumda; kalanı bağlı olduğu
kart tamamlanınca.
