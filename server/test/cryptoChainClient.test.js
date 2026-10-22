/**
 * Zincir istemcisinin yanıt sınıflandırması (ağ taklit edilir). Yayın sonucu
 * ve işlem durumu, kripto çekiminin iade edilip edilmeyeceğini belirler:
 * yalnız kesin yanıtlar "gönderilmedi" sayılmalı.
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { broadcastUSDTTransfer, getUSDTTransferStatus } from '../src/services/cryptoService.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const reply = (body, { status = 200 } = {}) => { globalThis.fetch = async () => new Response(JSON.stringify(body), { status }); };

describe('broadcastUSDTTransfer', () => {
  it('result:true → accepted', async () => {
    reply({ result: true, txid: 'ab' });
    assert.equal((await broadcastUSDTTransfer({ txID: 'ab' })).status, 'accepted');
  });
  it('DUP_TRANSACTION_ERROR → accepted (işlem zaten düğümde)', async () => {
    reply({ code: 'DUP_TRANSACTION_ERROR', message: '' });
    assert.equal((await broadcastUSDTTransfer({})).status, 'accepted');
  });
  it('açık hata kodu → rejected, mesaj hex\'ten çözülür', async () => {
    reply({ code: 'CONTRACT_VALIDATE_ERROR', message: Buffer.from('yetersiz bakiye').toString('hex') });
    const r = await broadcastUSDTTransfer({});
    assert.equal(r.status, 'rejected');
    assert.match(r.error, /CONTRACT_VALIDATE_ERROR: yetersiz bakiye/);
  });
  it('ağ hatası / HTTP hatası / beklenmeyen yanıt → unknown (iade edilmemeli)', async () => {
    globalThis.fetch = async () => { throw new Error('ETIMEDOUT'); };
    assert.equal((await broadcastUSDTTransfer({})).status, 'unknown');
    reply({}, { status: 502 });
    assert.equal((await broadcastUSDTTransfer({})).status, 'unknown');
    reply({ weird: 1 });
    assert.equal((await broadcastUSDTTransfer({})).status, 'unknown');
  });
});

describe('getUSDTTransferStatus', () => {
  it('boş yanıt → not_found', async () => {
    reply({});
    assert.equal(await getUSDTTransferStatus('ab'), 'not_found');
  });
  it('receipt SUCCESS → success', async () => {
    reply({ id: 'ab', receipt: { result: 'SUCCESS' } });
    assert.equal(await getUSDTTransferStatus('ab'), 'success');
  });
  it('REVERT / OUT_OF_ENERGY / result FAILED → failed', async () => {
    for (const body of [{ id: 'ab', receipt: { result: 'REVERT' } }, { id: 'ab', receipt: { result: 'OUT_OF_ENERGY' } }, { id: 'ab', result: 'FAILED', receipt: {} }]) {
      reply(body);
      assert.equal(await getUSDTTransferStatus('ab'), 'failed', JSON.stringify(body));
    }
  });
  it('ağ hatasında hata atar (sonuç bilinmiyor; karar verilmez)', async () => {
    reply({}, { status: 503 });
    await assert.rejects(() => getUSDTTransferStatus('ab'));
  });
});
