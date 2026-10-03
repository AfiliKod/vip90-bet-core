import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import cryptoRouter from '../src/routes/crypto.js';
import { errorHandler } from '../src/middleware/error.js';
import { getHotWalletBalance, getHotWalletAddress } from '../src/services/cryptoService.js';

const TEST_MNEMONIC = 'test test test test test test test test test test test junk';

// Rotanın son handler'ı (requireAdmin sonrası); auth zinciri bu testin konusu değil.
function hotWalletHandler() {
  const layer = cryptoRouter.stack.find(l => l.route?.path === '/hot-wallet-balance' && l.route.methods.get);
  assert.ok(layer, 'GET /hot-wallet-balance rotası bulunamadı');
  return layer.route.stack.at(-1).handle;
}

async function callRoute() {
  const out = { status: 200, body: null };
  const res = {
    status(c) { out.status = c; return this; },
    json(b) { out.body = b; return this; },
  };
  let err = null;
  await hotWalletHandler()({ user: { id: 'x' } }, res, (e) => { err = e; });
  if (err) errorHandler(err, {}, res, () => {});
  return out;
}

describe('GET /api/crypto/hot-wallet-balance', () => {
  const saved = {};
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    for (const k of ['CRYPTO_SEED_PHRASE', 'HOT_WALLET_PRIVATE_KEY']) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it('hesap zincirde yoksa hata vermez: activated:false ve sıfır bakiye', async () => {
    process.env.CRYPTO_SEED_PHRASE = TEST_MNEMONIC;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [], success: true }) });
    const out = await callRoute();
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { address: getHotWalletAddress(), usdt: 0, trx: 0, activated: false });
  });

  it('hesap varsa USDT ve TRX bakiyesi döner, activated:true', async () => {
    process.env.CRYPTO_SEED_PHRASE = TEST_MNEMONIC;
    let calledUrl = '';
    globalThis.fetch = async (url) => {
      calledUrl = String(url);
      return { ok: true, json: async () => ({ data: [{ balance: 5_500_000, trc20: [{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '12500000' }] }] }) };
    };
    const bal = await getHotWalletBalance();
    assert.match(calledUrl, /\/v1\/accounts\/T[A-Za-z0-9]{33}$/);
    assert.equal(bal.usdt, 12.5);
    assert.equal(bal.trx, 5.5);
    assert.equal(bal.activated, true);
  });

  it('TronGrid hata durumu (ok:false) hâlâ hata fırlatır', async () => {
    process.env.CRYPTO_SEED_PHRASE = TEST_MNEMONIC;
    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    await assert.rejects(getHotWalletBalance(), /TronGrid hata: 429/);
  });

  it('seed/anahtar tanımlı değilse 503 CRYPTO_WALLET_NOT_CONFIGURED döner', async () => {
    let fetched = false;
    globalThis.fetch = async () => { fetched = true; return { ok: true, json: async () => ({}) }; };
    const out = await callRoute();
    assert.equal(out.status, 503);
    assert.equal(out.body.error.code, 'CRYPTO_WALLET_NOT_CONFIGURED');
    assert.ok(out.body.error.message);
    assert.equal(fetched, false);
  });
});
