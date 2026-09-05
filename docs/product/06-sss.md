# Sıkça Sorulan Sorular

Bu liste, benzer ürünlerdeki gerçek alıcı sorularından derlendi — amaç,
satın almadan önce belirsizlik bırakmamak.

**Hangi oyunlar dahil, hangileri ayrı satılıyor?**
13 in-house oyunun (Crash, Mines, Plinko, Dice, Limbo, Wheel, Hilo,
Keno, Blackjack, Roulette, Baccarat, Video Poker, Dragon Tiger) **hepsi
kutuda** — ayrı bir oyun eklentisi satın almanıza gerek yok. Casino
içeriği (slot, masa oyunları bir sağlayıcı üzerinden) ve spor bahis
akışı ayrı modüllerdir, bkz. [03 — Modül Sistemi](03-modul-sistemi.md).

**Domain değiştirirsem lisansım sıfırlanır mı?**
Ürün kaynak kod olarak teslim edilir, domain'e kilitli bir lisans
doğrulama mekanizması yoktur. Güncellemeler ve destek satın alma
kodunuza bağlıdır.

**Kurulum hizmeti veriyor musunuz, ücreti ne kadar?**
Bu belge kendi başınıza kurulum için yeterlidir
([01 — Kurulum](01-kurulum.md)). Kurulum hizmeti isteyen alıcılar için
ayrı, sabit fiyatlı bir paket satış kanalımızda listelenecek.

**Hangi ödeme yöntemleri kutuda geliyor?**
Banka havalesi (manuel onay akışı) ve USDT-TRC20 kripto yatırma kutuda
var. Ek ödeme sağlayıcıları (kart, diğer kripto ağları) entegrasyonu
kod tabanına eklenebilir ama bugün hazır değil.

**Casino sağlayıcısı GGR payı istiyor mu?**
Casino modülünü kullanmak için seçtiğiniz aggregator ile (lisanslı bir
sağlayıcı ya da bizim önerdiğimiz kanal) ayrı bir ticari görüşme
gerekir — bu platformun fiyatına dahil değildir, aggregator'ın kendi
şartlarına tabidir.

**Kaç dil destekliyor?**
TR ve EN sözlükleri hazır (`client/src/i18n/dictionaries/`, her biri
~1490 anahtar), dil değiştirici gezinme çubuğunda sitenin her yerinden
erişilebilir ve 67 sayfa bileşeninden 59'u sözlükten okuyor. Ama
**çeviri kapsamı hâlâ tam değil** — `HomePage.jsx`, `Bahis.jsx`,
`Live.jsx`, `CasinoRedesign.jsx`, `Profile.jsx` gibi büyük sayfalarda
hâlâ doğrudan gömülü Türkçe metin var. Yani altyapı ve gezinme geneli
bitti, sayfa içerikleri kısmen çevrilmiş; bkz.
[02 — Yapılandırma § Çok dilli destek](02-yapilandirma.md).

**Çoklu para birimi destekliyor mu?**
Site genelinde tek bir aktif para birimi vardır (kullanıcı başına ayrı
cüzdan değil) — admin panelinden TRY/USD/EUR arasından seçilebilir ve
seçim sembol/locale biçimlendirmesini değiştirir (bkz.
`server/src/currency/registry.js`). Kullanıcıların aynı anda birden
fazla para biriminde bakiye tutması desteklenmiyor.

**RTP / house edge'i panelden ayarlayabilir miyim?**
Evet. 13 in-house oyunun her biri için house edge/payout faktörü,
min-max bahis ve zamanlama gibi RTP'yi gerçekten belirleyen
değişkenler admin panelindeki **Oyun Ayarları** ekranından
değiştirilebilir (`client/src/pages/admin/GameSettings.jsx` →
`PATCH /admin/game-settings/:gameId`); her değişiklik kim/ne
zaman/eski-yeni değer olarak loglanır (`GameSettings.changeLog`).
Matematiğin kendisi (hangi değişken neyi belirliyor) için
[04 — Oyun Matematiği](04-oyun-matematigi.md)'ye, panel tarafı için
[02 — Yapılandırma](02-yapilandirma.md)'ya bakın.

**Modülleri (bahis/casino içeriği/canlı casino) nasıl açıp kapatırım?**
Admin panelindeki **Modüller** ekranından tek tıkla
(`client/src/pages/admin/Modules.jsx` → `PATCH /admin/modules/:id`),
sunucu yeniden başlatmadan. Kapalı bir modülün sayfaları ziyaretçiye
"Bu bölüm şu anda kapalı" mesajıyla nazikçe gizlenir, çekirdek platform
etkilenmez (`ModuleGate` bileşeni). Bir `LICENSE_SERVER_URL`/`LICENSE_KEY`
tanımlamadıysanız (çoğu operatör tanımlamaz) tüm modüller otomatik
"lisanslı" sayılır — ürün kutudan çıktığı gibi çalışır. *(Not:
[03 — Modül Sistemi](03-modul-sistemi.md) bu ekranın henüz olmadığını
söylüyor — o belge güncellenmeyi bekliyor, gerçek kod bundan daha
ileride.)*

**Logo/favicon/renk temasını panelden değiştirebilir miyim?**
Evet — bu, birçok benzer üründe eksik olan ve en çok şikayet edilen bir
özellik; VIP90.bet'da panelden logo, favicon, site adı, font ve renk
teması değiştirilebiliyor, kodu düzenlemeniz gerekmiyor.

**Destek için her seferinde ödeme mi gerekiyor? Yardım masası/destek
asistanı gerçekten var mı?**
Satın alma kodunuza bağlı destek süresi boyunca temel destek dahildir.
Ayrıca ürüne gömülü bir **ticket sistemi** (`server/src/routes/ticket.js`
— oyuncu talep açar/yanıtlar, admin yanıtlar/durum değiştirir) ve
`docs/product/*.md` + `CHANGELOG.md`'yi gerçekten okuyup parçalara
ayıran bir **destek asistanı chatbot'u** (`server/src/routes/help.js`,
`server/src/services/chatbotIndex.js`) zaten kod tabanında var ve
çalışır durumda — `AI_HELP_API_KEY` tanımlı değilse chatbot çökmek
yerine "şu an bakımda, ticket açın" yanıtı döner ve akış yine ticket'a
düşer. (Bu SSS dosyası da chatbot'un okuduğu dokümanlardan biridir.)

**KYC (kimlik doğrulama) gerçekten çalışıyor mu?**
Kısmen — dürüst olmak gerekirse hayır, uçtan uca değil.
`server/src/services/kyc.js` belge gönderme, onay/red, süre
doldurma gibi akışları içeren zengin bir servis olarak **var**, ama
hiçbir route/controller'a bağlı değil (`requireKyc`,
`submitKycDocuments` hiçbir yerde çağrılmıyor). Kullanıcı tarafında
belge yükleme arayüzü yok. Admin panelinde yalnızca kullanıcı
kartında ham bir `kycVerified` onay kutusu var
(`client/src/pages/admin/components/UserSlideOver.jsx`) — admin bunu
elle işaretliyor, otomatik bir doğrulama akışı çalışmıyor. KYC'yi
gerçek anlamda devreye almak (belge yükleme arayüzü + route'ları
servise bağlamak) ayrı bir geliştirme kartı gerektiriyor.

**Mobil uygulama ya da Telegram Mini App var mı?**
PWA (ana ekrana eklenebilir, çevrimdışı kabuk) desteği var. Native
mobil uygulama ya da Telegram Mini App şu an yok.

**Paylaşımlı hosting'de çalışır mı?**
Hayır. Node.js + MongoDB + WebSocket birlikte çalıştığı için gerçek bir
VPS gerekir, asgari 4 vCPU / 8 GB RAM önerilir. Bkz.
[01 — Kurulum](01-kurulum.md).
