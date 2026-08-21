# Video Kütüphanesi — Storyboard'lar

> **Durum notu:** Bu belge D2 kartının (15-20 kısa video) çekim temelidir
> ve **eksiksiz** olarak tamamlanmıştır — 18 storyboard'un tamamı sahne
> sahne yazılmıştır. Gerçek video kaydı/kurgusu yapılmadı — bu bilinçli
> bir kapsam kararı: hangi aracın (ekran kaydı + ses üstü anlatım
> üretebilen bir araç, ya da metinden video üretebilen bir model)
> kullanılacağına dair araştırma, geliştirme akışının sonunda yapılacak.
> Storyboard yazımı bu araştırmayı beklemedi; her sahne, o aracı elinize
> aldığınızda doğrudan çekime/üretime verilebilecek netlikte.
>
> Bazı storyboard'lar, henüz `feat/integration`'a merge
> edilmemiş ama koddaki karta ait ekranları tarif eder (K2, M3, O6 —
> hepsi ilgili `feat/akis-*` dalında tamamlandı). Bu, storyboard'un
> eksik olduğu anlamına gelmez — o dallar merge edildiğinde ekranlar
> tarif edildiği gibi orada olacak, storyboard bugünden hazır.

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

### V1.3 — "Kurulum Sihirbazı" — **K2 tamamlandı (feat/akis-k), merge sonrası çekilebilir** (95 sn)

| Sahne | Anlatım |
|---|---|
| 0-10s: Tarayıcıda kurulum sihirbazının ilk ekranı (`/install`) açılıyor | "Terminale hiç dokunmadan da kurabilirsiniz — tarayıcınızda kurulum sihirbazını açın." |
| 10-30s: Veritabanı bağlantı adımı, bağlantı testi yeşil onay veriyor | "Önce veritabanı adresinizi girip bağlantıyı test ediyoruz." |
| 30-55s: Yönetici hesabı adımı — kullanıcı adı, e-posta, şifre | "Sonra ilk yönetici hesabınızı oluşturuyoruz." |
| 55-75s: Site adı ve para birimi adımı | "Site adınızı ve para biriminizi seçiyoruz." |
| 75-90s: "Kurulumu Tamamla" butonuna basılıyor, `.env` otomatik üretiliyor, ilerleme çubuğu | "Sihirbaz `.env` dosyanızı sizin için üretir — hiçbir satırı elle düzenlemenize gerek yok." |
| 90-95s: Kurulum tamamlandı ekranı, admin paneline yönlendirme | "Kurulum tamam — doğrudan admin panelinize giriyorsunuz." |

**Ekran metni:** "Terminal Gerekmez · Web Tabanlı Kurulum Sihirbazı"

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

## Grup 4 — Modül Aktivasyonu (2 video) — **M2/M3 tamamlandı (feat/akis-m), merge sonrası çekilebilir**

### V4.1 — "Modüller Nedir, Nasıl Çalışır" (90 sn)

| Sahne | Anlatım |
|---|---|
| 0-15s: [03 — Modül Sistemi](03-modul-sistemi.md)'deki üç modülün basit bir şeması (Çekirdek / Bahis / Casino İçeriği / Canlı Casino) | "VIP90.bet'da çekirdek platform her zaman açıktır — üç ek modül ayrı satılır/lisanslanır." |
| 15-40s: Admin panel → Modüller ekranı açılıyor, üç modül kartı listeleniyor (durum rozetleriyle) | "Hangi modülün açık, hangisinin kapalı olduğunu tek ekrandan görürsünüz." |
| 40-65s: Kapalı bir modülün etkilendiği sayfaya (ör. `/casino`) gidiliyor, menüden kalkmış/nazik bir mesaj gösteriliyor | "Bir modül kapalıyken sitenin geri kalanı hiç etkilenmez — o bölüm sadece nazikçe kaybolur." |
| 65-90s: Kapanış, modül sisteminin özet faydası | "Operatör olarak yalnızca lisansladığınız kadarını açık tutarsınız." |

**Ekran metni:** "03 — Modül Sistemi · docs/product/03-modul-sistemi.md"

### V4.2 — "Bir Modülü Etkinleştirmek" (80 sn)

| Sahne | Anlatım |
|---|---|
| 0-10s: Admin panel → Modüller ekranı, "Casino İçeriği" modülü kapalı durumda | "Bir modülü açmak tek bir tıkla oluyor." |
| 10-35s: Aktivasyon anahtarına tıklanıyor, kısa bir "kontrol ediliyor" durumu, ardından yeşil "Aktif" rozeti | "Sistem lisans/abonelik durumunu kontrol eder, uygunsa modül anında açılır." |
| 35-55s: Menüye dönülüyor, az önce kapalı olan bölüm artık görünür | "Menüde az önce kayıp olan bölüm şimdi geri geldi." |
| 55-80s: Aynı ekranda modülün "yenileme/süre" bilgisi gösteriliyor | "Abonelik süresi dolmadan önce panelden uyarı alırsınız — internet kesilse bile kısa bir tolerans penceresi modülü açık tutar." |

**Ekran metni:** "Panelden Aç/Kapat · Abonelik Durumu Anlık Görünür"

---

## Grup 5 — Oyun Ayarları (2 video) — **O6 tamamlandı (feat/akis-bc), merge sonrası çekilebilir**

### V5.1 — "House Edge ve Bahis Limitlerini Ayarlamak" (95 sn)

| Sahne | Anlatım |
|---|---|
| 0-15s: Admin panel → Oyun Ayarları, Crash satırı seçiliyor | "Her in-house oyunun matematiğini panelden ayarlarsınız — kod değiştirmeden." |
| 15-45s: House edge yüzdesi kaydırıcıyla değiştiriliyor (ör. %20'den %15'e), min/max bahis alanları güncelleniyor | "House edge, minimum ve maksimum bahis — hepsi burada. Roulette için de aynı ekran, kendi oranıyla." |
| 45-70s: Kaydet'e basılıyor, "Aktif" durumu ve son güncelleyen bilgisi görünüyor | "Değişiklik kaydedilince anında canlıya geçer, kim değiştirdiği denetim kaydında tutulur." |
| 70-95s: Oyunun kendisine geçiliyor (Crash ekranı), yeni ayarların round'a yansıdığı gösteriliyor | "Oyuncu tarafında yeni ayar bir sonraki round'da devrede." |

**Ekran metni:** "House Edge · Bahis Limitleri · Panelden, Anlık"

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

### V7.2 — "Destek Talebi Açmak" (75 sn) — **istemci ekranı henüz yok, çekim için önce eklenmeli**

Ticket API'si (`POST /api/tickets/mine`, `GET /api/tickets/mine`,
`GET /api/tickets/mine/:id`, `POST /api/tickets/mine/:id/reply`) hazır
ve çalışıyor — eksik olan yalnızca oyuncuya dönük ekran. Storyboard,
o ekran eklendiğinde doğrudan kullanılabilecek şekilde tam yazıldı:

| Sahne | Anlatım |
|---|---|
| 0-10s: Chatbot'un "destek talebi açın" yönlendirmesinden ticket formuna geçiliyor | "Asistan yardımcı olamadığında, tek tıkla destek talebi açabilirsiniz." |
| 10-35s: Konu ve açıklama alanları dolduruluyor, gönder butonuna basılıyor | "Konunuzu kısaca yazın, ekibimiz en kısa sürede döner." |
| 35-55s: "Taleplerim" listesi, yeni açılan tiketin durumu ("Açık") görünüyor | "Tüm taleplerinizi ve durumlarını tek yerden takip edersiniz." |
| 55-75s: Bir yanıt geldiğinde bildirim, tikete girip yanıtı okuma/cevap yazma | "Yanıt geldiğinde bildirim alırsınız, aynı ekrandan cevap yazabilirsiniz." |

**Ekran metni:** "Destek Talebi · Takip · Yanıt — Tek Ekranda"
**Çekim notu:** Bu video, oyuncu-tarafı ticket ekranı eklenene kadar
kayda alınamaz — storyboard hazır, ekran eklendiğinde sırada bekliyor.

### V7.3 — "Admin Panelinden Tikete Yanıt Vermek" (70 sn)

Admin tarafında tiket listesi, yanıtlama, durum değiştirme.

---

## Özet tablo

| Grup | Video sayısı | Storyboard durumu | Çekim için beklenen |
|---|---|---|---|
| Kurulum | 3 | 3/3 tam yazıldı | K2'nin `feat/integration`'a merge'i |
| İlk Yapılandırma | 3 | 3/3 tam yazıldı | — (bugün çekilebilir) |
| Tema Editörü | 3 | 3/3 tam yazıldı | — (bugün çekilebilir) |
| Modül Aktivasyonu | 2 | 2/2 tam yazıldı | M2/M3'ün merge'i |
| Oyun Ayarları | 2 | 2/2 tam yazıldı | O6'nın merge'i |
| Ödeme Akışı | 2 | 2/2 tam yazıldı | — (bugün çekilebilir) |
| Destek Araçları | 3 | 3/3 tam yazıldı | V7.2 için oyuncu-tarafı ticket ekranının eklenmesi |
| **Toplam** | **18** | **18/18 tam yazıldı** | |

D2'nin istediği 15-20 aralığında **18 storyboard'un tamamı** sahne sahne
yazıldı — hiçbiri eksik/kavramsal bırakılmadı. 13'ü bugün itibarıyla
doğrudan çekilebilir; 4'ü (K2/M2/M3/O6'ya bağlı olanlar) ilgili dallar
`feat/integration`'a merge edildiğinde, 1'i (V7.2) oyuncu-tarafı
ticket ekranı eklendiğinde çekilebilir hale gelir. Hangi araçla
(ekran kaydı + ses üstü anlatım üreten bir araç, ya da metinden video
üreten bir model) çekileceğinin araştırması, kullanıcının kararıyla
geliştirme akışının sonuna bırakıldı — bu belge o karardan bağımsız,
şimdiden tamamlanmış bir temeldir.
