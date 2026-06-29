import { createHash } from 'crypto';
import { HDNodeWallet, Mnemonic } from 'ethers';

const TRONGRID   = 'https://api.trongrid.io';
const USDT_TRC20 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT mainnet TRC20

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
