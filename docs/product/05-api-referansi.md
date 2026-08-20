# API Referansı

Tüm uçlar `/api` altında toplanır. Bu belge uç nokta **gruplarını**
özetler — her uç için tam parametre listesi kaynak kodun kendisidir
(`server/src/routes/`), bu belge oraya giden bir haritadır.

| Grup | Taban yol | Ne içerir |
|---|---|---|
| Kimlik doğrulama | `/api/auth` | Kayıt, giriş, oturum yenileme, e-posta doğrulama, şifre sıfırlama |
| Etkinlikler | `/api/events` | Spor bahis etkinlik listesi, detay |
| Bahisler | `/api/bets` | Kupon oluşturma, bahis geçmişi |
| Kullanıcılar | `/api/users` | Profil, bakiye, işlem geçmişi |
| İşlemler | `/api/transactions` | Para yatırma/çekme kayıtları |
| Promosyonlar | `/api/promotions` | Bonus talep etme, aktif promosyonlar |
| Casino | `/api/casino` | Oyun kataloğu, oturum başlatma (aggregator üzerinden) |
| Palace | `/api/palace` | Casino aggregator'ına özel uçlar (callback, oturum yönetimi) |
| In-house oyunlar | `/api/inhouse` | 13 oyunun kendi uçları (`/inhouse/crash/*`, `/inhouse/mines/*` vb.) |
| Yardım | `/api/help` | Destek widget'ı |
| Kripto | `/api/crypto` | USDT-TRC20 yatırma takibi |
| Banka | `/api/bank` | Havale ile yatırma talepleri |
| Tema | `/api/theme` | Panelden yönetilen görsel token'lar (herkese açık, kimlik doğrulama gerektirmez) |
| Admin | `/api/admin` | Kullanıcı yönetimi, etkinlik yönetimi, ayarlar — yönetici yetkisi gerektirir |
| Admin analitik | `/api/admin/analytics` | Gösterge paneli istatistikleri |
| 2FA | `/api/auth/2fa` | Yönetici hesapları için iki faktörlü doğrulama |

## Kimlik doğrulama modeli

- Erişim token'ı: kısa ömürlü JWT, `Authorization: Bearer <token>` header'ında.
- Yenileme token'ı: `httpOnly` cookie, `/api/auth/refresh` ile yeni erişim
  token'ı alınır.
- **Misafir uçları** (`/auth/login`, `/auth/register`,
  `/auth/forgot-password`, `/auth/reset-password`) aktif oturumda
  `403 ALREADY_AUTHENTICATED` döner — açık oturumlu bir kullanıcı bu
  uçları çağıramaz.

## Hata biçimi

Tüm hatalar aynı zarfta döner:

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Kullanıcı adı veya şifre hatalı" } }
```

`code` alanı programatik kontrol için, `message` kullanıcıya
gösterilebilir Türkçe metin için.

## Hız sınırlama

Kimlik doğrulama uçları (`/auth/login`, `/auth/register` vb.) ayrı bir
hız sınırlayıcı arkasındadır — art arda başarısız giriş denemeleri
belirli bir eşikten sonra geçici olarak kilitlenir.
