# Slikair ödeme sağlayıcısı

## Doğrulama, durumlar ve risk incelemesi

Slikair bildirimi tek başına para hareketi oluşturmaz. Çekirdek operatörün kendi kimlik bilgileriyle `get-status` çağrısı yapar; olayın kayıtlı yatırımla durum, tutar ve para biriminde eşleşmesini bekler. `processing`, `succeeded` ve `failed` sağlayıcı yaşam döngüsü durumlarıdır. Doğrulanmış `refunded` önceki yatırmayı `deposit_refund` ile, doğrulanmış `chargeback` ise `chargeback` ile geri alır; ikincisi `PSP_CHARGEBACK` risk bulgusu açar. Yetkili risk personeli bulguyu Risk ekranında review, resolve veya dismiss eder.

Ters kayıt idempotenttir: iade sonrasında gelen chargeback ödeme durumunu güncelleyebilir ama ikinci borç yazmaz. Chargeback negatif bakiye oluşturabilir; bakiye yeterliliği kontrolleri yeni bahis/çekimi engeller.

## Ücret ve NGR yapılandırması

Slikair webhook'u PSP ücret tutarı vermez. Doğrulanmış chargeback tutarı günlük istatistikte `chargebacks`, olay sayısı `chargebackCount` olur. Olay başı PSP masrafı sözleşmesi varsa NGR'de ayrı etiketli `other`, `fixed` kaynak ve `per_chargeback` dönemiyle tanımlanır. Casino sağlayıcı GGR ücreti ayrıdır: `ProviderFeeSchedule` sağlayıcı, `rateOfGgr`, para birimi, tarih ve isteğe bağlı aylık asgari ücreti taşır. Operatöre özel takvim platform varsayılanını ezer; negatif sağlayıcı gününde günlük ücret sıfırdır; aylık asgari ücret günlük hesapta uygulanmaz.

Slikair yatırma bildirimi imzasızdır. Bu nedenle `succeeded`, `refunded` ve
`chargeback` bildirimleri tek başına bakiyeyi değiştirmez: çekirdek, kiracının
kendi Slikair kimlik bilgileriyle `get-status` çağrısı yapar; durumun, tutarın
ve para biriminin kayıtlı yatırmayla eşleşmesini ister.

## Durumlar ve ters kayıtlar

- `processing`, `succeeded` ve `failed` yalnız sağlayıcının yaşam döngüsü
  durumlarıdır; `status_code` bilgi için saklanır ve yaşam döngüsüne karar
  vermez. Özellikle `320` bir BIN engeli/ret kodudur, iade değildir.
- Doğrulanmış bir `refunded` bildirimi, önceden kredilenen yatırmayı
  `deposit_refund` defter satırıyla geri alır.
- Doğrulanmış bir `chargeback` bildirimi aynı işlemi `chargeback` defter
  satırıyla geri alır, hesabı risk değerlendirmesine gönderir ve yönetici
  etkinlik akışına bildirir.
- Ters kayıt, asıl yatırma ve ödeme kaydıyla aynı veritabanı işleminde,
  payin başına tek bir idempotency anahtarıyla yazılır. İadeden sonra gelen
  chargeback yalnız ödeme durumunu günceller; ikinci kez borç yazmaz.

Ters ibraz oyuncu bakiyesini eksiye indirebilir. Negatif bakiye mevcut bakiye
yeterliliği kontrolleri nedeniyle yeni çekim ve bahis isteklerini engeller;
borç kapatılana kadar operatör incelemesi gerekir.

## NGR verisi

`TenantDailyStat.chargebacks`, yalnız tamamlanmış doğrulanmış `chargeback`
defter satırlarının mutlak tutarını; `chargebackCount` ise olay sayısını
toplar. `deposit_refund`, genel `refund` ve `reversal` satırları chargeback
değildir. Slikair bildiriminde ücret kaynağı olmadığı için `providerFees` sıfır
kalır. Sözleşmeyle belirlenen vaka başı PSP masrafı gerekiyorsa NGR tanımında
ayrı etiketli `other` kalemiyle `fixed` + `per_chargeback` yapılandırın.
