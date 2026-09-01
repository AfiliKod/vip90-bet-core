# Changelog

VIP90.bet iGaming Platform — değişiklik günlüğü.

Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esasına,
sürümleme [Semantic Versioning](https://semver.org/lang/tr/) kuralına dayanır.
Bu günlük yalnızca `feat/integration` dalındaki ürün
geliştirmelerini kapsar; canlı işletilen sitenin bakımı `dev` dalında sürer.

Madde formatı ve kategoriler için `docs/CHANGELOG_GUIDE.md`'ye bakın —
özellikle **Kırılan Değişiklikler** kategorisi zorunludur, atlanmaz.

## [Yayınlanmadı]

### Kritik: oddsSource canlı senkronizasyon WS hatası tüm sunucuyu çökertiyordu
`jobs/oddsSourceLiveSync.js`'teki `nodeupd` Socket.IO bağlantısında `ws.onerror = () => ws.close();` deseni — bir bağlantı hatasında `close()` çağrısı bazen (undici/`ws` kütüphanesinin bilinen bir tuzağı) yeni bir `error` event'i daha fırlatıyor, bu da `onerror`'ı SENKRON olarak yeniden tetikleyip sonsuz özyinelemeyle `RangeError: Maximum call stack size exceeded` ile **backend process'ini komple çökertiyordu**. `node --watch` her seferinde otomatik yeniden başlattığı için görünürde "çalışıyor" gibiydi, ama her çöküş anında Vite dev proxy'sinin o anki `/socket.io` bağlantıları "http proxy error" ile başarısız oluyordu (kullanıcının fark ettiği asıl belirti — proxy/socket.io yapılandırması değil, backend'in kendisiydi). Basit bir `erroring` bayrağı + `try/catch` ile ikinci `onerror` girişi yok sayılıyor artık.

### Çevrimiçi sayaç artık polling değil, socket push
`GET /api/health/status`'un 10sn'de bir polling'i (madde: "neden hâlâ HTTP ile, socket zaten açıkken") tamamen kaldırıldı. Yeni `server/src/services/onlineCount.js` — `getOnlineCount()`/`broadcastOnlineCount()` — bir socket bağlanınca/koparınca (`socket/handler.js`) ve fake-winners oyuncu havuzu yeniden zarlanınca (`fakeWinners.js` `regeneratePool()`, admin ayar kaydında da tetikleniyor) tüm bağlı client'lara `online:count` event'i yayınlıyor. `useOnlineCount.js` artık yalnızca İLK değeri (guest/socket-bağlı-değilken flaş önlemek için) `GET /api/health/status`'tan tek seferlik çekiyor, sonrası socket'ten geliyor — `setInterval` tamamen kalktı. `/api/health/status` zaten rate limiter'dan muaftı (`skip:` — hiçbir zaman 429'a sebep olamazdı), ama tekrarlı istek olması gereksizdi; artık yok.

Canlı doğrulama: bir sekmede anasayfa açık bırakıldı, ikinci sekmeden admin'de oyuncu havuzunu 200-300'den 500-500'e değiştirip kaydedince, ilk sekmedeki sayaç **hiçbir sayfa yenileme/HTTP isteği olmadan** 290'dan 506'ya güncellendi (`read_network_requests` ile 16sn+ boyunca `/health/status`'a tek bir istek gittiği doğrulandı).

### Kaydırma butonu artık çift yönlü
`ScrollHintArrow.jsx` (ProviderRow + GameRowSection) yalnızca sağa değil, satır sağa kaydırılıp solda oyun biriktiğinde sola da kaydırabiliyor — sol/sağ butonlar bağımsız olarak, yalnızca o yöne gerçekten kaydırılabilirken görünüyor (satırın başında sol buton, sonunda sağ buton kayboluyor). Tarayıcıda uçtan uca doğrulandı.

`AllGamesSection.jsx`'in ("Tüm Oyunlar") `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8` responsive grid'i bir önceki turda zaten eklenmişti — ekran genişliğine göre 2/3/4/6/8 arası farklı sayıda oyun gösteriyor, kart genişlikleri sabit değil (grid hücresi kadar esniyor). Bu oturumda tarayıcı otomasyon aracının pencereyi gerçekten daraltamaması nedeniyle mobil genişlikte görsel doğrulama YAPILAMADI — mekanizma standart Tailwind responsive grid deseni, kod değişikliği gerekmedi.

### Kaydırma butonu, 8'li grid, misafir kazananlar, doğru çevrimiçi sayacı, admin sadeleştirme, rate limit
Bir önceki turdaki özelliklerin gerçek kullanımda ortaya çıkan sorunlarını düzeltir.

**Düzeltildi:**
- **Kaydırma ipucu → gerçek buton** — `ScrollHintArrow.jsx` artık salt görsel
  bir fade+ikon değil, tıklanınca satırı yumuşak kaydıran (`scrollBy`), daha
  büyük/belirgin dairesel bir buton (`ProviderRow` + `GameRowSection`).
- **"Tüm Oyunlar" artık bir satırda 8 oyun** — `AllGamesSection.jsx` grid'i
  `lg:grid-cols-6`'dan `lg:grid-cols-8`'e (xl breakpoint), sayfalama 30'dan
  40'a (8×5) çıktı — diğer `GameRowSection` satırlarıyla aynı yoğunluk.
- **`GET /api/inhouse/recent-winners` artık herkese açık** — bu route
  `router.use(requireAuth)`'un ÖNÜNE alındı; misafir kullanıcılar 401
  alıp Son Kazananlar panelini/şeridini hiç göremiyordu (route dosyasındaki
  diğer TÜM uçlar hâlâ login gerektiriyor, yalnızca bu salt-okunur/herkese
  açık sosyal-kanıt ucu ayrıldı).
- **Çevrimiçi sayaç yanlış kaynaktan besleniyordu** — `GET /api/health/status`
  bot payını `User.countDocuments({isBot:true,...})`'tan (P3'ün gerçek bot
  mimarisi — şu an yalnızca birkaç, çoğu pasif kayıt, "200-300" ayarını hiç
  yansıtmıyordu) değil, artık `services/fakeWinners.js`'in periyodik
  yeniden-zarlanan oyuncu havuzu büyüklüğünden (`getPoolSize()`) alıyor —
  admin'deki "Oyuncu Havuzu (min/maks)" ayarı gerçekten burayı besliyor.
- **Favori kalp ikonu artık gerçekten "içi dolu"** — `material-symbols-outlined`
  sınıfı varsayılan `FILL:0` kullandığından, favorilenince yalnızca renk
  değişip glyph ince bir anahat olarak kalıyordu (görsel fark yetersizdi).
  `HomeUI.jsx`'teki `FavoriteButton` artık tek "favorite" glyph'i +
  `font-variation-settings: 'FILL' 1/0` ile favorilenince gerçek bir solid
  kalp, favorilenmeyince anahat kalp render ediyor.
- **Global rate limit çok düşüktü (200/15dk)** — modern bir SPA'nın normal
  kullanımı (ilk yüklemede 10+ paralel istek, çevrimiçi sayacı 10sn'de bir
  polling, aynı IP'den birden fazla sekme/kullanıcı) bunu kısa sürede aşıp
  meşru trafiği 429'a düşürüyordu. `globalLimiter.max` 1200'e çıkarıldı.

**Değiştirildi:**
- **Admin `/admin/bots` sayfası sadeleştirildi** — "Bot Oyuncular" (isBot
  bayraklı GERÇEK User hesaplarının liste/oluştur/başlat/durdur/sil UI'ı)
  kaldırıldı: kozmetik "Son Kazananlar" akışının yanında ayrı, kafa
  karıştırıcı ve siteteki çevrimiçi sayısını yansıtmayan bir yönetim
  yüzeyiydi (backend'deki P3 bot mimarisi — `services/bot.js`,
  `jobs/botScheduler.js` — dokunulmadan duruyor, yalnızca admin UI'ından
  kaldırıldı; tek gerçek bot kaydı zaten pasifti). Geriye kalan "Son
  Kazananlar Simülasyonu" kartı Oyuncu Havuzu / Kazanç Zamanlaması / Kazanç
  Tutarı Aralığı / Kazanç Alanları olarak gruplandı, her bölüme havuzun
  çevrimiçi sayacını da beslediğini ve zamanlama alanlarının ne anlama
  geldiğini açıklayan metinler eklendi. `Dashboard.jsx`'teki kısayol kartı
  buna göre yeniden etiketlendi.

### Kaydırma ipucu, sayfa-içi sağlayıcı filtresi, Tüm Oyunlar grid'i, çevrimiçi/bot sayacı, bot kazanç alanları
Anasayfa etkileşimini ve "Son Kazananlar Simülasyonu" ayarlarını genişletir.

**Eklendi:**
- **Kaydırma ipucu oku** — yeni `ScrollHintArrow.jsx`, `ProviderRow` ve
  `GameRowSection` satırlarının sağ kenarında, satır gerçekten sağa
  kaydırılabilirken bir gradient-fade + ok ikonu gösterir; sona gelince
  kaybolur.
- **"Tüm Oyunlar" artık gerçek bir grid alanı** — yeni `AllGamesSection.jsx`:
  diğer satırlar gibi rastgele örneklenmiş oyunları 6-sütun × 5-satır (30)
  grid'de gösterir, "Daha Fazla Göster" butonu her tıklamada +30 açar.
  Kaydırılabilir DEĞİL — önceki tek-link kartın yerini aldı.
- **Sayfa-içi sağlayıcı filtresi** — `ProviderRow`'dan bir sağlayıcıya
  tıklamak artık `/casino`'ya GİTMİYOR: sayfada kalıp diğer kürasyonlu
  satırları (Popüler/Özel/Slot/Yeni) gizliyor, "Tüm Oyunlar" alanını
  yalnızca o sağlayıcının oyunlarıyla dolduruyor ("× Filtreyi Kaldır" ile
  geri dönülür). `/casino?provider=X` deep-link'i (`CasinoRedesign.jsx`)
  hâlâ duruyor, yalnızca ProviderRow'un davranışı değişti.
- **Çevrimiçi + bot sayacı** — sağ raydaki Son Kazananlar panelinin "Tümü"
  linki yerine artık çevrimiçi kullanıcı sayısı (`useOnlineCount.js`)
  gösteriliyor; backend `GET /api/health/status`'un `onlineCount`'u artık
  gerçek socket bağlantısı + anlık aktif bot sayısı (`isBot:true,
  isActive:true`) toplamı. Sayfanın en üstündeki ayrı yeşil "X çevrimiçi |
  PWA" bandı (`OnlineStatusIndicator`) kaldırıldı.
- **Bot kazanç alanları** — `/admin/bots`'taki Son Kazananlar Simülasyonu
  ayarlarına "Kazanç Alanları" eklendi: Çekirdek (in-house, her zaman
  açık) + Casino oyunları + Bahisler. İkinci ikisi yalnızca ilgili modül
  (`casino-content`/`betting`) sitede gerçekten kullanılabilirken
  (`isModuleUsable` — panel anahtarı VE lisans) seçilebilir/etkilidir;
  `services/fakeWinners.js` artık her ateşlemede etkin alanlardan birini
  rastgele seçiyor — Casino kazananları Palace'ın gerçek CDN görseliyle
  (`addRecentWinner`'a yeni `image` alanı), Bahis kazananları jenerik bir
  pazar/takım havuzundan (gerçek fikstür verisine dokunmuyor).

### Favoriler, Son Oynananlar, arama, sağlayıcı rayı, navbar sadeleştirme
Anasayfa sol menüsündeki placeholder "Yakında" satırlarını gerçek özelliğe çevirir, navbar'ı sadeleştirir.

**Eklendi:**
- **Favoriler** — her oyun kartında kalp ikonu (`FavoriteButton`), `User.favoriteGames`
  (`{gameId, kind}`, Palace için `game_code` in-house için route path) alanına
  `POST /api/users/me/favorites/toggle` ile ekler/çıkarır; `GET /api/users/me/favorites`.
  Sol menüdeki "Favoriler" artık `/favorites` sayfasına gidiyor (yeni `Favorites.jsx`).
- **Son Oynananlar** — bir oyun kartına tıklanınca (fire-and-forget)
  `POST /api/users/me/recently-played` ile kaydediliyor; `User.recentlyPlayed`
  dizisi dedupe + en-yeni-başta + son 20 ile sınırlı (`$pull` + `$push $slice`).
  Sol menüdeki "Son Oynananlar" artık `/recently-played` sayfasına gidiyor
  (yeni `RecentlyPlayed.jsx`). İkisi de yeni `gameActivityStore.js` (zustand,
  optimistic toggle + rollback) üzerinden çalışıyor.
- **Arama** — navbar'daki arama ikonu artık `/casino`'ya giden ölü bir link
  değil, yeni `SearchOverlay.jsx` dropdown'unu açan bir buton. Oyun adı +
  sağlayıcı adına göre canlı filtre (lisanslı Palace kataloğu + in-house
  oyunlar + provider listesi, `CasinoRedesign.jsx`'teki cache deseninden
  ayrıştırılan `utils/apiCache.js` ile bellek-içi TTL cache). Spor
  Bahisleri/Canlı Bahis için ayrı bir arama modu bu turda YOK — route-aware
  genişletme noktası kod içinde işaretli, sahte UI eklenmedi.
- **Sağlayıcı rayı** — anasayfada slider'ın hemen altına, oyun satırlarından
  önce yeni `ProviderRow.jsx`: `GET/POST /api/palace/providers` listesini
  `GameRowSection` ile aynı yatay-kaydırmalı `flex + overflow-x-auto +
  shrink-0` deseninde, her kartta logo + sağlayıcı adıyla birlikte gösterir,
  bir sağlayıcıya tıklayınca `/casino?provider={id}`'ye gider.
  `CasinoRedesign.jsx` artık mount'ta bu query param'ı okuyup ilgili
  sağlayıcı filtresiyle açılıyor (`useSearchParams`). Palace'ın kendi
  provider API'si `provider_logo` alanını güvenilir doldurmadığından
  (çoğu sağlayıcıda boş), 21 sağlayıcının gerçek logosu Palace/GoldSlot
  admin panelinden (Games > Providers List, kullanıcı onayıyla) indirilip
  `client/public/images/providers/{provider_id}.png` altına eklendi;
  `ProviderRow.jsx` provider ID'sine göre yerel logoyu kullanıyor.

**Değiştirildi:**
- Dil değiştirici (`LanguageSwitcher.jsx`) buton grubundan native `<select>`'e
  geçti — üçüncü bir dil eklendiğinde bileşende değişiklik gerekmeyecek.
- Navbar'daki bildirim ikonu kaldırıldı (arkasında hiçbir gerçek bildirim
  sistemi olmadan salt görsel duruyordu).
- "Casino" nav linki (masaüstü navbar + mobil alt navigasyon) artık `/casino`
  yerine `/`'e gidiyor — anasayfa zaten casino dashboard'unun kendisi;
  `/casino` route'u kaldırılmadı, tam katalog/filtre sayfası olarak "tümünü
  gör" linklerinden erişilebilir durumda kalıyor.

**Kırılan Değişiklikler:**
- Yok — `/casino` route'u ve mevcut linkleri değişmedi, yalnızca üst navbar/
  alt navigasyondaki "Casino" sekmesinin hedefi değişti.

### Son Kazananlar simülasyonu + navbar/hizalama düzeltmeleri
Bir önceki karttaki casino anasayfasına gelen geri bildirimlerin düzeltmesi.

**Eklendi:**
- **Son Kazananlar simülasyonu** (`services/fakeWinners.js`, yeni) —
  P3'ün gerçek `User`/bakiye mimarisinden BİLİNÇLİ olarak ayrı: hiçbir
  gerçek kullanıcı kaydı, bahis ya da bakiye değişimi yok. Değişen
  aralıklarla (varsayılan 8-45sn, admin'den ayarlanabilir) rastgele bir
  Türkçe isim + in-house oyun + tutar (varsayılan ₺500-₺150.000) seçip
  gerçek kazananlarla AYNI mekanizmayı (`addRecentWinner()`) çağırıyor —
  client tarafında (`RecentWinnersTicker`/`WinnersPanel`) hiçbir değişiklik
  gerekmedi. "Oyuncu havuzu" (varsayılan 200-300 isim) birkaç dakikada
  bir yeniden zarlanıyor — kullanıcıların giriş/çıkış yapması illüzyonu.
  Admin ayarları: `/admin/bots` sayfasının üstüne yeni bir kart eklendi
  (etkin/pasif, havuz min-max, tetiklenme aralığı min-max, tutar min-max).
- Navbar'a eksik arama/bildirim/dil ikonları eklendi (referansta vardı,
  atlanmıştı) — dil değiştirici gerçek `LanguageSwitcher.jsx`'i kullanıyor
  (zaten Login.jsx'te kanıtlanmış); arama ikonu `/casino`'ya yönlendiriyor,
  bildirim ikonu şimdilik salt görsel (arkasında gerçek bir bildirim
  sistemi yok, bunu gizlemiyoruz).

**Düzeltildi:**
- Oyun satırları (Popüler/Özel/Slot/Yeni Oyunlar) sağ raya (Son
  Kazananlar/Promosyonlar/Kupon, 260px) kadar taşıyordu. Kök neden: hero
  slider kendi İÇ grid'ini (`[1fr_260px]`) kuruyordu — slider sol sütunda,
  sağ ray o grid'in ikinci sütunundaydı — ama altındaki `GameRowSection`
  satırları bu grid'in DIŞINDA, ana flex-column akışında tam genişlikte
  kardeş bloklardı; dolayısıyla sağ rayın altında boş kalan alana doğru
  yayılıyorlardı. Ara adımda `max-w-6xl mx-auto` → `px-4` değişikliği ve
  kart konteynerinin grid/flex arası denemeleri sadece semptomu maskeledi,
  kökü çözmedi. Asıl düzeltme: hero'nun kendi iç grid'i kaldırıldı, bunun
  yerine slider + tüm oyun satırları + "Tüm Oyunlar" kartı TEK bir üst
  grid'in sol (1fr) sütununa, sağ ray (Son Kazananlar/Promosyonlar/Kupon)
  aynı grid'in sağ (260px) sütununa kardeş olarak yerleştirildi — artık
  main sütun sağ raya asla taşamıyor, sağ ray kendi içeriği bitince altını
  boş bırakıyor (main sütun altta devam etse bile). Oyun kartları
  `shrink-0 w-[140px] sm:w-[150px]` sabit genişlikte, yatay-kaydırmalı
  (`overflow-x-auto`) bir `flex` satırında, "tümünü gör" linkleriyle
  birlikte kalmaya devam ediyor. Ayrıca sağ ray paneli "Kazananlar" değil
  "Son Kazananlar" olarak yeniden adlandırıldı (TR/EN).
- Boş Bahis Kuponu konteyneri, anasayfada hiçbir bahis seçeneği olmamasına
  rağmen "Tüm Oyunlar" kartından sonra sayfanın en altında görünüyordu —
  `BetSlip`, yan yana (flex-row) sayfalar için tasarlanmış bir `<aside>`
  iken anasayfanın dikey (flex-column) akışına dahil edilince kendi bloğu
  olarak en alta düşüyor, seçim olmasa bile boş durum metniyle render
  ediliyordu. `BetSlip.jsx`'ten `SlipContent` export edildi ve `BetSlip`'e
  masaüstü `<aside>` bloğunu bastıran bir `desktopHidden` prop'u eklendi
  (mobil bar/sheet davranışı etkilenmedi); anasayfada artık yalnızca aktif
  bir seçim varken (`selections.length > 0`) sağ rayda Promosyonlar'dan
  hemen sonra konumlanan bir kart olarak gösteriliyor, seçim yoksa hiç
  render edilmiyor.

### Anasayfa artık casino sayfası + sitewide yeşil tema + gerçek Palace kataloğu
Kullanıcının onayladığı bir statik referans tasarıma (üç sütunlu casino
dashboard) göre anasayfa yeniden yapıldı. Bu kart, önceki "Anasayfa görsel
yenileme" pilotunun (aşağıda) yerini alıyor — hero/sidebar/sağ ray yapısı
korundu, içerik ve renk sistemi baştan ele alındı.

**Eklendi:**
- **Sitewide yeşil tema** — `server/src/theme/registry.js`'teki gerçek
  varsayılan renkler (`--color-primary`/`--color-primary-dark`/
  `--color-accent`) cyan/mordan (#00d4ff/#7c3aed) yeşile (#63d629/#4fae20/
  #3a9e18) çevrildi; bu, admin panelinden hâlâ değiştirilebilen AYNI tema
  sistemi (A1/A2) — override yoksa görülen varsayılan artık yeşil.
  `styles/brand.js`'teki `BRAND_GRADIENT`/`BRAND_GLOW`/`BRAND_BORDER` gibi
  sabitler sabit hex yerine `var(--color-primary)`/`color-mix()` kullanacak
  şekilde yeniden yazıldı — daha önce admin tema değişikliğine hiç tepki
  vermiyorlardı (sabit cyan/mor hex'ti), artık gerçekten tema-duyarlı.
- **Navbar yeniden düzenlendi** — sıra Casino/Spor Bahisleri/Canlı Bahis/
  Kampanyalar oldu (Casino ilk sırada + `/` üzerinde de aktif görünüyor,
  çünkü anasayfa artık casino sayfası), ayrı bir "Kayıt Ol" butonu eklendi
  (`/login?tab=register`). Bakiye dropdown'u, admin linki, çıkış — hepsi
  aynen korundu, yalnızca sabit cyan/mor hex'ler tema değişkenlerine çevrildi.
- **Gerçek, lisanslı Palace kataloğu** — "Popüler Oyunlar", "Slot Oyunları",
  "Yeni Oyunlar" satırları artık `POST /api/palace/games` ile CANLI çekilen
  gerçek oyun verisi kullanıyor (Pragmatic Play + Spribe). Hiçbir oyun adı/
  görseli kod içine gömülmedi — hepsi Palace'ın kendi CDN'inden geliyor.
  Bu bilinçli bir tercih: proje daha önce (T5 varlık denetimi) tam olarak
  bu yüzden lisanssız Pragmatic Play/BGaming verisini silmişti; bu kez
  veri gerçekten bizim lisanslı aggregator kontratımızdan (T3) geliyor.
- **HomeSidebar** yeniden yazıldı: konteyner arka planı (referanstaki gibi
  çerçeveli), Ana Sayfa/Favoriler/Son Oynananlar (son ikisi "Yakında"
  rozetiyle, henüz gerçek özellik değil — kullanıcı kararıyla bu turun
  kapsamı dışında), Kategoriler (aynı sayfadaki bölümlere kaydırma) ve
  Hızlı Erişim (Profil/Bahislerim/Yardım Merkezi/Ayarlar, gerçek route'lar).
- "Özel Oyunlar" satırı artık gerçekten "özel" olanı gösteriyor: 13 in-house
  oyunumuz — önceki turda buraya Aviator gibi 3. parti oyunlar da karışmıştı,
  şimdi dürüst bir ayrım var (in-house = Özel Oyunlar, Palace = Popüler/
  Slot/Yeni).
- "Tüm Oyunlar" tek bir CTA kartı olarak `/casino`'ya (gerçek tam katalog
  sayfası) yönlendiriyor — aynı Palace oyunlarını 4. kez tekrar etmek yerine.

**Kaldırıldı:**
- Hero altındaki eski "Hızlı Kategori Şeridi", Spor Bahisleri/Canlı Bahis
  öne-çıkan-maç bölümleri, "Neden Biz?" ve alt CTA bandı anasayfadan
  kaldırıldı — anasayfa artık casino'ya odaklı, spor bahis içeriği kendi
  sayfalarında (`/bahis`, `/canli`) kalmaya devam ediyor.

**Bilinen sınır:**
- Admin panelindeki A4 bölüm sırası/görünürlük ayarı (`sportsBets`,
  `liveBets`, `features`, `bottomCta` id'leri) artık homepage'de karşılığı
  olmayan seçenekler içeriyor — o id'leri aç/kapat yapmanın artık hiçbir
  görsel etkisi yok. Ayrı bir işte A4 admin ekranının bu yeni yapıya göre
  güncellenmesi gerekiyor.
- Kazananlar paneli (sağ ray) yalnızca gerçek kazanan verisi varsa görünür
  — geliştirme ortamında bu veri boşsa panel hiç render olmuyor (bilinçli,
  var olmayan veriyle dolu göstermiyoruz).
- Palace kataloğu yalnızca Pragmatic Play + Spribe'tan çekiliyor (2/21
  sağlayıcı) — daha fazla çeşitlilik istenirse `PALACE_PROVIDER_IDS`
  genişletilebilir.

### Anasayfa görsel yenileme (pilot)
Anasayfanın görsel dili baştan ele alındı — amaç, endüstri genelinde
tanınan casino/betting görsel diline (koyu zemin + altın vurgu, gerçek
fotoğraf, provably-fair rozetleri) geçmek ve mevcut "AI-jenerik" izlenimi
(emoji ikon, düz gradient kart, tek tip Inter tipografi) kırmak. Kapsam
bilinçli olarak yalnızca `HomePage.jsx` ile sınırlı tutuldu — diğer
sayfalar bu turun dışında; beğenilirse aynı dil yayılacak.

**Eklendi:**
- `Anton` (başlık) + `Manrope` (rozet/etiket) Google Fonts — mevcut
  gövde fontu (Inter) değişmedi, yalnızca yeni bölümlerde kullanıldı.
- Material Symbols Outlined ikon seti aktif edildi — `index.html`'de
  önceden bağlıydı ama hiç kullanılmıyordu (`.material-symbols-outlined`
  CSS sınıfı hiç tanımlanmamıştı, ligature glifleri düz metin olarak
  render oluyordu); `index.css`'e eksik sınıf eklenip emoji ikonlar
  (⚽🔴🎰💎 vb.) bu setle değiştirildi.
- Güven rozeti şeridi (Lisanslı & Güvenli / Provably Fair / Anlık Çekim /
  7/24 Destek) hero altına eklendi — endüstri standardı bir kalıp.
- İki yeni görsel `image-gen` skill'i ile (Cloudflare Workers AI,
  FLUX.1-schnell) üretildi: `cta-bg-v2.png` (VIP elmas kupa sahnesi,
  alt çağrı bandı) ve `features-texture.png` (altın damarlı mermer
  doku, "Neden Biz?" bölümü arka planı).
- `tailwind.config.js`'e `gold` renk paleti ve `font-display`/`font-ui`
  aileleri eklendi.
- **İkinci iterasyon** — gerçek rakip sitelerinde (oddsSource7502, Exonbet291;
  1xbet güvenlik kısıtlamasıyla engellendi) yapılan tarayıcı incelemesi
  sonrası üç endüstri-standardı kalıp eklendi: (1) `RecentWinnersTicker`
  ince metin şeridinden yatay kaydırılan **kazanan kartlarına** çevrildi
  (oyun görseli + maskelenmiş kullanıcı adı — "ad***n" kalıbı, salt
  görüntü amaçlı; backend hâlâ gerçek username yayınlıyor + tutar), (2)
  fotoğraflı Quick Nav kartları yerine **ikon-öncelikli kategori şeridi**
  (Bahis/Canlı/Casino/Kampanyalar/Yardım Merkezi) eklendi, (3) oyun
  kartları 4:3 yatay yerine **3:4 dikey (box-art) formata** çevrildi,
  köşeye "VIP90.bet Original" rozeti eklendi (3. parti sağlayıcı logosu
  yerine).
- **Üçüncü iterasyon** — kullanıcının verdiği somut bir referans tasarıma
  (üç sütunlu casino dashboard mizanpajı) göre pixel-seviyesinde yeniden
  yapıldı: sol kategori/hesap navigasyonu (`HomeSidebar.jsx`, yalnızca
  anasayfada — yalnızca gerçekten var olan route'lara bağlı, referanstaki
  "Favoriler/Jackpot/Turnuvalar/Sadakat Programı" gibi bizde karşılığı
  olmayan sayfalar eklenmedi) ve sağ rayda `WinnersPanel`/`PromoPanel`
  (aynı gerçek veriyi paylaşan yeni `useRecentWinners` hook'u) eklendi.
  Renk paleti referansa uyacak şekilde yeşil/koyu-antrasite bir homepage-
  özel palete (`pages/home/homeTheme.js`) çevrildi — sitenin geri kalanının
  cyan/purple marka rengine dokunulmadı. Başlıklar `Anton` yerine
  `Manrope` kalın ağırlık kullanıyor (referans tipografisi condensed değil,
  standart kalın sans). Referansta olup bizde karşılığı olmayan "Canlı
  Casino" (masa/krupiye) satırı ve "10.000+ Oyun/50.000+ Kullanıcı/%98
  Memnuniyet" gibi doğrulanamayan rakamlar bilerek kopyalanmadı; ödeme
  logoları da yalnızca gerçekten desteklenenlerle (Havale/EFT, Kripto/USDT)
  sınırlı tutuldu.

**Değişti:**
- Hero slider ve Quick Nav kartlarındaki fotoğraflar artık **görünür**:
  önceki üç kat üst üste karartma gradyanı (+ Quick Nav kartlarında
  %6-%12 opaklık) fotoğrafları neredeyse tamamen gizliyordu — mevcut
  görsellerin (hero-sports/live/casino, 13 oyun görseli) kalitesi zaten
  yüksekti, sorun sadece CSS katmanlamasıydı. Tek yönlü, daha ince bir
  karartma ile değiştirildi.
- `cta-bg.png` yerine `cta-bg-v2.png` kullanılıyor — eskisinde arka
  plandaki tabelalarda AI görsellerinin klasik hatası olan anlamsız
  sahte yazılar vardı ("CARACAR", "CALSIN"), yenisinde okunaklı/sahte
  metin yok.
- Oyun grid'i mobilde `grid-cols-3`'ten `grid-cols-2`'ye düşürüldü —
  12 oyun 3 sütunda dar ekranlarda aşırı sıkışıyordu.
- Material Symbols Google Fonts bağlantısına `&display=block` eklendi —
  önceki (varsayılan `swap`) davranışta, font yüklenene kadar ikon
  yerine düz İngilizce ligature metni ("sports_soccer", "shield" vb.)
  bir an görünüyordu; `block` bu aralıkta ikonu boş bırakıyor, metni
  hiç göstermiyor.
- Hero altındaki ikon-öncelikli hızlı kategori şeridi (Bahis/Canlı/
  Casino/Kampanyalar/Yardım Merkezi) kaldırıldı — bu bilgi artık sol
  sidebar'da zaten var, anasayfada tekrar oluyordu.

**Bilinen sınır:** `resize_window` aracı bu tarayıcı otomasyonu ortamında
gerçek viewport'u değiştirmiyor (`window.innerWidth` sabit kalıyor) —
mobil doğrulama bu yüzden sayfa içine 390px'lik bir `<iframe>` enjekte
edilerek yapıldı (iframe'in kendi rendering viewport'u var, media query'ler
doğru tetikleniyor). Bu yöntemle hero/istatistik şeridi/oyun kartları/
sidebar-gizleme davranışı görsel olarak doğrulandı; yine de gerçek
cihaz/DevTools ile bir kontrol faydalı olur.

### P1/P2 — Sohbet + bahşiş aktif edildi
`services/chat.js` (oda/mesaj/moderasyon/bahşiş/yağmur iş mantığı) büyük
ölçüde daha önceki bir fazda yazılmıştı ama hiçbir route/controller katmanı
mount edilmemişti, hiç sohbet odası oluşturulmamıştı ve client'ta hiçbir
arayüz yoktu — yani kod tamamen orphan durumdaydı. Entegrasyon sırasında bu
kodun **hiç çalışır durumda olmadığı** ortaya çıktı; TDD ile (önce test,
sonra düzeltme) art arda 4 gerçek hata bulundu.

**Eklendi:**
- `GET /api/chat/rooms`, `GET /api/chat/rooms/:slug/messages` (herkese
  açık) + admin uçları (oda oluştur/güncelle/sil, kullanıcı yasakla/
  sustur, mesaj sil) — hepsi `auditLog` ile denetleniyor.
- `client/src/services/chatSocket.js` — `/chat` namespace'ine JWT-token
  auth ile bağlanan, `connect_error` üzerinde token yenileme deneyen
  socket istemcisi (`games/Crash.jsx`'teki `/crash` deseni takip edilerek).
- Global sohbet widget'ı (mesajlaşma paneli, kullanıcı rozetleri, bahşiş
  butonu), bahşiş modalı ve yağmur bildirimi — arayüz markup'ı `opencode`
  (model: `opencode/x-preview-f-free`) ile üretildi, socket/state/API
  entegrasyonu elle yazıldı.
- Sunucu açılışında "Genel Sohbet" odası idempotent olarak tohumlanıyor
  (`initDefaultChatRoom`).
- `server/test/chatService.test.js` — 13 test (regresyon + mutlu yol),
  aşağıdaki 4 hatayı da kanıtlayan/doğrulayan testler içeriyor.

**Düzeltildi:**
- `/chat` namespace auth middleware'i `const jwt = require('jsonwebtoken')`
  kullanıyordu — proje ESM (`"type":"module"`) olduğu için bu satır HER
  bağlantıda `ReferenceError` fırlatıyordu, yani sohbete kimse hiçbir
  zaman bağlanamıyordu. ESM `import`'a çevrildi.
- `sendTip` ve `createRain`'deki bakiye güncellemeleri oku-değiştir-yaz
  (`findById` + `.save()`) deseni kullanıyordu, eşzamanlı isteklerde çifte
  düşüş/artış riski taşıyordu. Atomic `findOneAndUpdate` (`$gte`+`$inc`)
  desenine çevrildi.
- `createRain`, `ChatRain.create([{...}], {session})` çağrısının
  Mongoose'da HER ZAMAN array döndürdüğü gerçeğini gözden kaçırmıştı
  (`rain.recipients.push(...)`, `rain.save()` gibi tekil-obje kullanımları
  `Cannot read properties of undefined` ile patlıyordu) — array destructure
  edilerek düzeltildi.
- `sendTip`, `fromUserId.equals(toUserId)` çağırıyordu; `fromUserId` JWT'den
  gelen düz bir string olduğu için (Mongoose ObjectId değil) bu her zaman
  `TypeError` fırlatıyordu. `String(fromUserId) === String(toUserId)`
  karşılaştırmasına çevrildi.
- `Transaction.type` enum'ında `tip_sent`, `tip_received`, `rain`
  değerleri hiç yoktu — bu üç düzeltme yapılmadan önce bahşiş/yağmur
  işlemleri `Transaction.create()` çağrısında her zaman `ValidationError`
  ile patlıyordu (yukarıdaki bug'lardan bağımsız, ayrı bir kırık nokta).
  Enum'a eklendi.

**Bilinen sınır:** Navbar'daki bakiye, bahşiş/yağmur sonrası anlık olarak
(canlı `balance:update` push'uyla) güncellenmiyor — sayfa yenilenince veya
yeniden login olunca doğru bakiye görünüyor, DB her zaman doğru. Kök neden
`authStore.js`'in mevcut (bu fazda dokunulmayan) `subscribe:user` socket
akışında; ayrı bir iş kalemi olarak bırakıldı.

### D5 — Yardım Merkezi (ticket) sistemi aktif edildi
Backend zaten tam yazılmıştı (`models/Ticket.js`, `services/ticket.js`,
`routes/ticket.js`, `/api/tickets` mount edilmişti) ama hiçbir client
sayfası yoktu ve footer'daki "Yardım Merkezi" linki yanlış yere
(`/status`, sistem durumu sayfası) gidiyordu — ticket API'si tamamen
kullanılmayan (orphan) kod hâlindeydi.

**Eklendi:**
- Oyuncu tarafı: `/help` sayfası — talep listesi, "Yeni Talep" formu,
  talep detay/mesajlaşma paneli.
- Admin tarafı: `/admin/tickets` sayfası — durum filtreli liste, detay
  paneli, yanıt kutusu, durum değiştirme; Dashboard'a açık talep
  sayaçlı kısayol kartı.
- `services/ticket.js`'e bildirim entegrasyonu (KYC deseni takip edilerek):
  yeni talep açıldığında adminlere socket bildirimi, admin yanıtladığında
  oyuncuya socket bildirimi + e-posta.
- `socket/handler.js`'e `subscribe:admin` event'i — **önceden hiçbir socket
  `role:admin` odasına katılmıyordu**, bu yüzden `services/kyc.js`'teki
  `io.to('role:admin').emit('kyc:new_submission', ...)` çağrısı da fiilen
  hiç kimseye ulaşmıyordu; bu düzeltme KYC bildirimini de çalışır hâle
  getiriyor. Katılım DB'den `role==='admin'` doğrulamasıyla yapılıyor
  (client'ın kendi beyanına güvenilmiyor).
- Admin ticket yanıt/durum değişikliği işlemleri artık `auditLog` ile
  denetleniyor.

**Değişti:**
- Footer'daki "Yardım Merkezi" linki `/status`'tan `/help`'e düzeltildi.

Canlı önizleme sunucusunda uçtan uca doğrulandı: oyuncu talep açtı, admin
yanıtladı (durum open→in_progress otomatik geçti), admin durumu "Çözüldü"
yaptı, oyuncu tekrar yazınca durum otomatik "Açık"a döndü.

### SF — Footer/statik sayfa yönetimi (Hakkımızda, Kariyer, Basın, İletişim, Yasal, Sorumlu Oyun)
Hakkımızda/Kariyer/Basın/İletişim footer linkleri daha önce tamamen ölüydü
(`href:'#'`, hiçbir sayfa yoktu); Yasal ve Sorumlu Oyun sayfalarının içeriği
ise `client/src/data/legalContent.js`'e sabit kodlanmıştı, değiştirmek kod
değişikliği gerektiriyordu.

**Eklendi:**
- Yeni `StaticPage` modeli + admin CRUD (`GET/PUT /admin/static-pages/:slug`,
  `PATCH .../toggle`) — 11 sayfa (4 yeni kurumsal + 7 mevcut yasal/sorumlu
  oyun) artık admin panelinden ("Statik Sayfalar") başlık/giriş/bölüm
  metinleriyle düzenlenebiliyor ve tek tıkla açılıp kapatılabiliyor. Kapalı
  bir sayfa footer'dan gizlenir, doğrudan URL'e gidilirse boş-durum
  gösterilir.
- Yeni herkese açık `GET /api/static-pages` (footer listesi) ve
  `GET /api/static-pages/:slug` uçları.
- 4 yeni kurumsal sayfa: `/about`, `/career`, `/press`, `/contact`
  (placeholder içerikle, admin panelinden doldurulur).
- Footer'daki marka adı artık admin panelindeki Marka Kimliği (A3)
  ayarından geliyor — site adı değiştirildiğinde footer'daki isim ve
  copyright metni otomatik güncelleniyor.

**Değişti:**
- 7 yasal sayfa (`/legal/terms`, `/legal/privacy`, `/legal/kvkk`,
  `/legal/cookies`, `/legal/bonus-terms`, `/legal/responsible-gaming`,
  `/legal/user-agreement`) artık içeriğini `legalContent.js`'teki sabit
  metin yerine yeni `StaticPage` koleksiyonundan çekiyor. **URL'ler
  değişmedi**, mevcut linkler/SEO etkilenmiyor. "Kullanıcı Sözleşmesi"
  daha önce footer'a hiç eklenmemişti (yalnızca sidebar'da vardı) — artık
  footer'da da görünüyor.

**Kırılan Değişiklikler:**
- Bonus/kullanım koşulları metnindeki iki madde (`legalContent.js`'teki
  `formatMoney()` çağrıları) artık aktif para birimine göre otomatik
  hesaplanmıyor — Mongo'da fonksiyon saklanamadığı için migrasyonda o anki
  TRY değeriyle ("₺50,00", "₺100,00") düz metne dönüştürüldü. Admin
  panelinden düzenlenebilir ama para birimi değişince kendiliğinden
  güncellenmez; operatör para birimini değiştirirse bu iki metni elle
  düzeltmesi gerekir.

### T4/T5 — Takip: kullanıcıya görünen marka izi ve ölü betikler (kısmi)
Dev server önizlemesi sırasında `server/src/data/oddsSource-domain.json`'ın
(oddsSource'in Türkiye'de engellenen ayna domain'lerini DNS/HTTP ile keşfeden
canlı bir mekanizmanın önbelleği olduğu) sorgulanmasıyla ortaya çıktı: T4'ün
orijinal kabul kriteri ("hiçbir üçüncü taraf marka adı geçmiyor") yalnızca
kısmen karşılanmıştı — bu maddeyle şu güvenli/kullanıcıya-görünen kısım
kapatıldı:
- `/status` sayfasındaki `status.component.oddsSource.desc` sözlük değerinden
  ("oddsSource — canlı oran ve maç verisi") marka adı çıkarıldı, jenerik hâle
  getirildi (`tr.js`, `en.js`). Anahtar adı (`oddsSource`) dahili tanımlayıcı
  olduğu için kullanıcıya görünmüyor, değiştirilmedi.
- `server/scripts/oddsSource.har` (30 MB ölü HAR yakalaması) ve
  `server/scripts/fetch-oddsSource-games.js` (hedefi zaten T4'te silinmiş ölü
  betik) kaldırıldı.

**Bu kart hâlâ `done` değil, kasıtlı olarak.** İnceleme sırasında yeni bir
bulgu ortaya çıktı: `ODDS_PROVIDER` ayarı canlı/fikstür senkronizasyon
job'larının hangisinin çalışacağını seçmiyor — `server.js`,
`startoddsSourceLiveSync`/`startoddsSourceUpcomingSync`'i bu ayardan bağımsız,
koşulsuz başlatıyor; bu job'lar her zaman oddsSource'in ayna domain'ini
keşfedip WebSocket'le bağlanıyor. `ODDS_PROVIDER=theoddsapi` yapmak yalnızca
ayrıştırma mantığını etkiliyor, bu trafiği durdurmuyor. Gerçek bir sağlayıcı
değişimi (theoddsapi için yeni bir senkronizasyon job'ı + `server.js`'te
provider'a göre gate) canlı bahis motorunun kalbine dokunan ayrı, büyük ve
riskli bir mühendislik kartı gerektiriyor — bilinçli olarak bu oturumun
kapsamı dışında bırakıldı (bkz. `server/.env.example` ve
`docs/product/02-yapilandirma.md`'deki yeni uyarı notları).

## [0.3.0] — 2026-08-21

Faz 1'in dört paralel akışı (K, M, U, ve büyük ölçüde V) bu sürümde
toplandı: `feat/akis-k`, `feat/akis-m`, `feat/akis-bc`, `feat/akis-a`,
`feat/akis-u`, `feat/akis-u4`, `feat/akis-u5`, `feat/akis-v` dallarının
tümü `feat/integration`'a merge edildi. 52 karttan 48'i `done` —
kalan üçü (V2 tanıtım görselleri/video, V5 lisanslı aggregator görüşmesi,
V6 tüzel kişilik/hukuki kurulum) kod dışı iş/hukuk kararları, bu oturumun
kapsamı dışında; V3 (ürün sayfası metni) kullanıcı onayı bekliyor.

**Bu hâlâ satışa hazır sürüm değildir.** 1.0.0 etiketi, kalan üç kart
kapanıp ürün fiilen yayına gönderilmeye hazır olduğunda verilecek.

### T4/T5 — Tamamlama: oddsSource/BGaming demo oyun vitrini tamamen kaldırıldı
Aşağıdaki T4 (kısmi) ve T5 kritik bulgu maddelerini kapatır. Palace
casino entegrasyonu (T3) pazara sürülecek üründen çıkarıldığı için,
Palace'tan önceki dönemde deneme amaçlı kurulmuş bu vitrin sistemi
artık hiçbir işlevsel amaca hizmet etmiyordu (oddsSource sadece spor bahis
oranı kaynağı olarak kalıyor — bu kaldırma onu etkilemez).

**Kaldırıldı:**
- `client/src/data/casinoGames.js` (19.952 satır, 1.994 kayıt) — 657
  Pragmatic Play + 969 BGaming kaydı, 646 doğrudan `pragmaticplay.com`
  CDN hotlink'i içeren lisanssız üçüncü taraf veri kümesi.
- `client/src/pages/CasinoGame.jsx` ve `/casino/:gameSymbol` rotası.
- `client/public/images/pragmatic-play/*` (8 dosya) — lisanssız, artık
  hiçbir yerden referans alınmıyor.
- `client/src/pages/HomePage.jsx`: anasayfadaki "Pragmatic Play
  Oyunları" tanıtım bölümü.
- `server/src/services/oddsSourceService.js`, `server/src/services/
  streamService.js` — oddsSource/BGaming oyun sayfalarını canlı proxy'leyip
  CDP screencast ile yayınlayan sunucu-taraflı tarayıcı otomasyonu.
- `server/data/oddsSource-games.json` (3,2 MB) — oddsSource oyun kataloğu.
- `server/src/routes/casino.js`: `/game/:gameId`, `/relay`, `/cdn/*`,
  `/launcher-proxy/*`, `/logo-stub.js`, `/oddsSource-game/:id`,
  `/oddsSource-games`, `/oddsSource-launch`, `/swintt-proxy`,
  `/broken-games`, `/broken-game` — hepsi yalnızca kaldırılan vitrin
  tarafından kullanılıyordu. `POST /api/casino/spin` (in-house oyun
  bakiye güncellemesi) korundu, `useSlotGame.js` hâlâ bağımlı.

### Kırılan Değişiklikler
- `GET /api/casino/game/:gameId`, `ALL /api/casino/relay`,
  `GET /api/casino/cdn/*`, `GET /api/casino/launcher-proxy/*`,
  `GET /api/casino/logo-stub.js`, `GET /api/casino/oddsSource-game/:id`,
  `GET /api/casino/oddsSource-games`, `POST /api/casino/oddsSource-launch`,
  `POST /api/casino/swintt-proxy`, `GET /api/casino/broken-games`,
  `POST /api/casino/broken-game` uç noktaları kaldırıldı — hepsi 404
  döner. Bu uçlar yalnızca artık kaldırılmış demo vitrini tarafından
  çağrılıyordu; hiçbir yayınlanmış API sözleşmesinin parçası değildi.
- `/casino/:gameSymbol` istemci rotası kaldırıldı, artık 404/yönlendirme.
- Socket.IO `/stream` namespace'i (`stream:start/input/spin/stop`
  event'leri) kaldırıldı — yalnızca kaldırılan vitrin kullanıyordu.
- Anasayfadaki (`/`) "Casino — Pragmatic Play Oyunları" bölümü artık
  görünmüyor.

Tam depo çapında test suite (23/23 suite) ve `client` build'i bu
değişiklikten sonra hatasız geçti.

### T5 — Varlık lisans denetimi
- `docs/product/08-varlik-lisans-denetimi.md`: `client/public/`'teki her
  dosya için kaynak + lisans durumu, `git log --follow` ile doğrulanmış.
- **Kritik bulgu:** `client/src/data/casinoGames.js` (19.952 satır,
  1.994 kayıt) lisanssız üçüncü taraf içeriği barındırıyor — 657 kayıt
  Pragmatic Play, 969 kayıt BGaming ibaresi geçiriyor, 646 kayıt
  doğrudan `pragmaticplay.com` CDN'ine hotlink. Commit geçmişi
  (`4b3b764`) bunun bilinçli bir kopyalama olduğunu gösteriyor, kaza
  değil. Üç sayfa (`CasinoGame.jsx`, `HomePage.jsx`, `Casino.jsx`) bu
  veriye doğrudan bağımlı. **Bu oturumda düzeltilmedi** — ayrı, düzgün
  kapsamlı bir kart gerektiriyor (bkz. belge).
- 13 in-house oyun görseli (26 dosya) ve spor görselleri (8 dosya)
  AI-üretimi olarak doğrulandı (FLUX.1-schnell / image-gen commit
  etiketleri) — güvenli.


### T4 — Ölü veri ve dosya temizliği (kısmi)
- Silindi: `server/src/data/oddsSource-events.js` (1.110.619 satır),
  `server/src/data/rakipsite-events.js` (1.798 satır), `server/src/
  utils/sportdigi.js` (36 satır, kullanılmayan), `server/src/backups/
  oddsSourceService.js.bak`, `server/src/backups/casino.js.bak`. Hiçbiri
  hiçbir yerden import edilmiyordu — sıfır işlevsel etki, suite 288/288
  değişmedi. Toplam 1.114.475 satır repo'dan çıktı.
- **Bu kart `done` değil, kasıtlı olarak.** Kabul kriteri ("hiçbir
  üçüncü taraf marka adı geçmiyor") beklenenden çok daha büyük bir
  kapsam ortaya çıkardı: oddsSource yalnızca bahis oranı kaynağı değil,
  `services/oddsSourceService.js` + `services/streamService.js` üzerinden
  **ayrı bir casino oyun akışı sağlayıcısı** olarak da gömülü — bu iki
  ayrı sistemin (odds senkronizasyon motoru + casino akışı) sökülmesi
  gerekiyor. Yarım bırakılmış bir çıkarma, çalışan bir sistemi
  kırma riski taşıdığı için burada durduruldu; kalan iş için önerilen
  takip kartları kullanıcıya iletildi (bkz. sohbet geçmişi).


### T2 — Lisanslı feed sağlayıcısı, ilk gerçek adaptör
- `services/oddsProviders/theOddsApiProvider.js`: The Odds API adaptörü,
  T1'deki oddsSource adaptörüyle aynı sözleşmeye (NormalizedEvent) uyuyor.
  Sağlayıcı canlı/yaklaşan ayrımını ayrı uçlarla vermediği için
  `commence_time`'a göre sınıflandırma yapılıyor (basitleştirilmiş
  sezgisel — kesin dakika-bazlı canlı skor bu sağlayıcıdan gelmiyor,
  oddsSource'in nodeupd akışının aksine).
- `oddsProviders/index.js`: kayıt defterine eklendi.
  `ODDS_PROVIDER=theoddsapi` ile aktif hale geliyor — kaynağı
  değiştirmek env değiştirmekten ibaret, sync job'ı hiç değişmiyor
  (T1'in kurduğu ayrışmanın kanıtı).
- `ODDS_API_KEY` artık gerçekten kullanılıyor — önceki sürümde
  "kullanılmayan kalıntı" olarak işaretlenmişti, docs/product/
  02-yapilandirma.md düzeltildi.

TDD: 9 yeni test, tamamı önce kırmızı. Suite 288/288. (T2)


### Akış K — Kurulum ve dağıtım (K2–K4 tamamlandı, K1 0.2.0'da)
- **K2 — Web kurulum sihirbazı** (`installer/`, `POST /install`): terminal
  açmadan site adı, para birimi ve ilk yönetici hesabı kurulur; sihirbaz
  üretilen `.env` içeriğini kopyala-yapıştır olarak gösterir. Client
  build'siz de çalışır (bağımlılıksız statik HTML). Varsayılan parolayla
  admin hesabı açılmaz.
- **K4 — Migration koşucusu** (`server/migrations/`, `runner.js`): D9'un
  bıraktığı `applyMigration({version, manifest})` enjeksiyon noktasına
  bağlanır; semver-sıralı ve idempotent çalışır, patlayan migration
  işaretlenmez — retry kaldığı yerden devam eder.
- **K3 — Sağlık kontrolü ve ilk çalıştırma tohumlaması** (`server/src/
  health/`): `checks.js` Docker healthcheck/izleme ile uyumlu 0/1 çıkış
  kodu döner; `seed.js` idempotent — mevcut ayarların üzerine yazmaz.
- `docker-compose.yml` + `deploy/Caddyfile` + `.env.docker.example`
  (K1, 0.2.0'da): sabit `tls internal` kullanmaz — Caddy varsayılanı
  gerçek domainde Let's Encrypt, localhost'ta self-signed sertifika verir.
  Mongo ve uygulama dış dünyaya port açmaz.

### Akış M — Modül ve lisans altyapısı (M2–M4 tamamlandı, M1 0.2.0'da)
- **M2 — Abonelik doğrulama servisi** (`services/licensing/`): çevrimdışı
  toleranslı lisans deposu. `modules/`'tan bilinçli olarak farklı fail
  yönü — modül kayıt defteri DB'ye erişemeyince fail-CLOSED (hepsi
  kapalı) davranırken, licensing merkez sunucuya erişemeyince son bilinen
  geçerli durumu `graceMs` (varsayılan 72 saniye) kadar korur.
  `LICENSE_SERVER_URL` tanımlı değilse tanımlı modüller geçerli sayılır
  (kutudan çalışan ürün) — merkezi zorlama yalnızca bir lisans sunucusuna
  bağlanınca devreye girer.
- **M3 — Admin modül ekranı** (`GET/PATCH /admin/modules`,
  `POST /admin/modules/refresh`): aktivasyon durumu + lisans bilgisi
  birleşik listelenir, panelden aç/kapa ve önbellek tazeleme yapılır.
  Kendi router'ı olarak mount edilir, `routes/admin.js`'e dokunmaz.
- **M4 — Modül kapalıyken zarif bozulma**: kapalı modüle bağlı API
  route'ları artık 404 üretmiyor, anlamlı `503
  { error: { code: 'MODULE_DISABLED', module } }` (no-store) dönüyor.
  İstemcide `<ModuleGate>` nazik bir bilgilendirme gösterir, `BottomNav`
  ilgili sekmeyi gizler. "Kullanılabilir" = panel anahtarı açık VE lisans
  geçerli (çift kapı). `/api/events` + `/api/bets` → betting modülü,
  `/api/casino` → casino-content modülü kapsamında; `/api/inhouse`
  çekirdek platform olduğu için hiçbir zaman gate'lenmez.

### Akış U — Çeviri, para birimi ve biçimlendirme (U2–U5)
- **U2 — Tam çeviri taşıması**: platformdaki tüm sayfa ve bileşenlerdeki
  sabit Türkçe metinler `t('...')` anahtarlarına taşındı (oyun sayfaları,
  admin paneli, profil, bahis kuponu, vb.) — eksik sözlük anahtarı
  denetimiyle doğrulanmış.
- **U3 — İngilizce sözlük kalite geçişi**: `en.js`/`tr.js` tam okundu,
  gerçek yinelenen-anahtar hataları (ör. `profile.bonus` çakışması,
  `profile.*` bloğunun iki kez tanımlanması) düzeltildi.
- **U4 — Para birimi soyutlaması** (`server/src/currency/`,
  `client/src/utils/money.js`): sabit `₺` sembolü kod tabanından
  kaldırıldı, yerine `formatMoney()` (Intl.NumberFormat tabanlı, aktif
  para birimini `Setting` koleksiyonundaki `currency.code` anahtarından
  okur) geçti. `GET /api/currency` herkese açık uçtan istemci aktif para
  birimini öğrenir.
- **U5 — Tarih, saat dilimi ve sayı biçimlendirme**
  (`i18n/useFormatters.jsx`, `services/timezone.js`): operatör saat
  dilimi ayarı (`general.timezone` Setting anahtarı, varsayılan
  `Europe/Istanbul`, IANA doğrulamalı) + `Intl`-tabanlı `formatDate`/
  `formatTime`/`formatDateTime`/`formatNumber`. `GET /api/locale-config`
  ile istemci render'da operatör bölgesine çevirir; geçersiz tarih/sayı
  `'—'` döner, throw etmez. 12 dosyadaki ham `toLocaleDateString/
  TimeString` kullanımları ve hardcoded `'tr-TR'` locale'i temizlendi.

### Kırılan Değişiklikler
- Kapalı bir modüle (`betting` veya `casino-content`) bağlı API uçları
  artık 404 yerine `503 { error: { code: 'MODULE_DISABLED' } }` döner —
  bu uçları doğrudan tüketen entegrasyonlar 404 kontrolü yapıyorsa
  güncellenmeli.
- `₺` sembolü artık kod içinde sabit değil; para birimi operatör
  panelinden (`currency.code` Setting anahtarı) değiştirilebilir.
  Varsayılan hâlâ TRY, davranış değişmez, ancak sabit metin arayan
  entegrasyon/test varsa `formatMoney()` çıktısına göre güncellenmeli.

### V1 — Demo ortamı ve sınırlı demo yöneticisi
- `demo/seedCore.js`: `demo_admin` (role=admin + `isDemoAdmin` bayrağı),
  3 demo oyuncu, örnek etkinlik ile bahis/casino geçmişi — tümü açıkça
  sahte (`demo_` öneki, `@demo.local`). İdempotent, ikinci koşuda hiçbir
  varlık çoğalmaz.
- `middleware/demoAdmin.js`: demo yönetici hesabı yıkıcı işlemler
  (kullanıcı silme, bakiye değiştirme, etkinlik sonuçlandırma) yapamaz —
  403 `DEMO_ADMIN_READONLY`. Bayrak her istekte DB'den taze okunur, yeni
  bir rol değeri eklemez.
- `GET /api/demo/showcase`: her vitrin kalemini bağlı modülün lisans
  durumuna (M4'ün `isModuleUsable` çift kapısı) göre `requiresModule`
  bayrağıyla döner — kapalı/lisanssız modül rozetle işaretlenir, asla
  500 dönmez.

### V4 — Satış sitesi (sales-site/)
- Ayrı, sade Vite+React uygulaması (`sales-site/`): İngilizce pazarlama
  sayfası — hero, kutu içeriği, modül listesi, "dahil olmayanlar"
  bölümü, SSS. Tüm içerik `docs/product/*.md` kaynaklı.
- Sepet + checkout formu **TEST MODU**: gerçek ödeme entegrasyonu ve
  gerçek anahtar yok (`.env.example`'da `PAYMENT_PROVIDER_KEY=sk_test_...`
  placeholder'ı). Fiyat alanı katalogda `price:null`; arayüz her yerde
  "[FİYAT — insan onayı bekliyor]" gösterir, sepet null fiyatta toplam
  üretmez.

### V3 — ürün sayfası taslağı
- `docs/marketing/product-page.md`: gerçek pazar
  listelemeleri (casino/oyun scriptleri kategorisi) okunarak ortak
  dil/format kavrandıktan sonra yazılan ürün sayfası taslağı.

### D2 — Video kütüphanesi storyboard'ları (kısmi)
- `docs/product/07-video-storyboardlari.md`: 18 video için sahne-sahne
  storyboard (ekran + anlatım + süre), D2'nin istediği 15-20 aralığında.
  Yalnızca bugün var olan özellikler storyboard'landı; K2/M2/M3/O6/D5-
  istemci'ye bağlı videolar açıkça "bekliyor" işaretlendi.
- **Bu kart `done` değil, kasıtlı olarak.** Kabul kriteri ("her ana
  akışın bir videosu var, ürün sayfasına gömülü") gerçek video dosyası
  ve embed gerektiriyor — bunları üretecek yetenek (kayıt/kurgu) bu
  oturumda yok. Storyboard'lar, geliştirme sürecinin sonunda
  araştırılacak bir video üretim aracının üzerine kurulacağı temel.


### D3 — Ürüne hakim chatbot
- `services/chatbotKnowledge.js`: docs/product/ ve CHANGELOG.md'yi
  başlıklara göre parçalayan `chunkMarkdown`, terim örtüşmesine dayalı
  `searchKnowledge`. Vektör/embedding altyapısı yok — bilinçli kapsam
  kararı, küçük doküman kümesinde terim örtüşmesi yeterli sinyal verir.
- `services/chatbot.js`: `answerQuestion` — alakalı hiçbir doküman
  parçası bulunamazsa **LLM'e hiç gidilmez**, deterministik bir
  yönlendirme mesajı döner. "Bilmediğinde insana yönlendiriyor" kabul
  kriteri bir prompt talimatına değil, koda dayanır. Sistem prompt'u
  her seferinde güncel sürüm numarasını taşır (sürüm farkı kriteri).
- `routes/help.js`: eskiden VIP90.bet'e özgü, ürünle bağlantısız sabit
  bir prompt kullanıyordu — artık gerçek dokümanlara köklenmiş.
- `LiveHelp.jsx`: `escalated` bayrağı görsel olarak ayırt ediliyor.
  Oyuncuya dönük ticket oluşturma ekranı (D5'in istemci tarafı) henüz
  yok — bu yüzden işlevsiz bir "ticket aç" linki eklenmedi, yalnızca
  dürüst bir görsel işaret var.

TDD: 14 yeni test, tamamı önce kırmızı. Suite 279/279. Build başarılı. (D3)

## [0.2.0] — 2026-08-21

Faz 0 (Sözleşmeler) tamamlandı ve Faz 1'in (dört paralel akış) büyük
bölümü bu sürümde toplandı: Akış A (arayüz özelleştirme) tam, Akış B
(operatör araçları) tam, Akış C (oyuncu deneyimi) büyük ölçüde tam,
D akışının (bakım ajanı + dokümantasyon) 7/9 kartı, Akış K'nın ilk
kartı. Toplam 29/52 kart.

**Bu hâlâ bir geliştirme sürümüdür, satışa hazır sürüm değildir.**
1.0.0 etiketi, Faz 2 (entegrasyon ve sertleştirme) ile Faz 3 (vitrin ve
yayına çıkış) tamamlanıp ürün yayına gönderilmeye hazır olduğunda
verilecek.

### D5 — Oyuncu yardım masası / ticket sistemi
- `models/Ticket.js`: konu + mesaj dizisi (gönderen, rol, metin),
  status (open/in_progress/resolved/closed).
- `services/ticket.js`: iş kuralları — operatör yanıtlarsa open tiket
  otomatik in_progress'e geçer; oyuncu resolved bir tikete yazarsa
  otomatik yeniden open olur; closed bir tikete yazmak status'ü
  değiştirmez (kapanmış tiket sessizce yeniden açılmaz).
- `routes/ticket.js` + `controllers/ticket.js`: oyuncu uçları
  (kendi tiketiyle sınırlı) ve admin uçları (tüm tiketler + durum
  değiştirme).
- Test izolasyonu notu: bu kartın testleri kendine özgü, benzersiz bir
  test veritabanı kullanır ve after()'da güvenle dropDatabase()+
  disconnect() çağırır — Akış B'de tespit edilen paylaşımlı-DB
  izolasyon sorununun önlenmiş hali. Ayrıca disconnect() olmadan
  mongoose bağlantısının process'i sonsuza kadar canlı tuttuğu bir
  hata bu kartta bulunup düzeltildi.

TDD: 13 yeni test, tamamı önce kırmızı. Suite 265/265. (D5)

### Eklendi
- Odds sağlayıcı kayıt defteri ve kontratı (`services/oddsProviders/registry.js`):
  sync katmanının tek bir bahis sitesine doğrudan bağımlılığını sökmenin ilk adımı.
  `ODDS_PROVIDER` env'inden aktif sağlayıcı seçimi, çift kayıt ve bilinmeyen
  sağlayıcı reddi. (T1)
- oddsSource odds adaptörü (`services/oddsProviders/oddsSourceProvider.js`): mevcut
  oddsSource bağlantısını kontratın arkasına alır, ham veriyi normalize etkinliğe
  çevirir. Ağ erişimi enjekte edilebilir — testler ağa çıkmaz. Bozuk satırları
  atlar, batch'i öldürmez. (T1)
- LiveSync job'ı odds sağlayıcı kontratına bağlandı
  (`jobs/oddsSourceLiveSync.js`): `/livemenu/left/` parse'ı ve normalizasyon
  `oddsSourceProvider`'a taşındı, job artık kaynağı `getActiveOddsProvider()`
  üzerinden çözüyor. Kaynağı değiştirmek job'ı düzenlemeyi değil,
  `ODDS_PROVIDER` env'ini değiştirmeyi gerektiriyor. DB eşleme, canlı oran
  çekme (`/live/{eid}/`) ve WebSocket orkestrasyonu job'da kaldı — oran
  teslim mekanizması T2'de (lisanslı feed) soyutlanacak. (T1 — hakkıyla
  tamamlandı: sağlayıcı artık üretimde de değiştirilebilir, yalnızca test
  kontratında değil)
- Sağlayıcı-bağımsız normalize etkinlik sözleşmesi
  (`services/oddsProviders/normalizedEvent.js`): tüm sağlayıcıların hedefleyeceği
  ortak etkinlik/oran biçimi. (T1)

### T3 — Casino aggregator kontratı
- Palace bağlantısı genel aggregator kontratının arkasına alındı
  (`services/casinoAggregators/`): kayıt defteri + kontrat (oyun kataloğu,
  oyun URL'i, kullanıcı/bakiye, callback doğrulama, health check) +
  `palaceAdapter.js` (mevcut palaceCasinoService'i saran passthrough,
  DI ile ağa çıkmadan test edilebilir) + bootstrap (`CASINO_AGGREGATOR`
  env seçimi, varsayılan palace).
- `routes/palace.js` artık `palaceCasinoService`'i doğrudan değil,
  `getActiveCasinoAggregator()` üzerinden çözüyor — ikinci bir aggregator
  eklemek yeni bir adaptör kaydetmekten ibaret, route dosyası değişmez.
- Palace'a özgü idari/raporlama uçları (bonus call, RTP, transactions,
  statistics) kontratın zorunlu parçası değil; enjekte edilen serviste
  varsa opsiyonel olarak taşınır. (T3)

### M1 — Modül kayıt defteri
- `modules/registry.js`: üç satılabilir modülün (betting, casino-content,
  live-casino) tek doğruluk kaynağı. Çekirdek platform (13 in-house oyun)
  bilinçli olarak bir modül DEĞİL — her zaman açık. `services/settings.js`
  ile aynı DI deseni (`load`/`now`/`ttlMs` enjekte edilebilir, TTL cache).
  Fail-closed: DB okunamazsa tüm modüller kapalı sayılır.
- `modules/index.js`: üretim bağlantısı, mevcut `Setting` koleksiyonunu
  (`module.<id>.enabled` anahtarıyla) kullanır — yeni şema açmadan.
  `setModuleEnabled()` admin panelinin (M3) üzerine ineceği yüzey. (M1)

### U1 — i18n çekirdeği
- `client/src/i18n/core.js`: framework'ten bağımsız saf çeviri mantığı
  (arama, `{param}` interpolasyonu, fallback, anahtar doğrulama). Anahtar
  kuralı: nokta ayraçlı, en az iki segment, küçük harfle başlayan camelCase
  (`auth.username`). DOM/React olmadan test edilir.
- `I18nProvider.jsx` + `useTranslation()`: React'e ince bir sargı,
  localStorage'da dil kalıcılığı; mantık tekrarlanmaz, çekirdeğe delege eder.
- `LanguageSwitcher.jsx`: sözleşmenin kanıtı — yalnızca `useTranslation()`
  ile render olan, iki dilde çalışan tek bileşen (kabul kriteri).
- Gerçek entegrasyon: `App.jsx` kökte `I18nProvider` ile sarıldı;
  `Login.jsx`'te kullanıcı adı placeholder'ı `t('auth.username')`'e
  bağlandı, `LanguageSwitcher` mount edildi. Bu sırada dosyada önceden var
  olan bir `t` isimli tab-state değişkeniyle isim çakışması bulundu ve
  `tabId` olarak yeniden adlandırılarak çözüldü.
- Not: çekirdek 14 testle kapsanıyor; React sargısı (Provider/hook/
  LanguageSwitcher) projede React test renderer bulunmadığı için otomatik
  render testiyle değil, build doğrulaması + saf delegasyon mantığıyla
  güvence altına alındı. Tam metin taşıması U2'nin kapsamı. (U1)

### A1 — Tema token sistemi
- `theme/registry.js`: renk/tipografi/köşe/gölge token'larının tek doğruluk
  kaynağı (`primary`, `primaryDark`, `accent`, `radiusMd`, `fontDisplay`).
  Varsayılanlar mevcut tasarımın gerçek değerleri — override yoksa görsel
  hiçbir şey değişmez. `modules/registry.js` ile aynı DI deseni, fail-safe
  (DB okunamazsa varsayılanlara düşer).
- `theme/index.js`: mevcut Setting koleksiyonu üzerinden üretim bağlantısı
  (`theme.<id>` anahtarı), `setThemeToken()` admin ekranının (A2/A3)
  üzerine ineceği yüzey.
- `GET /api/theme`: herkese açık, kimlik doğrulama gerektirmez; CSS custom
  property haritası döner (30 sn cache).
- İstemci: `ThemeStyleInjector` sayfa yüklenirken override'ları çekip
  `document.documentElement`e enjekte eder; fetch başarısız olursa
  `index.css`'teki varsayılanlarla sessizce devam eder.
- Uçtan uca kanıt: `primary` ve `accent` CSS var'a bağlandı
  (`tailwind.config.js`), her ikisi de düzinelerce bileşende
  (`text-primary`, `bg-primary`, vb.) zaten kullanılıyor — tek bir DB
  değeri değişince bu bileşenlerin tümü etkilenir (kabul kriteri).
- Not: paletin geri kalanı (bg/text/danger/success vb. hâlâ sabit hex) ve
  admin düzenleme arayüzü A2/A3/A6'nın kapsamı; A1 yalnızca kontratı ve
  uçtan uca boru hattını kanıtlar. (A1)

### D6 — Otonom bakım ajanı çekirdeği
- `agent/masking.js`: allowlist tabanlı teşhis verisi maskeleme. Denylist
  değil allowlist — bilinmeyen alan sızmaz. Allowlist'teki alanın değeri
  primitive değilse (obje/dizi) hiç geçirilmez; beklenmeyen şekli
  serileştirmek (JSON.stringify ile nested içerik) sızıntının ta kendisi
  olduğu için bilerek reddedildi.
- `agent/signature.js`: Ed25519 imzalama/doğrulama. Yalnızca `actionId`+
  `params` imza kapsamında; özel anahtar hiçbir zaman müşteri makinesine
  geçmez, yalnızca doğrulama (açık) anahtarı dağıtılır.
- `agent/registry.js`: minimal Action-ID kayıt defteri — kayıtsız eylem,
  imza geçerli olsa bile asla çalıştırılmaz. Etki-yarıçapı sınıflaması ve
  insan onay kapısı D7'nin kapsamı.
- `agent/localAgent.js`: pull döngüsü orkestrasyonu. Sıra: kapalıysa
  pull hiç çağrılmaz → komut yoksa geç → imza geçersizse çalıştırma →
  eylem kayıtsızsa çalıştırma → yalnızca tüm kapılardan geçen çalışır.
- `services/support/agentToggle.js` + `index.js`: panelden aç/kapat
  (varsayılan KAPALI), mevcut Setting koleksiyonu üzerinden — modules/
  ve theme/ ile aynı DI deseni. Minimal bellek-içi komut kuyruğu (D8
  kalıcı depolama + WAF ile sertleştirecek), komut bir kez teslim
  edilince kuyruktan düşer (çift çalıştırma yok).

Dürüstlük notu: `commandQueue` testleri implementasyondan SONRA yazıldı
(TDD sırası burada tersine döndü) — diğer tüm modüller sıkı red-first.

TDD: 38 yeni test (37'si önce kırmızıydı). Suite 193/193. (D6)

### D7 — Action-ID risk sınıflaması ve insan onay kapısı
- `agent/actionCatalog.js`: merkezi Action-ID kataloğu, her eylem `safe`/
  `destructive` olarak sınıflı. Kayıtsız eylem için risk sorgusu sessizce
  "safe" varsaymaz, hata fırlatır (fail-closed).
- `agent/approvalGate.js`: salt-okunur eylemler `propose()` anında
  auto-approved; yıkıcı eylemler yalnızca temsilcinin açık `approve()`
  çağrısıyla onaylanır (`reject()` de var). Kayıtsız eylem için öneri
  hiç oluşmaz.
- **Sertleştirme** (ilk entegrasyon testi yazarken bulundu): kriptografik
  imza tek başına "onaylandı mı" sorusuna cevap vermiyordu — süreç
  atlanıp doğrudan imzalansa bile localAgent reddetmiyordu. Düzeltildi:
  `approvedBy` artık imza kapsamının içinde (`signature.js` canonical
  payload'a eklendi, kurcalanamaz), ve `localAgent.tick()` yıkıcı eylemde
  bunu yapısal olarak zorunlu kılıyor (`missing-approval` reddi).
- **Fail-closed düzeltmesi:** lokal registry ile merkezi katalog iki ayrı
  doğruluk kaynağı ve ayrışabilir — lokalde kayıtlı ama katalogda tanımsız
  bir eylem artık `tick()`'i çökertmiyor, `unclassified-risk` ile temiz
  reddediliyor.
- Uçtan uca entegrasyon testi: propose→gate→sign→lokal ajan zinciri hem
  salt-okunur hem yıkıcı yol için, onay atlanırsa reddi de dahil.

TDD: 27 yeni test, tamamı önce kırmızı. Suite 220/220. (D7)

### D8 — Merkez WAF ve HSM-uyumlu imza sağlayıcı
- `agent/promptFirewall.js`: prompt-injection filtresi. D6'nın maskelemesi
  hangi ALANLARIN geçtiğini sınırlar, bu ise geçen alanların İÇERİĞİNİ
  tarar ("ignore previous instructions", sahte `system:`/`assistant:`
  rol işaretleyicileri vb.). Fail-closed: herhangi bir alan şüpheliyse
  TÜM payload reddedilir, kısmi temizlik yapılmaz.
- `services/support/index.js` → `createDiagnosticInbox()`: müşteriden
  merkeze giden teşhis raporu kuyruğu, `submit()` anında WAF'tan geçer —
  şüpheli veri kuyruğa hiç girmez (`size()`/`next()` ile ispatlı).
- `agent/signingProvider.js` + `signature.js` → `signCommandWithProvider`:
  imza sağlayıcı arayüzü (`{ sign(buffer): Promise<Buffer> }`). Bu commit
  yalnızca bellek-içi (dev/test) sağlayıcıyı içerir — **gerçek HSM/KMS
  entegrasyonu (donanım seçimi, provisioning, IAM, maliyet) bir operasyon
  kararıdır ve bilerek bu kod oturumunun kapsamı dışında bırakıldı.**
  Kurulan şey: çağıran kodun özel anahtarı hiç görmediği, gerçek bir
  HSM/KMS sağlayıcısının aynı sözleşmeyle (drop-in) takılabileceği arayüz.
  D6'nın `signCommand` (ham anahtar) fonksiyonu değişmeden duruyor.

TDD: 20 yeni test, tamamı önce kırmızı. Suite 240/240. (D8)

### D9 — İmzalı güncelleme paketi
- Yeni bir mekanizma icat edilmedi: `APPLY_UPDATE`, `actionCatalog.js`'e
  yıkıcı bir Action-ID olarak eklendi — D6/D7/D8'in aynı boru hattından
  (kayıt→onay→imza→doğrulama) geçiyor. "Güncelleme operatör onayıyla
  uygulanıyor, paket imzası doğrulanıyor" kabul kriteri bu yüzden zaten
  var olan mekanizmanın bir kompozisyonu.
- `agent/updatePackage.js`: güncellemeye özgü ek denetimler — manifest
  şekli (`file`+`checksum` zorunlu) ve sürüm monotonluğu (eski/eşit
  sürüm, operatör onaylasa ve imza geçerli olsa BİLE reddedilir — ek
  güvenlik katmanı).
- `registerUpdateHandler`: gerçek dosya uygulaması (`applyMigration`)
  enjekte edilir — K4'ün migration runner'ı (henüz `todo`) hazır
  olduğunda buraya bağlanacak. Bu ayrım bilinçli: D9 "ne zaman ve kimin
  onayıyla" sorusunu çözer, "dosyalar nasıl uygulanır" K4'ün işi.

Uçtan uca entegrasyon testi: onay atlanırsa red, onaylanınca uygulanır,
eski sürüm onaylansa bile reddedilir.

TDD: 12 yeni test, tamamı önce kırmızı. Suite 252/252. (D9)

**D akışı (dokümantasyon, destek, bakım ajanı — 9 kart) TAMAMLANDI.**
Kalan: D1-D5 (yazılı doküman, video, chatbot, ticket sistemi) — bu
oturumun kapsamı dışında, ayrı bir üretim/içerik işi.

### D1 — Yazılı dokümantasyon
- `docs/product/` (7 dosya): kurulum, yapılandırma, modül sistemi,
  oyun matematiği, API referansı, SSS. Gerçek sistemin bugünkü
  durumunu yansıtır — henüz yapılmamış işleri (Docker kurulumu,
  panelden modül satın alma, panelden RTP ayarı, tam çeviri) varmış
  gibi göstermez, her belgede "bugün ne var, ne yok" açıkça ayrılmış.
- `.env.example`'daki kullanılmayan `ODDS_API_KEY` kalıntısı belgelerde
  not düşüldü (temizlenmesi ayrı bir iş).

Not: içerik yazımı, kod gibi kırmızı/yeşil TDD döngüsüne tabi değil —
doğrulama yöntemi farklıydı: her iddia, ilgili kaynak dosya (route
listesi, .env.example, crashGame.js vb.) okunarak teyit edildi. (D1)

## [0.1.0] — 2026-08-20

İlk sürüm çizgisi. Ürün yol haritasının (52 kart, 9 alan) başlangıç
noktası; çekirdek platform, 13 in-house oyun ve mevcut admin paneli bu temeli
oluşturur.
