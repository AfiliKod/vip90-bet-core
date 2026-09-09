import { createHash } from 'crypto';
import { HDNodeWallet, Mnemonic, Wallet } from 'ethers';
import TronWebPkg from 'tronweb';
const { TronWeb } = TronWebPkg;

// CRYPTO_SETTINGS — admin panelinden değiştirilen ayarları kullan
// ESM hoisting: config/crypto.js bu dosyadan bağımsız, circular risk yok
import { CRYPTO_SETTINGS } from '../config/crypto.js';

// Network konfigürasyonu — ESM hoisting sorunu nedeniyle lazy getter
const NETWORKS = {
  mainnet: {
    fullHost: 'https://api.trongrid.io',
    usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    chainTag: '0x',
  },
  shasta: {
    fullHost: 'https://api.shasta.trongrid.io',
    usdtContract: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs',
    chainTag: '0xfb5a',
  },
  nile: {
    fullHost: 'https://api.nile.trongrid.io',
    usdtContract: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    chainTag: '0xb6f1',
  },
};

// Lazy getter — .env yüklendikten sonra çağrılmalı
// CRYPTO_SETTINGS.network admin panelinden değiştirilebilir
function getNetworkConfig() {
  const network = (CRYPTO_SETTINGS.network || process.env.TRON_NETWORK || 'mainnet').toLowerCase();
  return {
    network,
    tronGrid: NETWORKS[network]?.fullHost || NETWORKS.mainnet.fullHost,
    usdtContract: NETWORKS[network]?.usdtContract || NETWORKS.mainnet.usdtContract,
    chainTag: NETWORKS[network]?.chainTag || '0x',
  };
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buf) {
  let n = BigInt('0x' + buf.toString('hex'));
  let s = '';
  while (n > 0n) { const r = Number(n % 58n); s = B58[r] + s; n = n / 58n; }
  for (const b of buf) { if (b === 0) s = '1' + s; else break; }
  return s;
}

function base58Decode(str) {
  let n = 0n;
  for (const c of str) {
    const idx = B58.indexOf(c);
    if (idx < 0) throw new Error(`Geçersiz base58 karakteri: ${c}`);
    n = n * 58n + BigInt(idx);
  }
  const hex = n.toString(16).padStart(2, '0');
  const buf = Buffer.from(hex, 'hex');
  // Leading zeros (base58 '1' = zero byte)
  let zeros = 0;
  for (const c of str) { if (c === '1') zeros++; else break; }
  return Buffer.concat([Buffer.alloc(zeros), buf]);
}

// TRON base58 adres → 41-prefixed hex (0x41...)
function tronToHex(tronAddr) {
  const decoded = base58Decode(tronAddr);
  // First 21 bytes: 1 byte version (0x41) + 20 bytes address
  return decoded.slice(0, 21).toString('hex');
}

// Hex address (0x...) → TRON base58
function ethToTron(ethAddr) {
  const raw = Buffer.from('41' + ethAddr.slice(2).toLowerCase(), 'hex');
  const h1  = createHash('sha256').update(raw).digest();
  const h2  = createHash('sha256').update(h1).digest();
  return base58Encode(Buffer.concat([raw, h2.slice(0, 4)]));
}

// BIP44 m/44'/195'/0'/0/{index} — 195 = TRX coin type
export function deriveDepositAddress(index) {
  const phrase = process.env.CRYPTO_SEED_PHRASE;
  if (!phrase) throw new Error('CRYPTO_SEED_PHRASE tanımlı değil');
  const mn   = Mnemonic.fromPhrase(phrase);
  const node = HDNodeWallet.fromMnemonic(mn, `m/44'/195'/0'/0/${index}`);
  return ethToTron(node.address);
}

// TronGrid — kullanıcının adresine gelen USDT TRC20 işlemlerini getir
// Shasta'da /transactions/trc20 endpoint'i çalışmadığı için fallback olarak
// genel transaction listesinden transferleri filtreler
export async function fetchIncomingUSDT(tronAddress, sinceMs = 0) {
  const cfg = getNetworkConfig();

  // 1. Deneme: TRC20 transactions endpoint
  try {
    const url = `${cfg.tronGrid}/v1/accounts/${tronAddress}/transactions/trc20`
      + `?limit=20&contract_address=${cfg.usdtContract}&min_timestamp=${sinceMs}&order_by=block_timestamp,asc`;
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      const json = await resp.json();
      return (json.data || []).filter(tx =>
        tx.to?.toLowerCase() === tronAddress.toLowerCase() && tx.type === 'Transfer'
      );
    }
  } catch { /* fallback'e geç */ }

  // 2. Fallback: Genel transaction listesinden smart contract transferleri
  const url = `${cfg.tronGrid}/v1/accounts/${tronAddress}/transactions`
    + `?limit=20&min_timestamp=${sinceMs}&only_confirmed=true&order_by=block_timestamp,asc`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`TronGrid hata: ${resp.status}`);
  const json = await resp.json();

  // TRC20 transfer contract'larını filtrele (to == tronAddress)
  const results = [];
  for (const tx of (json.data || [])) {
    const contract = tx.raw_data?.contract?.[0];
    if (contract?.type !== 'TriggerSmartContract') continue;
    const val = contract.parameter?.value;
    if (!val || val.contract_address !== cfg.usdtContract) continue;
    // data: a9059cbb + to(32 bytes) + amount(32 bytes)
    const data = val.data || '';
    if (!data.startsWith('a9059cbb')) continue;
    const toHex = '41' + data.slice(32, 72);
    // base58 encode to check
    const raw = Buffer.from(toHex, 'hex');
    const h1 = createHash('sha256').update(raw).digest();
    const h2 = createHash('sha256').update(h1).digest();
    const toBase58 = base58Encode(Buffer.concat([raw, h2.slice(0, 4)]));
    if (toBase58.toLowerCase() !== tronAddress.toLowerCase()) continue;
    const amount = parseInt(data.slice(72, 136), 16);
    results.push({
      transaction_id: tx.txID,
      to: tronAddress,
      value: String(amount),
      type: 'Transfer',
      block_timestamp: tx.raw_data?.timestamp || 0,
    });
  }
  return results;
}

// ── Hot Wallet Transfer ──────────────────────────────────────────────────────

/**
 * Seed phrase'ten hot wallet private key türetir.
 * HOT_WALLET_PRIVATE_KEY tanımlıysa onu kullanır, değilse seed phrase'ten türetir.
 */
export function getHotWalletSigner() {
  const pk = process.env.HOT_WALLET_PRIVATE_KEY;
  if (pk) {
    return new Wallet(pk);
  }
  const phrase = process.env.CRYPTO_SEED_PHRASE;
  if (!phrase) throw new Error('CRYPTO_SEED_PHRASE veya HOT_WALLET_PRIVATE_KEY tanımlı değil');
  const mn = Mnemonic.fromPhrase(phrase);
  // Hot wallet: index 0 (ana cüzdan)
  const node = HDNodeWallet.fromMnemonic(mn, "m/44'/195'/0'/0/0");
  return new Wallet(node.privateKey);
}

/**
 * Hot wallet'ın Tron adresini döndürür.
 */
export function getHotWalletAddress() {
  const signer = getHotWalletSigner();
  return ethToTron(signer.address);
}

/**
 * Hot wallet'ın USDT bakiyesini sorgular.
 */
export async function getHotWalletBalance() {
  const cfg = getNetworkConfig();
  const address = getHotWalletAddress();
  const url = `${cfg.tronGrid}/v1/accounts/${address}`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`TronGrid hata: ${resp.status}`);
  const json = await resp.json();
  const account = json.data?.[0];
  if (!account) throw new Error('Hesap bulunamadı');
  const tokens = account.trc20 || [];
  // trc20 [{contractAddress: balance}] formatında olabilir
  let usdtBalance = 0;
  for (const entry of tokens) {
    const bal = entry[cfg.usdtContract];
    if (bal !== undefined) { usdtBalance = Number(bal) / 1_000_000; break; }
  }
  return {
    address,
    usdt: usdtBalance,
  };
}

/**
 * Herhangi bir TRON adresinin USDT + TRX bakiyesini sorgular.
 * @param {string} address - TRON base58 adres
 * @returns {Promise<{address: string, usdt: number, trx: number}>}
 */
export async function getWalletBalance(address) {
  const cfg = getNetworkConfig();
  const url = `${cfg.tronGrid}/v1/accounts/${address}`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`TronGrid hata: ${resp.status}`);
  const json = await resp.json();
  const account = json.data?.[0];
  if (!account) return { address, usdt: 0, trx: 0 };
  const tokens = account.trc20 || [];
  let usdtBalance = 0;
  for (const entry of tokens) {
    const bal = entry[cfg.usdtContract];
    if (bal !== undefined) { usdtBalance = Number(bal) / 1_000_000; break; }
  }
  const trxBalance = (account.balance || 0) / 1_000_000;
  return { address, usdt: usdtBalance, trx: trxBalance };
}

/**
 * TRC20 USDT transferi imzalar ve broadcast eder.
 * TronWeb kullanarak doğru TRON imzası atar.
 * @param {string} toAddress - Hedef TRC20 adresi (base58)
 * @param {number} usdtAmount - Gönderilecek USDT miktarı
 * @returns {Promise<{txHash: string, success: boolean, error?: string}>}
 */
export async function transferUSDT(toAddress, usdtAmount) {
  const cfg = getNetworkConfig();
  const pk = process.env.HOT_WALLET_PRIVATE_KEY;
  if (!pk) {
    // Seed phrase'ten private key türet
    const signer = getHotWalletSigner();
    return _transferWithEthers(signer, toAddress, usdtAmount, cfg);
  }

  // TronWeb ile transfer (daha güvenilir imza)
  try {
    const tronWeb = new TronWeb({
      fullHost: cfg.tronGrid,
      privateKey: pk,
    });

    const fromAddress = getHotWalletAddress();
    const amountRaw = Math.round(usdtAmount * 1_000_000);

    // Contract instance
    const contract = await tronWeb.contract().at(cfg.usdtContract);

    // Transfer
    const tx = await contract.transfer(toAddress, amountRaw).send({
      feeLimit: 100_000_000,
      from: fromAddress,
    });

    console.log(`[crypto] transferUSDT: ${usdtAmount} USDT → ${toAddress} (tx: ${tx})`);
    return { success: true, txHash: tx };
  } catch (err) {
    console.error('[crypto] transferUSDT error:', err.message);
    return { success: false, error: err.message };
  }
}

// Seed phrase ile transfer (HOT_WALLET_PRIVATE_KEY yoksa)
async function _transferWithEthers(signer, toAddress, usdtAmount, cfg) {
  const fromAddress = ethToTron(signer.address);
  const amountRaw = BigInt(Math.round(usdtAmount * 1_000_000));

  const balance = await getHotWalletBalance();
  if (balance.usdt < usdtAmount) {
    return { success: false, error: `Yetersiz hot wallet bakiyesi: ${balance.usdt} USDT` };
  }

  const selector = 'a9059cbb';
  const addrHex = tronToHex(toAddress).slice(2);
  const amountHex = amountRaw.toString(16).padStart(64, '0');
  const data = selector + addrHex.padStart(64, '0') + amountHex;

  try {
    const createResp = await fetch(`${cfg.tronGrid}/wallet/triggersmartcontract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visible: true,
        owner_address: fromAddress,
        contract_address: cfg.usdtContract,
        data,
        fee_limit: 100_000_000,
        call_value: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!createResp.ok) {
      return { success: false, error: `Create tx failed: ${createResp.status} ${await createResp.text()}` };
    }

    const createData = await createResp.json();
    const txId = createData.txID || createData.txid || createData.transaction?.txID;
    if (!txId) {
      return { success: false, error: `No txID: ${JSON.stringify(createData).slice(0, 200)}` };
    }

    const txToSign = createData.transaction || createData;
    const rawHex = txToSign.raw_data_hex;
    const rawBytes = Buffer.from(rawHex, 'hex');
    const { keccak256 } = await import('ethers');
    const digest = keccak256(rawBytes);
    const sig = signer.signingKey.sign(digest);
    const signature = sig.r.slice(2) + sig.s.slice(2) + sig.v.toString(16).padStart(2, '0');

    const broadResp = await fetch(`${cfg.tronGrid}/wallet/broadcasttransaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_data: txToSign.raw_data,
        raw_data_hex: txToSign.raw_data_hex,
        signatures: [signature],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!broadResp.ok) {
      return { success: false, error: `Broadcast failed: ${broadResp.status} ${await broadResp.text()}` };
    }

    const broadData = await broadResp.json();
    if (broadData.result?.result === false) {
      return { success: false, error: `Broadcast rejected: ${JSON.stringify(broadData)}` };
    }

    const txHash = broadData.txid || txId;
    console.log(`[crypto] transferUSDT: ${usdtAmount} USDT → ${toAddress} (tx: ${txHash})`);
    return { success: true, txHash };

  } catch (err) {
    console.error('[crypto] transferUSDT error:', err.message);
    return { success: false, error: err.message };
  }
}
