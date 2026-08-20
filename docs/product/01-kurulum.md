# Kurulum

> **Şu an geçerli olan yol budur.** Tek-komutluk Docker kurulumu ve
> grafik kurulum sihirbazı planlanıyor ama henüz yapılmadı — bu belge
> güncellendiğinde burada da not düşülecek.

## Gereksinimler

- Node.js 20 veya üzeri
- MongoDB 6 veya üzeri (kendi sunucunuzda ya da MongoDB Atlas gibi
  yönetilen bir servis)
- Bir VPS veya sunucu — **paylaşımlı hosting yeterli değildir**. Canlı
  bahis akışı, WebSocket bağlantıları ve MongoDB birlikte çalışırken
  4 GB altındaki bellek sıkışır. Asgari önerilen: 4 vCPU / 8 GB RAM.

## Adımlar

### 1. Bağımlılıkları kurun

```bash
npm run install:all
```

Bu komut kök, `server/` ve `client/` dizinlerindeki tüm bağımlılıkları
sırayla kurar.

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
npm run build   # istemciyi derler
npm start       # derlenmiş istemciyi + API sunucusunu tek process'te başlatır
```

Üretimde bir process yöneticisi (systemd, pm2) ile çalıştırmanız,
sunucu yeniden başlarsa uygulamanın da kendiliğinden ayağa kalkmasını
sağlar. Bu depo bir systemd örneği içermez — kendi sunucu ortamınıza
göre kurmanız gerekir.

### 4. Kurulumu doğrulayın

```bash
npm test
```

66'dan fazla birim testinin tamamı geçmelidir. Geçmiyorsa, kurulum
adımlarından biri eksik/yanlış demektir — testleri geçirmeden üretime
almayın.

## Geliştirme modunda çalıştırma

Üretim derlemesi yerine canlı yeniden yükleme ile çalıştırmak isterseniz:

```bash
npm run dev
```

Bu, istemci (Vite, `localhost:5173`) ve sunucuyu (`localhost:3001`)
eşzamanlı başlatır.

## Sık karşılaşılan kurulum sorunları

- **"MongoDB'ye bağlanılamıyor"** — `MONGODB_URI`'nin doğru olduğunu ve
  MongoDB sunucunuzun kabul ettiği IP listesine kurulum yaptığınız
  sunucunun IP'sini eklediğinizi kontrol edin.
- **"JWT_SECRET tanımsız" hatasıyla çöküyor** — `.env` dosyasının
  `server/` dizininde olduğundan ve boş bırakılmış zorunlu alan
  kalmadığından emin olun.
- **Casino oyunları oran çekemiyor** — bu, casino içerik sağlayıcısı
  (aggregator) yapılandırmasıyla ilgilidir, kurulumla değil. Bkz.
  [02 — Yapılandırma § Casino sağlayıcısı](02-yapilandirma.md).
