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
Alt yapı (i18n çekirdeği) hazır ve bir sayfada (giriş ekranı) uçtan uca
kanıtlandı, ama **sitenin tamamı henüz çevrilmedi** — bu aktif bir
geliştirme akışı. Bugün itibarıyla arayüz metinlerinin büyük bölümü
Türkçe gömülü.

**Çoklu para birimi destekliyor mu?**
Henüz hayır — bakiye ve fiyatlandırma ₺ (Türk Lirası) üzerinden sabit.

**RTP / house edge'i panelden ayarlayabilir miyim?**
Bugün hayır, değerler kaynak kodda sabit (bkz.
[04 — Oyun Matematiği](04-oyun-matematigi.md)). Panelden ayarlanabilir
hale getirilmesi ayrı bir geliştirme akışında.

**Logo/favicon/renk temasını panelden değiştirebilir miyim?**
Evet — bu, birçok benzer üründe eksik olan ve en çok şikayet edilen bir
özellik; VIP90.bet'da panelden logo, favicon, site adı, font ve renk
teması değiştirilebiliyor, kodu düzenlemeniz gerekmiyor.

**Destek için her seferinde ödeme mi gerekiyor?**
Satın alma kodunuza bağlı destek süresi boyunca temel destek dahildir.
Ayrıca ürüne gömülü bir yardım masası (ticket) sistemi ve dokümanları
bilen bir destek asistanı planlanıyor — bu belge o özellikler
tamamlandığında güncellenecek.

**Mobil uygulama ya da Telegram Mini App var mı?**
PWA (ana ekrana eklenebilir, çevrimdışı kabuk) desteği var. Native
mobil uygulama ya da Telegram Mini App şu an yok.

**Paylaşımlı hosting'de çalışır mı?**
Hayır. Node.js + MongoDB + WebSocket birlikte çalıştığı için gerçek bir
VPS gerekir, asgari 4 vCPU / 8 GB RAM önerilir. Bkz.
[01 — Kurulum](01-kurulum.md).
