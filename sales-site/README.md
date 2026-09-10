# VIP90.bet — Satış Sitesi

VIP90.bet ürününü (frontend+backend çekirdeği açık kaynak/ücretsiz, in-house
oyunlar + canlı bahis verisi + Palace casino bağlayıcısı ayrı ücretli
eklentiler) tanıtan bağımsız pazarlama/satış sitesi. Ana platform kod
tabanıyla (`client/`, `server/`) ilgisi yoktur.

**2026-09-10 güncellemesi:** Site, kullanıcının birden fazla tasarım
denemesinden (v1 React/Vite uygulaması, v2-v4 statik taslaklar) sonra
seçtiği **v5** tasarımına indirgendi — diğerleri silindi. Artık **build
adımı olmayan saf HTML/CSS/JS + GSAP** (cdnjs üzerinden yüklenen
animasyon kütüphanesi). npm/Vite/React yok.

## Çalıştırma

Build adımı yok — dosyaları doğrudan aç veya herhangi bir statik sunucuyla servis et:

```bash
open sales-site/index.html
# ya da
npx serve sales-site/
```

## Deploy

Statik 3 dosya (`index.html`, `main.js`, `style.css`) — herhangi bir statik
host'a (Cloudflare Pages, Netlify, GitHub Pages, ya da mevcut sunucudan bir
static klasör olarak) doğrudan yüklenebilir. Sunucu çalışma zamanı gerekmez.

## Tasarım araştırması (v1'den korunmuştur, hâlâ geçerli)

TALİMAT gereği koddan ÖNCE yapıldı. Kaynaklar: büyük crypto casino
markalarının arayüz dilleri (Stake/Roobet tarayışı üzerine vaka
çalışmaları), pazarda aynı kategorideki doğrudan rakip ürün
sayfaları (ör. 1Stake) ve casino web tasarım trend analizleri.

### Gözlemlenen ortak dil (kategorinin beklentisi)

- **Koyu tema taban:** void-black/deep-navy zemin, üzerine neon vurgular.
- **Neon gradyan vurgular:** mor→cyan birincil gradyan; glow hover durumları.
- **Cam paneller (glassmorphism):** yarı saydam kartlar, blur arkaplan.
- **Tipografi:** geometrik grotesk başlık + ekran-optimize gövde; veri/
  rakamlarda monospace.
- **Güven rozetleri:** lisans, provably fair, RTP şeffaflığı — kategoride
  güven sinyali estetiği zorunlu.

### Nerede farklılaşmayı seçtik

1. **Dürüstlük bir tasarım öğesi olarak:** "Not Yet Included" bölümü
   görünür tutuluyor — rakiplerin zayıf noktası, bizim güçlü yanımız.
2. **Alıcı operatör, oyuncu değil:** sayfa B2B konuşur (kurulum, panel
   yetkileri, modül mimarisi) ama görsel dil oyuncu tarafının beklediği
   casino estetiğinde kalır.
3. **Marka sürekliliği** (2026-09-10'da sıkılaştırıldı): renk token'ları
   artık `client/tailwind.config.js`'teki gerçek marka paletiyle birebir
   eşleşiyor (`--green: #63d629`, `--gold: #f0b429`, `--bg: #060d1a`,
   `--bg-elevated: #111d30`) — önceden yaklaşık/farklı tonlardaydı.
4. **"Söylemek yerine göstermek":** Admin Panel bölümündeki Revenue
   Overview grafiği (7G/30G/90G buton geçişi) gerçek admin panelin
   AYNI el-yapımı SVG tekniğiyle inşa edildi — dekoratif değil, çalışan
   bir interaktif eleman.

### KESİN SINIR uyumu

Hiçbir rakip sitenin görseli indirilmedi/hotlink edilmedi, logo/marka adı
kullanılmadı, CSS/kod kopyalanmadı. Yalnızca tasarım DİLİ öğrenildi.

## Fiyatlandırma çerçevesi (2026-09-10'da düzeltildi)

Önceki tasarım denemelerinden biri (v5'in ilk hali) uydurma bir aylık SaaS
fiyatı ($299/ay) içeriyordu — bu KALDIRILDI. Şu an sayfa gerçek iş modelini
yansıtıyor: **Çekirdek platform (frontend+backend) ücretsiz/açık kaynak**,
**in-house oyunlar + canlı bahis verisi + Palace bağlayıcısı** ayrı,
kesin rakamı olmayan ("Get a Quote" CTA'lı) ücretli eklentiler. Hiçbir
gerçek satış fiyatı henüz belirlenmemiştir — sayfada uydurma rakam YOK.
