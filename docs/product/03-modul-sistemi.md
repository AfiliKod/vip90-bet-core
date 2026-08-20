# Modül Sistemi

VIP90.bet'un çekirdek platformu (13 in-house oyun, kullanıcı yönetimi,
bonus/çevrim motoru, temel admin paneli) her zaman açıktır — bir satın
alma sonrası tamamen çalışır durumdadır, ek bir şey gerekmez.

Üç ek modül **ayrı satılır/lisanslanır**:

| Modül | Ne sağlar |
|---|---|
| **Bahis** | Spor + canlı bahis: oran akışı, kupon, otomatik sonuçlandırma |
| **Casino İçeriği** | Slot ve masa oyunları, bir aggregator üzerinden |
| **Canlı Casino** | Gerçek krupiyeli masa ve video oyunları |

## Bugünkü durum (dürüstlük notu)

Bu üç modülün **kod seviyesinde bir kayıt defteri** var
(`server/src/modules/registry.js`) — hangi modülün tanımlı olduğunu ve
açık/kapalı durumunu tek bir yerden okuyabiliyoruz. Ama şu an **eksik**
olanlar:

- Panelden modülü açıp kapatan bir ekran yok — bugün yalnızca
  veritabanına doğrudan bir `Setting` kaydı yazılarak açılabilir
  (`module.<id>.enabled`).
- Bir modül kapalıyken ilgili sayfaların/route'ların zarifçe
  kaybolması (menüden kalkması, API'nin 404 yerine anlaşılır bir hata
  dönmesi) henüz uygulanmadı.
- Abonelik/lisans doğrulaması (bir modülün süresi dolunca otomatik
  kapanması) henüz yok.

Yani bugün itibarıyla modül sistemi bir **mimari temel** — üç modülün
birbirinden ve çekirdekten net bir sınırla ayrılmış olduğunu, ve bu
sınırın kod tarafında zaten var olduğunu garanti eder. Operatöre dönük
"satın al / etkinleştir" deneyimi henüz eklenmedi.

## Tedarik modeli

Bahis ve casino modülleri, üçüncü taraf veri/içerik sağlayıcılarına
bağımlıdır — bu nedenle platformun kendisinden ayrı bir ticari ilişki
gerektirir. Lisanslı bir operatör içinseniz doğrudan bir aggregator ile
sözleşme yapmanız beklenir; lisans süreci devam ediyorsa alternatif
tedarik seçenekleri için satış ekibiyle görüşün.
