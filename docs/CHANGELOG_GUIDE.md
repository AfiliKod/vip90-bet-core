# Changelog ve Sürüm Notu Şablonu

Bu depo `CHANGELOG.md`'yi [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/)
biçiminde tutar. Her kart/özellik commit'i, `[Yayınlanmadı]` bölümüne kendi
maddesini ekler — sürüm numarası yalnızca bir faz kapandığında artırılır
(bkz. Phantom `goals` tablosundaki `bet-fazN` kilometre taşları).

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

## Sürüm kapanışında (faz tamamlandığında)

1. `[Yayınlanmadı]` başlığını `## [X.Y.Z] — YYYY-MM-DD` olarak değiştir.
2. `package.json`'daki `version` alanını güncelle.
3. Yeni boş bir `## [Yayınlanmadı]` bölümü aç.
4. Hangi fazın kapandığını ve bir sonraki fazda neyin beklendiğini
   kısa bir üst not olarak ekle.

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

Platformu işleten operatörler güncellemeleri kendi kurulumlarına elle uygularlar.
"Ne değişti" belirsizse, alıcı ya güncellemeyi hiç yapmaz (güvenlik açığı
kapanmamış kalır) ya da körlemesine yapıp production'ı kırar. Değişiklik
günlüğü burada bir nezaket değil, D9'daki imzalı güncelleme akışının
insan-okur tarafı.
