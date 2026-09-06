# Crypto Payment Provider — TRC20 USDT

## Genel Bakış

| Özellik | Değer |
|---------|-------|
| **Ağ** | TRON (TRC20) |
| **Desteklenen Tokenlar** | USDT, USDC, TRX |
| **Komisyon** | 0 (sadece gas ücreti) |
| **Chargeback** | Yok |
| **Gambling Lisansı** | Gerekmez |
| **Onboarding** | Anında |
| **Settlement** | Anında (blockchain onayı) |

## Mimari

```
┌─────────────────────────────────────────────┐
│              Admin Panel                      │
│  - Ödeme açma/kapama toggle                   │
│  - Cüzdan adresi yönetimi                     │
│  - Currency dönüşüm oranları                  │
│  - Otomatik limit ayarları                    │
│  - Transaction monitoring                     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Crypto Payment Service               │
│  server/src/config/crypto.js                 │
│  server/src/services/cryptoService.js        │
│  server/src/routes/crypto.js                 │
└──────────────────┬──────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐   ┌────────┐   ┌────────┐
│ HD     │   │TronGrid│   │Manual  │
│Wallet  │   │  API   │   │Withdraw│
│(Deposit│   │(Check) │   │(Admin) │
└────────┘   └────────┘   └────────┘
```

## HD Wallet Yapısı

### BIP44 Derived Addresses

```
Seed Phrase (CRYPTO_SEED_PHRASE)
    │
    ├── m/44'/195'/0'/0/0  →  Kullanıcı #0 adresi
    ├── m/44'/195'/0'/0/1  →  Kullanıcı #1 adresi
    ├── m/44'/195'/0'/0/2  →  Kullanıcı #2 adresi
    └── ...
```

- **Coin Type:** 195 (TRX)
- **Adres Formatı:** Base58Check (T ile başlar, 34 karakter)
- **Güvenlik:** Seed phrase sadece sunucuda saklanır

### Admin Erişimi

Admin aynı seed phrase'ten herhangi bir kullanıcının adresini türetebilir:

```javascript
import { deriveDepositAddress } from '../services/cryptoService.js';

// Kullanıcı #5'in adresi
const user5Address = deriveDepositAddress(5);
```

## API Endpointler

### Deposit

| Endpoint | Yöntem | Açıklama |
|----------|--------|----------|
| `GET /api/crypto/deposit-address` | GET | Kullanıcıya özel adres döndür |
| `POST /api/crypto/check-deposit` | POST | TronGrid sorgula, bakiye ekle |

### Withdrawal

| Endpoint | Yöntem | Açıklama |
|----------|--------|----------|
| `POST /api/crypto/withdraw-request` | POST | Çekim talebi oluştur |

### Settings

| Endpoint | Yöntem | Açıklama |
|----------|--------|----------|
| `GET /api/crypto/settings` | GET | Mevcut ayarları döndür |

## Otomatik Limitler

### Deposit (Yatırma)

| Miktar | Durum |
|--------|-------|
| < $100 | Otomatik hesaba eklenir |
| ≥ $100 | Admin onayı bekler |

### Withdrawal (Çekim)

| Miktar | Durum |
|--------|-------|
| < $15 | Otomatik işlenir |
| ≥ $15 | Admin onayı bekler |

### Configuration

```javascript
// server/src/config/crypto.js
export const CRYPTO_SETTINGS = {
  deposit: {
    autoCreditLimit: 100,
    requireApprovalAbove: 100,
  },
  withdraw: {
    autoProcessLimit: 15,
    requireApprovalAbove: 15,
  },
  minWithdraw: 5,
};
```

## Currency Dönüşüm

### Desteklenen Çiftler

| Çift | Varsayılan Oran |
|------|-----------------|
| USDT_TRY | 1 |
| USDT_EUR | 0.92 |
| USDT_GBP | 0.79 |
| USDT_USD | 1 |

### Kullanım

```javascript
import { CURRENCY_RATES } from '../config/crypto.js';

const rate = CURRENCY_RATES.USDT_TRY;
const tryAmount = usdtAmount * rate;
```

## Testnet (Shasta)

### Konfigürasyon

```env
TRON_NETWORK=shasta
```

### Testnet Bilgileri

| Özellik | Değer |
|---------|-------|
| **API** | `https://api.shasta.trongrid.io` |
| **USDT Contract** | `TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs` |
| **Faucet** | `https://shasta.tronex.io/join/getJoinPage` |
| **Explorer** | `https://shasta.tronscan.org` |

### Test Akışı

1. Faucet'ten USDT al
2. Deposit adresine gönder
3. `check-deposit` ile doğrula
4. Withdrawal talebi oluştur

## Güvenlik

### Seed Phrase

- Sadece `.env` dosyasında saklanır
- Git'e commit edilmez (`.gitignore`'da)
- Production'da environment variable olarak girilir

### Adres Doğrulama

```javascript
// TRC20 adres formatı: T ile başlar, 34 karakter
const isValid = /^T[A-Za-z0-9]{33}$/.test(address);
```

### Rate Limiting

- TronGrid API: 10 saniye timeout
- IP rate limiting mevcut

## Production Hazırlık

### Yapılması Gerekenler

1. **Hot Wallet:** Çekimler için hot wallet private key'i gerekli
2. **Multi-sig:** Yüksek miktarlar için multi-imza önerilir
3. **Monitoring:** Blockchain izleme servisi
4. **Alarm:** Anormal aktivite için alarm sistemi

### Env Değişkenleri

```env
CRYPTO_SEED_PHRASE=your mnemonic phrase here
USDT_TRY_RATE=1
TRON_NETWORK=mainnet  # veya shasta/nile
```

## Bilinen Sınırlamalar

1. **Hot Wallet Yok:** Şu an sadece deposit çalışıyor, çekim için admin onayı gerekiyor
2. **Tek Ağ:** Sadece TRON (TRC20) destekleniyor
3. **Manuel Çekim:** Gerçek transfer henüz implemente edilmedi
4. **Fiyat Sabit:** USDT sabit coin olduğu için kur riski yok, ama oranlar admin tarafından ayarlanmalı

## İlgili Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `server/src/config/crypto.js` | Ayarlar ve limitler |
| `server/src/services/cryptoService.js` | HD wallet ve TronGrid API |
| `server/src/routes/crypto.js` | API endpointleri |
| `server/src/models/CryptoDeposit.js` | Deposit modeli |
| `server/test/crypto.test.js` | Unit testler (18 test) |
| `server/scripts/test-crypto-testnet.mjs` | Testnet test scripti |
