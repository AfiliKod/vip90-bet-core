# VIP90.bet — Satış Sitesi (V4)

VIP90.bet ÜRÜNÜNÜ (yazılım lisansı) satan bağımsız
pazarlama/satış sitesi. Ana platform kod tabanıyla (client/, server/)
ilgisi yoktur — bu dizin kendi başına derlenen statik bir sitedir.

**Framework kararı:** sade Vite + React. Gerekçe (tek cümle): depo zaten
Vite+React stack'i kullanıyor (client/), checkout etkileşimi bileşen
yaklaşımıyla hızlı gelişiyor ve statik pazarlama sayfası için SSR/sunucu
çalışma zamanına gerek yok.

## Tasarım araştırması

TALIMAT gereği koddan ÖNCE yapıldı. Kaynaklar: büyük crypto casino
markalarının arayüz dilleri (Stake/Roobet tarayışı üzerine vaka
çalışmaları ve tasarım referansları), pazarda aynı kategorideki
doğrudan rakip ürün sayfaları (ör. 1Stake — $500, 1.151 satış, 4.99
puan) ve 2025-26 casino web tasarım trend analizleri.

### Gözlemlenen ortak dil (kategorinin beklentisi)

- **Koyu tema taban:** void-black/deep-navy zemin (#0A0E17–#111827 bandı),
  üzerine neon vurgular. Açık temalı casino arayüzü kategoride neredeyse yok.
- **Neon gradyan vurgular:** mor→cyan birincil gradyan; butonlar, kenarlıklar
  ve başlıklarda parlayan (glow) hover durumları.
- **Cam paneller (glassmorphism):** yarı saydam kartlar, blur arkaplan,
  ince gradyan kenarlıklar — katmanlı derinlik hissi.
- **Tipografi:** geometrik grotesk başlık (Space Grotesk türü) + ekran-
  optimize gövde (Inter türü); veri/rakamlarda monospace kullanımı.
- **Güven rozetleri:** lisans, provably fair, RTP şeffaflığı, SSL —
  Roobet yeniden tasarım vaka çalışmasında "trust" bir numaralı endişe
  olarak çıkıyor; kategoride güven sinyali estetiği zorunlu.
- **Rakip ürün sayfası anatomisi (1Stake):** tek paragraf değer önerisi
  ("turnkey", "launch quickly"), "What's included" kutu-içeriği bölümü,
  modül/eklenti listesi ayrı fiyatlarla, Live Preview + Screenshots CTA'ları,
  satış adedi + puan + destek rozetleri.

### Nerede farklılaşmayı seçtim

1. **Dürüstlük bir tasarım öğesi olarak:** bu kategori abartılı iddia ile
   dolu ("everything included!" sonra her şey add-on). VIP90.bet'un doküman
   kültürü zaten dürüst (docs/product README "Durum notu (dürüstlük)");
   satış sayfasında da "Kutuda ne var / Ne yok" bölümünü görünür bir tasarım
   öğesi olarak tuttum — rakiplerin zayıf noktası, bizim güçlü yanı.
2. **Alıcı operatör, oyuncu değil:** sayfa B2B konuşur (kurulum süresi,
   panel yetkileri, modül mimarisi, kaynak kod teslimi) ama görsel dil
   oyuncu tarafının beklediği casino estetiğinde kalır — alıcı kendi
   markasının böyle görüneceğini hayal edebilmeli.
3. **Marka sürekliliği:** ana platformun gerçek paleti (#00d4ff cyan
   birincil, mor accent) kullanıldı — alıcı demoya geçtiğinde görsel kopuk
   yaşamaz.
4. **İşçilik:** jenerik template hissi yerine gerçek içerik hiyerarşisi,
   boşluk ritmi ve tek fikirli hareket dili (yalnızca transform/opacity,
   INP-dostu).

### KESİN SINIR uyumu

Hiçbir sitenin görseli indirilmedi/hotlink edilmedi, logo/marka adı
kullanılmadı, CSS/kod kopyalanmadı. Yalnızca tasarım DİLİ öğrenildi;
tüm görsel varlıklar FLUX.1-schnell ile orijinal üretildi (bkz. aşağıda).

## Lisans teslimatı — TASARIM (mock/placeholder)

Tam otomasyon kurulu DEĞİL; satın alma sonrası akış şu şekilde tasarlandı:

1. Alıcı ödemeyi yapar (doğrudan satış kanalı).
2. Doğrudan satışta: ödeme sağlayıcısı webhook'u tetiklenir (mock).
3. Sistem benzersiz bir lisans kaydı oluşturur: `{ purchaseCode, email,
   date, edition }`.
4. Lisans anahtarı + indirme linki otomatik e-posta ile gider (mock —
   gerçekte e-posta sağlayıcısı bağlanacak).
5. İndirme linki sürümlü zip'e işaret eder; satın alma kaydı destek süresi
   ve güncelleme hakkını belirler.

Bu tasarımın kod karşılığı bu kartta YOKTUR — checkout gönderimi test
modunda sahte bir uca yapar ve "bu bir demo akışıdır" ekranı gösterir.

## Ödeme — TEST/SANDBOX sınırı

Gerçek ödeme entegrasyonu YOKTUR. `.env.example` içindeki
`PAYMENT_PROVIDER_KEY=sk_test_...` placeholder'ı yalnızca sandbox şekli
gösterir. Canlıya alma insan onayı gerektirir; bu koda yazılmadı.

## Fiyatlandırma

Hiçbir gerçek satış fiyatı belirlenmemiştir (docs/product/06-sss.md
doğruluyor). Sayfada fiyat gereken yerlerde
`[FİYAT — insan onayı bekliyor]` placeholder'ı kullanılır. Sepet mantığı
fiyat bilinmediğinde toplam üretmez, placeholder gösterir.

## Çalıştırma

```bash
npm install
npm run dev      # geliştirme
npm run build    # statik çıktı (dist/)
node --test tests/*.test.mjs   # saf mantık testleri
```
