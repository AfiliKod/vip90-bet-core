import { createHash } from 'crypto';
import { HDNodeWallet, Mnemonic, Wallet } from 'ethers';

// Network konfigürasyonu (mainnet / shasta / nile)
const NETWORK = (process.env.TRON_NETWORK || 'mainnet').toLowerCase();

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

const TRONGRID   = NETWORKS[NETWORK]?.fullHost || NETWORKS.mainnet.fullHost;
const USDT_TRC20 = NETWORKS[NETWORK]?.usdtContract || NETWORKS.mainnet.usdtContract;
const CHAIN_TAG  = NETWORKS[NETWORK]?.chainTag || '0x';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buf) {
  let n = BigInt('0x' + buf.toString('hex'));
  let s = '';
  while (n > 0n) { const r = Number(n % 58n); s = B58[r] + s; n = n / 58n; }
  for (const b of buf) { if (b === 0) s = '1' + s; else break; }
  return s;
}

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
export async function fetchIncomingUSDT(tronAddress, sinceMs = 0) {
  const url = `${TRONGRID}/v1/accounts/${tronAddress}/transactions/trc20`
    + `?limit=20&contract_address=${USDT_TRC20}&min_timestamp=${sinceMs}&order_by=block_timestamp,asc`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`TronGrid hata: ${resp.status}`);
  const json = await resp.json();
  // Yalnızca bu adrese gelen (to == tronAddress) TX'ler
  return (json.data || []).filter(tx =>
    tx.to?.toLowerCase() === tronAddress.toLowerCase() && tx.type === 'Transfer'
  );
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
  const address = getHotWalletAddress();
  const url = `${TRONGRID}/v1/accounts/${address}/trc20`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`TronGrid hata: ${resp.status}`);
  const json = await resp.json();
  const tokens = json.data || [];
  const usdtToken = tokens.find(t => t.contract_address === USDT_TRC20);
  return {
    address,
    usdt: usdtToken ? Number(usdtToken.balance) / 1_000_000 : 0,
  };
}

/**
 * TRC20 USDT transferi imzalar ve broadcast eder.
 * @param {string} toAddress - Hedef TRC20 adresi
 * @param {number} usdtAmount - Gönderilecek USDT miktarı
 * @returns {Promise<{txHash: string, success: boolean, error?: string}>}
 */
export async function transferUSDT(toAddress, usdtAmount) {
  const signer = getHotWalletSigner();
  const fromAddress = ethToTron(signer.address);
  const amountRaw = BigInt(Math.round(usdtAmount * 1_000_000));

  // 1. Hot wallet'ın bakiyesini kontrol et
  const balance = await getHotWalletBalance();
  if (balance.usdt < usdtAmount) {
    return { success: false, error: `Yetersiz hot wallet bakiyesi: ${balance.usdt} USDT` };
  }

  // 2. TRC20 transfer parametrelerini oluştur
  // function transfer(address to, uint256 amount) → 0xa9059cbb
  const toHex = '000000000000000000000000' + toAddress.slice(2).toLowerCase();
  const amountHex = amountRaw.toString(16).padStart(64, '0');
  const data = '0xa9059cbb' + toHex + amountHex;

  // 3. Trigger smart contract (TRON'a özgü method)
  const contractAddr = USDT_TRC20;

  try {
    // a) TriggerContractSchema oluştur
    const triggerBody = {
      visible: false,
      owner_address: fromAddress,
      contract_address: contractAddr,
      function_selector: 'transfer(address,uint256)',
      parameter: [
        { type: 'address', value: toAddress },
        { type: 'uint256', value: String(amountRaw) },
      ],
    };

    // b) Estimate energy
    const estResp = await fetch(`${TRONGRID}/wallet/triggerconstantcontract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(triggerBody),
      signal: AbortSignal.timeout(15000),
    });

    if (!estResp.ok) {
      const errText = await estResp.text();
      return { success: false, error: `Energy estimate failed: ${estResp.status} ${errText}` };
    }

    const estData = await estResp.json();
    if (estData.result?.result === false) {
      return { success: false, error: `Contract call reverted: ${JSON.stringify(estData.result)}` };
    }

    const energyUsed = estData.energy_used || 100000;

    // c) TRX bakiyesi ve energyain_cost fixture
    const accountResp = await fetch(`${TRONGRID}/v1/accounts/${fromAddress}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const accountData = await accountResp.json();
    const trxBalance = accountData.data?.[0]?.balance || 0;

    // Energy cost ≈ energyUsed * 420 sun (base energy fee)
    const energyCostTRX = Math.ceil(energyUsed * 420 / 1_000_000);
    // Minimum bandwidth: 270 TRX drops
    const bandwidthCost = 270;
    const totalCostTRX = energyCostTRX + bandwidthCost;

    if (trxBalance < totalCostTRX) {
      return {
        success: false,
        error: `Yetersiz TRX (gas): ${trxBalance} TRX mevcut, ${totalCostTRX} TRX gerekli`,
      };
    }

    // d) Create transaction
    const createResp = await fetch(`${TRONGRID}/wallet/triggersmartcontract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...triggerBody,
        fee_limit: totalCostTRX,
        call_value: 0,
        owner_address: Buffer.from(fromAddress, 'base58').toString('hex'),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      return { success: false, error: `Create tx failed: ${createResp.status} ${errText}` };
    }

    const createData = await createResp.json();
    if (!createData.txid) {
      return { success: false, error: `No txid returned: ${JSON.stringify(createData)}` };
    }

    // e) Sign the transaction
    const txRaw = createData.txID
      ? createData.txID
      : createData.txid;

    // TronWeb-style signing
    const txToSign = createData.transaction || createData;
    const txBytes = Buffer.from(txToSign.raw_data_hex || '', 'hex');

    // Simple signing: keccak256 of raw_data + private key
    const sig = signer.signingKey.sign(txBytes);
    const signature = sig.r.slice(2) + sig.s.slice(2) + (sig.v.toString(16).padStart(2, '0'));

    // f) Broadcast
    const broadcastBody = {
      raw_data: txToSign.raw_data,
      raw_data_hex: txToSign.raw_data_hex,
      signatures: [signature],
    };

    const broadResp = await fetch(`${TRONGRID}/wallet/broadcasttransaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(broadcastBody),
      signal: AbortSignal.timeout(15000),
    });

    if (!broadResp.ok) {
      const errText = await broadResp.text();
      return { success: false, error: `Broadcast failed: ${broadResp.status} ${errText}` };
    }

    const broadData = await broadResp.json();

    if (broadData.result?.result === false || broadData.result === false) {
      return { success: false, error: `Broadcast rejected: ${JSON.stringify(broadData)}` };
    }

    const txHash = broadData.txid || txToSign.txID;
    console.log(`[crypto] transferUSDT: ${usdtAmount} USDT → ${toAddress} (tx: ${txHash})`);

    return { success: true, txHash };

  } catch (err) {
    console.error('[crypto] transferUSDT error:', err.message);
    return { success: false, error: err.message };
  }
}
