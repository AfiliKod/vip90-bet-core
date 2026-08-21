import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createLicenseStore } from '../src/services/licensing/registry.js';

// ─── Yardımcılar ────────────────────────────────────────────────────

const T0 = 1_000_000; // sabit başlangıç zamanı

/** Zamanı elle ilerletilebilir sahte saat. */
function fakeClock(start = T0) {
  let t = start;
  return {
    now: () => t,
    advance: ms => { t += ms; },
  };
}

const validState = (expiresAt = null) => ({ betting: { valid: true, expiresAt } });

describe('createLicenseStore — canlı sorgu', () => {
  test('merkez erişilebilirse durumu aynen yansıtır', async () => {
    const clock = fakeClock();
    const store = createLicenseStore({
      fetchLicenseState: async () => validState(),
      now: clock.now,
    });
    assert.strictEqual(await store.isLicensed('betting'), true);
    assert.strictEqual(await store.isLicensed('casino-content'), false);
  });

  test('lisans süresi dolmuşsa canlı yanıtta da kapalıdır (süre dolunca kapanır)', async () => {
    const clock = fakeClock();
    const store = createLicenseStore({
      fetchLicenseState: async () => validState(T0 - 1), // expiresAt geçmişte
      now: clock.now,
    });
    assert.strictEqual(await store.isLicensed('betting'), false);
  });

  test('TTL içinde tekrar sorgu merkezeye gitmez, invalidate() zorlar', async () => {
    const clock = fakeClock();
    let calls = 0;
    const store = createLicenseStore({
      fetchLicenseState: async () => { calls++; return validState(); },
      now: clock.now,
      ttlMs: 30_000,
    });
    await store.isLicensed('betting');
    await store.isLicensed('betting');
    assert.strictEqual(calls, 1);
    store.invalidate();
    await store.isLicensed('betting');
    assert.strictEqual(calls, 2);
  });
});

describe('createLicenseStore — çevrimdışı tolerans (modules\'tan FARKLI yön)', () => {
  test('ÖNCE GEÇERLİ durum yokken ağ koparsa fail-CLOSED (modules ile aynı)', async () => {
    const clock = fakeClock();
    const store = createLicenseStore({
      fetchLicenseState: async () => { throw new Error('ağ yok'); },
      now: clock.now,
      graceMs: 60_000,
    });
    assert.strictEqual(await store.isLicensed('betting'), false);
  });

  test('KRİTİK FARK: bilinen geçerli durum + ağ koptu + grace İÇİNDE → lisans sürer', async () => {
    const clock = fakeClock();
    let shouldFail = false;
    const store = createLicenseStore({
      fetchLicenseState: async () => {
        if (shouldFail) throw new Error('ağ yok');
        return validState();
      },
      now: clock.now,
      ttlMs: 10_000,
      graceMs: 60_000,
    });

    await store.isLicensed('betting'); // canlı yanıt önbelleğe düştü
    clock.advance(5_000);              // TTL doldu → yeni sorgu gerekir
    shouldFail = true;                 // merkez artık erişilemez
    // modules/registry.js burada fail-closed ile KAPATIRDI;
    // licensing son bilinen geçerli durumu korur:
    assert.strictEqual(await store.isLicensed('betting'), true);
  });

  test('grace penceresi dolarsa artık güvenilmez → kapalı', async () => {
    const clock = fakeClock();
    let shouldFail = false;
    const store = createLicenseStore({
      fetchLicenseState: async () => {
        if (shouldFail) throw new Error('ağ yok');
        return validState();
      },
      now: clock.now,
      ttlMs: 10_000,
      graceMs: 60_000,
    });

    await store.isLicensed('betting');
    clock.advance(5_000);
    shouldFail = true;
    clock.advance(61_000); // son doğrulamanın üzerinden grace kadar geçti
    assert.strictEqual(await store.isLicensed('betting'), false);
  });

  test('çevrimdışıyken bile lisans SÜRESİ dolursa modül kapanır', async () => {
    const clock = fakeClock();
    let shouldFail = false;
    const store = createLicenseStore({
      fetchLicenseState: async () => {
        if (shouldFail) throw new Error('ağ yok');
        return validState(T0 + 30_000); // lisans 30sn sonra doluyor
      },
      now: clock.now,
      ttlMs: 10_000,
      graceMs: 600_000, // grace uzun — ama süre kontrolü bağımsız çalışmalı
    });

    await store.isLicensed('betting'); // canlı: geçerli
    clock.advance(5_000);
    shouldFail = true;
    clock.advance(20_000); // toplam 25sn — grace içinde ama lisansın 5sn'i kaldı
    assert.strictEqual(await store.isLicensed('betting'), true);
    clock.advance(10_000); // toplam 35sn — expiresAt geçildi (ağ hâlâ kopuk)
    assert.strictEqual(await store.isLicensed('betting'), false);
  });

  test('ağ gelince taze durum önbelleği yeniler (toparlanma)', async () => {
    const clock = fakeClock();
    let mode = 'ok';
    const store = createLicenseStore({
      fetchLicenseState: async () => {
        if (mode === 'fail') throw new Error('ağ yok');
        if (mode === 'revoked') return { betting: { valid: false, expiresAt: null } };
        return validState();
      },
      now: clock.now,
      ttlMs: 10_000,
      graceMs: 600_000,
    });

    await store.isLicensed('betting');
    clock.advance(15_000);
    mode = 'fail';
    await store.isLicensed('betting'); // cache'ten sürer
    clock.advance(15_000);
    mode = 'revoked';                  // merkez geri döndü: lisans iptal edilmiş
    assert.strictEqual(await store.isLicensed('betting'), false);
  });
});

describe('createLicenseStore — gözlemlenebilirlik', () => {
  test('list() kaynak bilgisini taşır: live / cached / closed', async () => {
    const clock = fakeClock();
    let shouldFail = false;
    const store = createLicenseStore({
      fetchLicenseState: async () => {
        if (shouldFail) throw new Error('ağ yok');
        return validState();
      },
      now: clock.now,
      ttlMs: 10_000,
      graceMs: 60_000,
    });

    await store.list();
    clock.advance(15_000);
    shouldFail = true;
    let list = await store.list();
    assert.strictEqual(list.find(m => m.id === 'betting').source, 'cached');

    clock.advance(61_000); // grace doldu
    list = await store.list();
    assert.strictEqual(list.find(m => m.id === 'betting').source, 'closed');
  });
});
