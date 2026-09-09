# Crypto Payment Provider — TRC20 USDT

## Overview

| Feature | Value |
|---------|-------|
| **Network** | TRON (TRC20) |
| **Supported Tokens** | USDT, USDC, TRX |
| **Commission** | 0 (gas fee only) |
| **Chargeback** | None |
| **Gambling License** | Not required |
| **Onboarding** | Instant |
| **Settlement** | Instant (blockchain confirmation) |

## Architecture

```
┌─────────────────────────────────────────────┐
│              Admin Panel                      │
│  - Payment enable/disable toggle              │
│  - Wallet address management                  │
│  - Currency conversion rate (USDT↔TRY)       │
│  - Network selection (Mainnet/Testnet)        │
│  - Auto-limit settings                        │
│  - Transaction monitoring                     │
│  - Pending approval/rejection                 │
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

## HD Wallet Structure

### BIP44 Derived Addresses

```
Seed Phrase (CRYPTO_SEED_PHRASE)
    │
    ├── m/44'/195'/0'/0/0  →  User #0 address
    ├── m/44'/195'/0'/0/1  →  User #1 address
    ├── m/44'/195'/0'/0/2  →  User #2 address
    └── ...
```

- **Coin Type:** 195 (TRX)
- **Address Format:** Base58Check (starts with T, 34 characters)
- **Security:** Seed phrase stored server-side only

### Admin Access and Custodial Model

**This is a custodial model.** Since the admin holds the seed phrase:
- Admin can derive any user's wallet address
- Admin can withdraw USDT from deposit addresses

```javascript
import { deriveDepositAddress } from '../services/cryptoService.js';

// Derive any user's address
const user5Address = deriveDepositAddress(5);   // User #5
const user100Address = deriveDepositAddress(100); // User #100
```

**How it works:**
1. `User.cryptoDepositIndex` is stored in DB (sequential: 0, 1, 2, ...)
2. Admin knows the index → derives address via `deriveDepositAddress(index)`
3. Balance can be queried via TronGrid public API

## Complete Workflows

### Deposit Flow

```
User clicks "Deposit"
        │
        ▼
GET /api/crypto/deposit-address
        │  Returns user-specific TRC20 address
        │  (HD wallet: m/44'/195'/0'/0/{index})
        │
        ▼
User sends USDT to this address
        │  (via TronLink, MetaMask, etc.)
        │
        ▼
POST /api/crypto/check-deposit
        │  Queries TronGrid API
        │  Checks for new incoming TXs
        │
        ▼
    ┌───USDT received?
    │       │
    │  NO → Return empty response
    │       │
    │  YES ↓
    │
    Amount < $100?
    │       │
    │  YES → AUTO-CREDIT TO BALANCE
    │       │  balance += tryAmount
    │       │  status: 'completed'
    │       │
    │  NO → SEND TO ADMIN APPROVAL
    │       │  status: 'pending_approval'
    │       │  balance unchanged
    │       │
    ▼
Balance appears in user account
```

**Deposit Statuses:**
| Status | Meaning |
|--------|---------|
| `credited` | Auto-approved, added to balance |
| `pending_approval` | Awaiting admin approval |

### Withdrawal Flow

```
User clicks "Withdraw" (enters address + amount)
        │
        ▼
POST /api/crypto/withdraw-request
        │
        ▼
    Address valid? (TRC20 format)
    │       │
    │  NO → Return error
    │       │
    │  YES ↓
    │
    Calculate withdrawable balance
    withdrawable = balance - locked (bonus wagering)
    │       │
    │       ▼
    ┌───withdrawable ≥ requested amount?
    │       │
    │  NO →
    │       │  Active bonus exists?
    │       │      │
    │       │  YES → Return 409 ACTIVE_BONUS_LOCK
    │       │         (Tell user to forfeit bonus)
    │       │      │
    │       │  NO → "Insufficient balance" error
    │       │
    │  YES ↓
    │
    Amount < $15?
    │       │
    │  YES → AUTO-PROCESS
    │       │  Send USDT from hot wallet to user
    │       │  Return txHash
    │       │  Deduct from balance
    │       │
    │  NO → SEND TO ADMIN APPROVAL
    │       │  status: 'pending'
    │       │  Deduct from balance (locked)
    │       │
    ▼
"Pending Withdrawals" appears in admin panel
        │
        ▼
    Admin approves/rejects
    │       │
    │  APPROVE → Send USDT from hot wallet
    │         Return txHash
    │         status: 'completed'
    │       │
    │  REJECT → Refund balance
    │           status: 'rejected'
```

**Withdrawal Statuses:**
| Status | Meaning |
|--------|---------|
| `pending` | Awaiting admin approval |
| `processing` | Transfer in progress |
| `completed` | Transfer completed, txHash available |
| `rejected` | Admin rejected, balance refunded |

### Bonus Forfeit Flow

```
User wants to withdraw but bonus is locked
        │
        ▼
Return 409 ACTIVE_BONUS_LOCK
{
  error: "ACTIVE_BONUS_LOCK",
  locked: 200,
  message: "200₺ bonus locked. Do you want to forfeit?"
}
        │
        ▼
User resends with confirmForfeit: true
        │
        ▼
    Forfeit BonusWagerings
    │  status: 'forfeited'
    │  balance -= lockedAmount
    │
    ▼
    Recalculate withdrawable
    withdrawable = balance - newLocked
    │
    ▼
    Withdrawal continues...
```

## Balance Calculation

### Models

```
user.balance (single pool)
    │
    ├── Real money (deposits, winnings)
    │
    └── Bonus money (locked by wagering)
            │
            └── BonusWagering.status: 'active'
                └── bonusAmount = locked amount
```

### Formulas

```javascript
// Locked amount (bonus wagering)
locked = sum(BonusWagering.bonusAmount WHERE status = 'active')

// Withdrawable balance
withdrawable = max(0, user.balance - locked)

// After forfeit
newBalance = user.balance - locked
newLocked = 0
newWithdrawable = newBalance
```

### Example

```
User: balance = 1000₺, active bonus wagering = 200₺
locked = 200
withdrawable = 800

User wants to withdraw 500₺:
  500 ≤ 800 → Allowed

User wants to withdraw 900₺:
  900 > 800 → Request bonus forfeit approval
  Forfeit: 200₺ bonus removed
  New balance: 800₺
  New withdrawable: 800₺
  900 > 800 → "Insufficient balance"
```

## Auto-Limits

### Deposit

| Amount | Status |
|--------|--------|
| < $100 | Auto-credited to balance |
| ≥ $100 | Requires admin approval |

### Withdrawal

| Amount | Status |
|--------|--------|
| < $15 | Auto-processed (hot wallet transfer) |
| ≥ $15 | Requires admin approval |

### Configuration

```javascript
// server/src/config/crypto.js
export const CRYPTO_SETTINGS = {
  deposit: {
    autoCreditLimit: 100,       // Admin panelinden değiştirilebilir
    requireApprovalAbove: 100,
  },
  withdraw: {
    autoProcessLimit: 15,       // Admin panelinden değiştirilebilir
    requireApprovalAbove: 15,
  },
  minWithdraw: 5,

  // Admin panelinden değiştirilebilir
  usdtTryRate: 1,               // 1 USDT = X TRY dönüşüm oranı
  network: 'mainnet',           // mainnet | shasta | nile
};
```

## Hot Wallet Transfer

### How It Works

```
Seed Phrase → HD Wallet → Private Key
        │
        ▼
Sign TRC20 Transfer
  - from: hot wallet address
  - to: user address
  - amount: USDT amount
  - contract: USDT TRC20
        │
        ▼
TronGrid API → Broadcast Transaction
        │
        ▼
Return txHash → Notify user
```

### Security

- Hot wallet private key stored in `.env`
- Only authorized endpoints can transfer
- Every transfer is logged
- Multi-sig recommended for large amounts

## Currency Conversion

### Supported Pairs

| Pair | Default Rate | Admin Panel |
|------|-------------|-------------|
| USDT_TRY | 1 | ✅ Değiştirilebilir |
| USDT_EUR | 0.92 | — |
| USDT_GBP | 0.79 | — |
| USDT_USD | 1 | — |

### Usage

```javascript
import { CRYPTO_SETTINGS } from '../config/crypto.js';

// Admin panelinden değiştirilen oran kullanılır
const rate = CRYPTO_SETTINGS.usdtTryRate;
const tryAmount = usdtAmount * rate;
```

> **Not:** Dönüşüm oranı `Modül Ayarları > Crypto Ödeme Ağ Geçidi`面板inden değiştirilebilir. Varsayılan değer `.env` dosyasındaki `USDT_TRY_RATE` değişkenidir.

## API Endpoints

### Deposit

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/crypto/deposit-address` | GET | Return user-specific address |
| `POST /api/crypto/check-deposit` | POST | Query TronGrid, credit balance |

### Withdrawal

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/crypto/withdraw-request` | POST | Create withdrawal request |
| `GET /api/crypto/withdraw-preview` | GET | Show withdrawable balance |

### Settings

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/crypto/settings` | GET | Return current settings |
| `PUT /api/admin/crypto/settings` | PUT | Update settings (network, rate, limits) |

## Testnet (Shasta)

### Configuration

```env
TRON_NETWORK=shasta    # .env dosyasından VARSAYILAN
```

> **Not:** Ağ seçimi artık `Modül Ayarları > Crypto Ödeme Ağ Geçidi`面板inden de değiştirilebilir. Admin panelinden yapılan değişiklikler `CRYPTO_SETTINGS.network` objesini günceller. Ancak **hot wallet private key** ve **seed phrase** ortam değişkenlerinden okunduğu için, testnet'ten mainnet'e geçiş sunucuyu yeniden başlatmayı gerektirir.

### Admin Panelinden Ağ Değişimi

| Ağ | Seçenek | Durum |
|----|---------|-------|
| Mainnet | `mainnet` | 🔴 Üretim |
| Shasta | `shasta` | 🟡 Testnet |
| Nile | `nile` | 🔵 Testnet |

### Testnet Info

| Feature | Value |
|---------|-------|
| **API** | `https://api.shasta.trongrid.io` |
| **USDT Contract** | `TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs` |
| **Faucet** | `https://shasta.tronex.io/join/getJoinPage` |
| **Explorer** | `https://shasta.tronscan.org` |

### Test Flow

1. Get USDT from faucet
2. Send to deposit address
3. Verify with `check-deposit`
4. Check withdrawable balance
5. Create withdrawal request

## Security

### Seed Phrase

- Stored in `.env` file only
- Not committed to git (in `.gitignore`)
- Set as environment variable in production

### Address Validation

```javascript
// TRC20 address format: starts with T, 34 characters
const isValid = /^T[A-Za-z0-9]{33}$/.test(address);
```

### Rate Limiting

- TronGrid API: 10 second timeout
- IP rate limiting available

## Environment Variables

```env
CRYPTO_SEED_PHRASE=your mnemonic phrase here
USDT_TRY_RATE=1              # Varsayılan dönüşüm oranı (admin panelinden değiştirilebilir)
TRON_NETWORK=mainnet          # Varsayılan ağ (admin panelinden değiştirilebilir)
HOT_WALLET_PRIVATE_KEY=optional_separate_hot_wallet_key
```

> **Not:** `USDT_TRY_RATE` ve `TRON_NETWORK` artık admin panelinden değiştirilebilir. `.env` değerleri sadece başlangıç (default) olarak kullanılır.

## Known Limitations

1. **Single Network:** Only TRON (TRC20) supported
2. **Rate Persistence:** Dönüşüm oranı ve ağ seçimi in-memory saklanır, sunucu restart'ta `.env` değerlerine döner
3. **No Multi-sig:** Additional security needed for large amounts

## Related Files

| File | Description |
|------|-------------|
| `server/src/config/crypto.js` | Settings and limits |
| `server/src/services/cryptoService.js` | HD wallet and TronGrid API |
| `server/src/routes/crypto.js` | API endpoints |
| `server/src/models/CryptoDeposit.js` | Deposit model |
| `server/src/models/Transaction.js` | Transaction history |
| `server/src/services/wagering.js` | Bonus/locked balance calculation |
| `server/test/crypto.test.js` | Unit tests |
| `server/scripts/test-crypto-testnet.mjs` | Testnet test script |
