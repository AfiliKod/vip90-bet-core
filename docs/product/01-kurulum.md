# Kurulum

İki yol var: **Docker ile tek komut** (önerilen, hızlı) ve **elle kurulum**
(Docker kullanmak istemeyenler için). İkisi de aynı sonuca çıkar: çalışan
bir VIP90.bet örneği + tarayıcıdan doldurulan bir kurulum sihirbazı.

## Gereksinimler

- Node.js 20 veya üzeri (elle kurulum) **veya** Docker + Docker Compose
  (Docker yolu)
- MongoDB 6 veya üzeri (kendi sunucunuzda ya da MongoDB Atlas gibi
  yönetilen bir servis) — Docker yolunda bunu compose kendisi sağlar,
  ayrıca kurmanıza gerek yok
- Bir VPS veya sunucu — **paylaşımlı hosting yeterli değildir**. Canlı
  bahis akışı, WebSocket bağlantıları ve MongoDB birlikte çalışırken
  4 GB altındaki bellek sıkışır. Asgari önerilen: 4 vCPU / 8 GB RAM.

## Yol 1: Docker ile kurulum (önerilen)

Depo kökünde `docker-compose.yml`, `Dockerfile`, `deploy/Caddyfile` ve
`.env.docker.example` hazır gelir. Üç servis çalışır:

| Servis | Ne yapar | Dışa açık port |
|---|---|---|
| `mongo` | Veritabanı (imaj: `mongo:7`) | Yok — yalnızca compose ağı içinde |
| `app` | Node/Express API + derlenmiş istemci (bu depodaki `Dockerfile`) | Yok — yalnızca compose ağı içinde |
| `caddy` | Ters vekil, otomatik HTTPS (`caddy:2-alpine`) | 80, 443 |

Trafik akışı: internet → Caddy (80/443) → `app:3001` → `mongo`. Mongo ve
app hiçbir portu dışa açmaz, yalnızca Caddy yayınlanır.

### Adımlar

```bash
cp .env.docker.example .env
```

`.env` dosyasını açıp doldurun:

- `DOMAIN` — Caddy'nin sertifika alacağı gerçek alan adınız. Boş/varsayılan
  bırakılırsa `localhost` kabul edilir ve Caddy self-signed bir sertifikayla
  açılır (ilk gün test için sertifika şartı aramaz; gerçek domainde bu satır
  devreye girmez, Let's Encrypt otomatik çalışır).
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — `openssl rand -base64 64` ile üretin.
- `CLIENT_URL` — tarayıcıdan erişilecek genel adres (`https://DOMAIN`).
- Casino/SMTP/opsiyonel bölümler — kullanacaksanız doldurun, kullanmayacaksanız
  boş bırakabilirsiniz.

> `MONGODB_URI`'yi bu dosyaya **yazmayın** — `docker-compose.yml` onu
> compose içi `mongo` servisine (`mongodb://mongo:27017/betzone`)
> otomatik yönlendirir; `.env`'e yazdığınız değer app konteynerinde
> ezilir.

```bash
docker compose up -d
```

İlk açılışta `app` imajı derlenir (client build + server bağımlılıkları +
Playwright Chromium kurulumu dahil — birkaç dakika sürebilir), `mongo`
sağlık kontrolünü geçtikten sonra `app` başlar.

### Kurulum sihirbazı

Konteynerler ayaktayken tarayıcıdan `https://DOMAIN/install` (ya da
test için `https://localhost/install`) açın. Sihirbaz:

1. `/install/api/status` ile veritabanı bağlantısını ve "zaten kurulu mu"
   durumunu kontrol eder (kurulu ise formu göstermez).
2. Site adı, para birimi, ilk yönetici kullanıcı adı/e-posta/parolasını
   ister.
3. Gönderince ilk `admin` rolündeki kullanıcıyı oluşturur (parola gerçek
   `User` modelinin pre-save hook'uyla bcrypt ile hash'lenir), site adı
   ve para birimini `Setting` koleksiyonuna yazar.
4. Ekranda kopyalanabilir bir `.env` çıktısı üretir (rastgele JWT
   anahtarları dahil) — bunu sunucudaki `server/.env`'e kaydedip
   uygulamayı yeniden başlatmanız istenir.

Kaynak: `installer/core.js`, `installer/page.js`,
`server/src/routes/install.js` (`app.js`'te `/install` altında mount
edilir).

> **Önemli:** sihirbaz yalnızca **hiç admin kullanıcısı yokken** çalışır.
> Zaten bir admin varsa `/install` "sistem zaten kurulmuş" mesajı gösterir
> ve formu göstermez — yeniden çalıştırmak için önce mevcut admin
> kaydının kaldırılması gerekir.

## Yol 2: Elle kurulum (Docker'sız)

### 1. Bağımlılıkları kurun

```bash
npm run install:all
```

Bu komut kök, `server/` ve `client/` dizinlerindeki tüm bağımlılıkları
sırayla kurar (`npm i && npm i --prefix server && npm i --prefix client`).

### 2. Ortam değişkenlerini ayarlayın

`server/.env.example` dosyasını `server/.env` olarak kopyalayın ve
kendi değerlerinizle doldurun. Hangi değişkenin ne işe yaradığı için
[02 — Yapılandırma](02-yapilandirma.md)'ya bakın. En az şunlar
**zorunludur**, bunlar olmadan sunucu ayağa kalkmaz:

- `MONGODB_URI`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (rastgele, en az 64 karakter —
  `openssl rand -base64 64` ile üretebilirsiniz)
- `CLIENT_URL` (kendi alan adınız)

### 3. Derleyin ve başlatın

```bash
npm run build   # client bağımlılıklarını kurar + istemciyi derler
npm start       # build'i tekrar çalıştırır + server/src/server.js'i başlatır
```

`npm start` aslında `npm run build && node server/src/server.js`'dir —
yani ayrıca `npm run build` çalıştırmanıza gerek yoktur, `npm start`
zaten derleyip başlatır.

Üretimde bir process yöneticisi (systemd, pm2) ile çalıştırmanız,
sunucu yeniden başlarsa uygulamanın da kendiliğinden ayağa kalkmasını
sağlar. Bu depo bir systemd örneği içermez — kendi sunucu ortamınıza
göre kurmanız gerekir.

### 4. Kurulum sihirbazını açın

`http://sunucu-adresiniz:3001/install` (ya da `CLIENT_URL`) adresine
gidin ve Docker yolundaki "Kurulum sihirbazı" adımlarını izleyin —
mekanizma birebir aynıdır, Docker'a özgü değildir.

### 5. Testlerle doğrulayın

```bash
npm test
```

Bu, `server/test/*.test.js` ve `client/src/i18n/*.test.js` altındaki
birim testlerini çalıştırır. Tamamı geçmelidir — geçmiyorsa kurulum
adımlarından biri eksik/yanlış demektir, testleri geçirmeden üretime
almayın. (Ayrıca `npm run test:e2e` ile Playwright uçtan uca testleri de
mevcuttur, `npm run test:e2e:install` ile önce Chromium kurulmalıdır.)

## Geliştirme modunda çalıştırma

Üretim derlemesi yerine canlı yeniden yükleme ile çalıştırmak isterseniz:

```bash
npm run dev
```

Bu, istemci (Vite, `localhost:5173`) ve sunucuyu (`localhost:3001`)
eşzamanlı başlatır (`concurrently` ile).

## Kurulum sonrası doğrulama

### Sağlık kontrolü

```bash
node server/scripts/healthcheck.js
```

Şunları raporlar: MongoDB bağlantısı, zorunlu env değişkenlerinin
tanımlı/yeterli uzunlukta olup olmadığı (`MONGODB_URI`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `CLIENT_URL`), opsiyonel servislerin (Palace
casino, SMTP) yapılandırılıp yapılandırılmadığı, bekleyen migration
sayısı ve site ayarlarının tohumlanıp tohumlanmadığı. Çıkış kodu 0 ise
sağlıklı (yalnızca uyarı varsa da 0 döner), fail varsa 1 döner — bu, CI
veya izleme araçlarıyla da kullanılabilir. Docker imajının kendi
`HEALTHCHECK` direktifi ayrıca `GET /api/health`'i her 30 saniyede bir
kontrol eder (`Dockerfile`).

Kaynak: `server/scripts/healthcheck.js`, `server/src/health/checks.js`.

### Migration'lar

```bash
node server/scripts/migrate.js              # tüm bekleyenleri uygular
node server/scripts/migrate.js --to 0.3.0   # belirli bir sürüme kadar
```

İdempotenttir — tekrar çalıştırmak güvenlidir, zaten uygulanmış
migration'ları atlar. `healthcheck.js` bekleyen migration varsa bunu
uyarı olarak gösterir.

### Tohumlama

```bash
node server/scripts/seed.js
```

Site ayarlarının (`Setting` koleksiyonu) hiç yazılmamış olması
durumunda `healthcheck.js` bunu uyarı olarak gösterir ve bu komutu
önerir. Kurulum sihirbazından geçtiyseniz (`/install`) bu adım zaten
otomatik yapılmıştır, ayrıca çalıştırmanız gerekmez.

## Sık karşılaşılan kurulum sorunları

- **"MongoDB'ye bağlanılamıyor"** — `MONGODB_URI`'nin doğru olduğunu ve
  MongoDB sunucunuzun kabul ettiği IP listesine kurulum yaptığınız
  sunucunun IP'sini eklediğinizi kontrol edin. `node server/scripts/healthcheck.js`
  bunu ilk satırda gösterir.
- **"JWT_SECRET tanımsız" hatasıyla çöküyor** — `.env` dosyasının
  `server/` dizininde (elle kurulum) ya da compose'un `env_file` olarak
  okuduğu kök `.env`'de (Docker) olduğundan ve boş bırakılmış zorunlu
  alan kalmadığından emin olun.
- **`/install` "sistem zaten kurulmuş" diyor ama admin şifremi
  unuttum** — sihirbaz güvenlik nedeniyle mevcut bir `admin` rolündeki
  kullanıcı varken yeniden çalışmaz; parola sıfırlama akışını (uygulama
  içi "şifremi unuttum") ya da veritabanına doğrudan erişimi kullanın.
- **Casino oyunları oran çekemiyor** — bu, casino içerik sağlayıcısı
  (aggregator) yapılandırmasıyla ilgilidir, kurulumla değil. Bkz.
  [02 — Yapılandırma § Casino sağlayıcısı](02-yapilandirma.md).
