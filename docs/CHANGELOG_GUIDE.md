# Changelog ve Sürüm Notu Şablonu

Bu depo `CHANGELOG.md`'yi [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/)
biçiminde tutar. Her kart/özellik commit'i, `[Yayınlanmadı]` bölümüne kendi
maddesini ekler — sürüm numarası yalnızca bir faz kapandığında artırılır.

## Madde şablonu

Her madde şu şekle uyar:

```
- <Ne eklendi/değişti, tek cümle>. <Neden/nasıl çalıştığına dair 1-3 cümle,
  gerekiyorsa>. (<Kart kodu, ör. T1, D6>)
```

Kategoriler (yalnızca ilgili olanlar kullanılır, boş kategori açılmaz):

- **Eklendi** — yeni özellik/modül.
- **Değişti** — mevcut davranışta değişiklik (geriye dönük uyumlu).
- **Kırılan Değişiklikler** — mevcut bir entegrasyonu/kurulumu bozabilecek
  değişiklik. **Her zaman ne kadar bozduğunu ve nasıl geçiş yapılacağını
  yazın** — "X artık Y gerektiriyor, önceki kurulumlar Z yapmalı" gibi.
- **Kaldırıldı** — silinen özellik/uç nokta/alan.
- **Düzeltildi** — hata düzeltmesi.
- **Güvenlik** — güvenlik açığı kapatma (CVE varsa referans verilir).

## Girdinin denetlenmesi

`node scripts/check-changelog.mjs [--base origin/main]` dalın tabana göre
değiştirdiği dosyalara bakar. Sunucu, istemci, kurulum, Docker/env dosyaları,
bağımlılıklar ya da eklenti işaretçileri değişip `[Yayınlanmadı]` bölümü
değişmemişse hata verir; yalnız belge, test ya da bakım betiği değiştiyse
geçer. `pre-push` hook'u bunu her push'ta çalıştırır
(`sh scripts/install-hooks.sh` ile bir kez kurulur). Değişiklik gerçekten
operatörü etkilemiyorsa (örneğin yalnız kod yorumu) commit mesajına ayrı bir
satır olarak `Changelog: none` yazılır.

## Sürüm kesmek

Her PR kendi girdisini `[Yayınlanmadı]` altına ekler. Sürüm kesmek için:

1. `node scripts/release.mjs <X.Y.Z>` (önce `--dry-run` ile bakın). Betik
   `[Yayınlanmadı]` başlığını `## [X.Y.Z] — YYYY-MM-DD` yapıp üstüne yeni boş
   bir `[Yayınlanmadı]` açar, kök/server/client `package.json` ve lock
   dosyalarını aynı numaraya çeker, README rozetlerini günceller. Bölüm boşsa
   ya da numara son sürümden büyük değilse durur.
2. Değişiklik PR ile `main`'e girer.
3. Merge commit'ine `vX.Y.Z` etiketi atılır ve CHANGELOG'daki bölümle bir
   GitHub Release oluşturulur.

Numara SemVer'e göre seçilir: kurulumu, API tüketicisini ya da şemayı bozan
değişiklik → major, yeni özellik → minor, düzeltme → patch. Çalışan sürüm
`GET /api/health` yanıtındaki `version` alanından okunur.

## "Neyi bozar" disiplini — zorunlu

Bir değişiklik mevcut bir kurulumu, API tüketicisini veya veritabanı
şemasını etkiliyorsa, bu **Kırılan Değişiklikler** altında, atlanmadan
yazılır — "büyük ölçüde geriye dönük uyumlu" gibi ifadelerle
yumuşatılmaz. Örnek:

```
### Kırılan Değişiklikler
- `GET /api/theme` artık kimlik doğrulama gerektirmiyor (önceden yanlışlıkla
  `requireAuth` arkasındaydı) — ters entegrasyon riski yok, yalnızca not.
- `User.walletAddress` alanı eklendi, sparse unique index ile. Mevcut
  kullanıcı belgelerini etkilemez, yeni bir migration gerekmez.
```

## Neden bu disiplin var

Platformu kendi sunucusunda işleten operatörler güncellemeleri kendi
kurulumlarına elle uygular. "Ne değişti" belirsizse operatör ya güncellemeyi
hiç yapmaz (güvenlik açığı kapanmamış kalır) ya da körlemesine yapıp
production'ı kırar. Değişiklik günlüğü burada bir nezaket değil, imzalı
güncelleme paketi akışının (`server/src/agent/updatePackage.js`) insan-okur
tarafı.
