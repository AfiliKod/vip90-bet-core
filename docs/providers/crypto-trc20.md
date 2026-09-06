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
│  - Pending onay/reddet                         │
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
│ HD     │   │TronGrid│   │Hot     │
│Wallet  │   │  API   │   │Wallet  │
│(Deposit│   │(Check) │   │(Withdraw)│
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

### Admin Erişimi ve Custodial Model

**Bu model custodial'dır (emanetçi).** Seed phrase adminde olduğu için:
- Admin tüm kullanıcıların cüzdan adreslerini türetebilir
- Admin deposit adreslerinden USDT çekebilir

```javascript
import { deriveDepositAddress } from '../services/cryptoService.js';

// Herhangi bir kullanıcının adresini türet
const user5Address = deriveDepositAddress(5);   // Kullanıcı #5
const user100Address = deriveDepositAddress(100); // Kullanıcı #100
```

**Nasıl çalışır:**
1. `User.cryptoDepositIndex` DB'de saklanır (sıralı: 0, 1, 2, ...)
2. Admin bu index'i bilir → `deriveDepositAddress(index)` ile adresi türetir
3. TronGrid public API ile bakiye sorgulanabilir

## Tam İş Akışları

### Deposit (Para Yatırma) İş Akışı

```
Kullanıcı "Para Yatır" der
        │
        ▼
GET /api/crypto/deposit-address
        │  Kullanıcıya özel TRC20 adresi döndür
        │  (HD wallet: m/44'/195'/0'/0/{index})
        │
        ▼
Kullanıcı USDT'yi bu adrese gönderir
        │  (TronLink, MetaMask vb.)
        │
        ▼
POST /api/crypto/check-deposit
        │  TronGrid API sorgulanır
        │  Yeni gelen TX'ler kontrol edilir
        │
        ▼
    ┌───USDT geldi mi?
    │       │
    │  HAYIR → Boş response dön
    │       │
    │  EVET ↓
    │
    Miktar < $100 mı?
    │       │
    │  EVET → OTOMATİK HESABA EKLE
    │       │  balance += tryAmount
    │       │  status: 'completed'
    │       │
    │  HAYIR → ADMIN ONAYINA GÖNDER
    │       │  status: 'pending_approval'
    │       │  balance değişmez
    │       │
    ▼
Kullanıcı hesabında bakiye görünür
```

**Deposit Durumları:**
| Durum | Anlamı |
|-------|--------|
| `credited` | Otomatik onaylandı, bakiyeye eklendi |
| `pending_approval` | Admin onayı bekliyor |

### Withdrawal (Para Çekme) İş Akışı

```
Kullanıcı "Çek" der (adres + miktar girer)
        │
        ▼
POST /api/crypto/withdraw-request
        │
        ▼
    Adres geçerli mi? (TRC20 format)
    │       │
    │  HAYIR → HATA dön
    │       │
    │  EVET ↓
    │
    Withdrawable bakiye hesapla
    withdrawable = balance - locked (bonus wagering)
    │       │
    │       ▼
    ┌───withdrawable ≥ istenen miktar?
    │       │
    │  HAYIR →
    │       │  Aktif bonus var mı?
    │       │      │
    │       │  EVET → 409 ACTIVE_BONUS_LOCK dön
    │       │         (Kullanıcıya "bonusunu forfeit et" de)
    │       │      │
    │       │  HAYIR → "Yetersiz bakiye" hatası
    │       │
    │  EVET ↓
    │
    Miktar < $15 mı?
    │       │
    │  EVET → OTOMATİK İŞLE
    │       │  Hot wallet'tan kullanıcıya USDT gönder
    │       │  txHash dön
    │       │  balance - miktar
    │       │
    │  HAYIR → ADMIN ONAYINA GÖNDER
    │       │  status: 'pending'
    │       │  balance - miktar (kilitli)
    │       │
    ▼
Admin panelinde "Pending Çekimler" görünür
        │
        ▼
    Admin onaylar/reddeder
    │       │
    │  ONAY → Hot wallet'tan USDT gönder
    │         txHash dön
    │         status: 'completed'
    │       │
    │  REDDET → Bakiyeyi iade et
    │           status: 'rejected'
```

**Withdrawal Durumları:**
| Durum | Anlamı |
|-------|--------|
| `pending` | Admin onayı bekliyor |
| `processing` | Transfer yapılıyor |
| `completed` | Transfer tamamlandı, txHash var |
| `rejected` | Admin reddetti, bakiye iade edildi |

### Bonus Forfeit Akışı

```
Kullanıcı çekim yapmak istiyor ama bonus kilitli
        │
        ▼
409 ACTIVE_BONUS_LOCK dön
{
  error: "ACTIVE_BONUS_LOCK",
  locked: 200,
  message: "200₺ bonus kilitli. Forfeit etmek ister misiniz?"
}
        │
        ▼
Kullanıcı confirmForfeit: true ile tekrar gönderir
        │
        ▼
    BonusWagering'leri forfeit et
    │  status: 'forfeited'
    │  balance -= lockedAmount
    │
    ▼
    Withdrawable yeniden hesapla
    withdrawable = balance - yeniLocked
    │
    ▼
    Çekim devam eder...
```

## Bakiye Hesaplama

### Modeller

```
user.balance (tek havuz)
    │
    ├── Gerçek para (deposit, kazanç)
    │
    └── Bonus para (wagering ile kilitli)
            │
            └── BonusWagering.status: 'active'
                └── bonusAmount = kilitli miktar
```

### Formüller

```javascript
// Kilitli miktar (bonus wagering)
locked = sum(BonusWagering.bonusAmount WHERE status = 'active')

// Çekilebilir bakiye
withdrawable = max(0, user.balance - locked)

// Forfeit sonrası
newBalance = user.balance - locked
newLocked = 0
newWithdrawable = newBalance
```

### Example

```
Kullanıcı: balance = 1000₺, aktif bonus wagering = 200₺
locked = 200
withdrawable = 800

Kullanıcı 500₺ çekmek istiyor:
  500 ≤ 800 → İzin ver

Kullanıcı 900₺ çekmek istiyor:
  900 > 800 → Bonus forfeit onayı iste
  Forfeit: 200₺ bonus silinir
  Yeni balance: 800₺
  Yeni withdrawable: 800₺
  900 > 800 → "Yetersiz bakiye"
```

## Otomatik Limitler

### Deposit (Yatırma)

| Miktar | Durum |
|--------|-------|
| < $100 | Otomatik hesaba eklenir |
| ≥ $100 | Admin onayı bekler |

### Withdrawal (Çekim)

| Miktar | Durum |
|--------|-------|
| < $15 | Otomatik işlenir (hot wallet'tan transfer) |
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

## Hot Wallet Transfer

### Nasıl Çalışır

```
Seed Phrase → HD Wallet → Özel Anahtar
        │
        ▼
TRC20 Transfer İmzala
  - from: hot wallet address
  - to: kullanıcı adresi
  - amount: USDT miktarı
  - contract: USDT TRC20
        │
        ▼
TronGrid API → Broadcast Transaction
        │
        ▼
txHash dön → Kullanıcıya bildir
```

### Güvenlik

- Hot wallet private key'i `.env`'de saklanır
- Sadece yetkili endpoint'ler transfer yapabilir
- Her transfer loglanır
- Multi-sig önerilir (yüksek miktarlar için)

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
| `GET /api/crypto/withdraw-preview` | GET | Çekilebilir bakiyeyi göster |

### Settings

| Endpoint | Yöntem | Açıklama |
|----------|--------|----------|
| `GET /api/crypto/settings` | GET | Mevcut ayarları döndür |

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
4. Çekilebilir bakiyeyi kontrol et
5. Withdrawal talebi oluştur

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

## Env Değişkenleri

```env
CRYPTO_SEED_PHRASE=your mnemonic phrase here
USDT_TRY_RATE=1
TRON_NETWORK=mainnet  # veya shasta/nile
HOT_WALLET_PRIVATE_KEY=optional_separate_hot_wallet_key
```

## Bilinen Sınırlamalar

1. **Tek Ağ:** Sadece TRON (TRC20) destekleniyor
2. **Fiyat Sabit:** USDT sabit coin, ama oranlar admin tarafından ayarlanmalı
3. **Multi-sig Yok:** Yüksek miktarlar için ek güvenlik gerekli

## İlgili Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `server/src/config/crypto.js` | Ayarlar ve limitler |
| `server/src/services/cryptoService.js` | HD wallet ve TronGrid API |
| `server/src/routes/crypto.js` | API endpointleri |
| `server/src/models/CryptoDeposit.js` | Deposit modeli |
| `server/src/models/Transaction.js` | İşlem geçmişi |
| `server/src/services/wagering.js` | Bonus/kilitli bakiye hesaplama |
| `server/test/crypto.test.js` | Unit testler |
| `server/scripts/test-crypto-testnet.mjs` | Testnet test scripti |
