import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createSyncHealth, WARMUP_MS } from '../src/services/syncHealth.js';

const MIN = 60 * 1000;

/** Sahte saat + toplanan alarmlarla izole bir örnek kurar. */
function setup() {
  let now = 1_000_000;
  const alerts = [];
  const health = createSyncHealth({
    now: () => now,
    onAlert: a => alerts.push(a),
  });
  return {
    health,
    alerts,
    advance: ms => { now += ms; },
  };
}

describe('warmup', () => {
  test('hiç rapor gelmeden warmup durumundadır', () => {
    const { health } = setup();
    assert.strictEqual(health.getFeedState('live'), 'warmup');
  });

  test('warmup sırasında bahis engellenmez', () => {
    const { health, advance } = setup();
    advance(WARMUP_MS - 1);
    assert.strictEqual(health.isBettingBlocked('live'), false);
  });

  test('warmup sırasında alarm üretilmez', () => {
    const { health, alerts, advance } = setup();
    advance(WARMUP_MS - 1);
    health.evaluate();
    assert.strictEqual(alerts.length, 0);
  });

  test('warmup bitince ama uyarı eşiği dolmadan hâlâ ok kalır', () => {
    const { health, advance } = setup();
    advance(WARMUP_MS + 1);
    assert.strictEqual(health.getFeedState('live'), 'ok');
  });

  test('hiç başarı gelmezse uyarı eşiğinde stale olur', () => {
    const { health, advance } = setup();
    advance(3 * MIN);
    assert.strictEqual(health.getFeedState('live'), 'stale');
  });

  test('bir kez başarı gelince warmup biter', () => {
    const { health } = setup();
    health.reportOk('live');
    assert.strictEqual(health.getFeedState('live'), 'ok');
  });
});

describe('stale eşikleri', () => {
  test('uyarı eşiği altında ok kalır', () => {
    const { health, advance } = setup();
    health.reportOk('live');
    advance(3 * MIN - 1);
    assert.strictEqual(health.getFeedState('live'), 'ok');
  });

  test('uyarı eşiğinde stale olur ama bahis henüz engellenmez', () => {
    const { health, advance } = setup();
    health.reportOk('live');
    advance(3 * MIN);
    assert.strictEqual(health.getFeedState('live'), 'stale');
    assert.strictEqual(health.isBettingBlocked('live'), false);
  });

  test('blok eşiğinde bahis engellenir', () => {
    const { health, advance } = setup();
    health.reportOk('live');
    advance(5 * MIN);
    assert.strictEqual(health.isBettingBlocked('live'), true);
  });

  test('upcomingOdds kendi (daha geniş) eşiklerini kullanır', () => {
    const { health, advance } = setup();
    health.reportOk('upcomingOdds');
    advance(10 * MIN);
    assert.strictEqual(health.getFeedState('upcomingOdds'), 'ok', '10 dk upcoming için normal');
    advance(20 * MIN); // 30 dk
    assert.strictEqual(health.getFeedState('upcomingOdds'), 'stale');
    assert.strictEqual(health.isBettingBlocked('upcomingOdds'), false);
    advance(15 * MIN); // 45 dk
    assert.strictEqual(health.isBettingBlocked('upcomingOdds'), true);
  });
});

describe('alarm üretimi', () => {
  test('stale geçişinde tam olarak bir alarm üretir', () => {
    const { health, alerts, advance } = setup();
    health.reportOk('live');
    advance(3 * MIN);
    health.reportFail('live', new Error('fetch failed'));
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].feed, 'live');
    assert.strictEqual(alerts[0].state, 'stale');
  });

  test('stale devam ederken tekrar alarm üretmez', () => {
    const { health, alerts, advance } = setup();
    health.reportOk('live');
    advance(3 * MIN);
    // Gerçek kesinti 1483 ardışık hata üretmişti; tek alarma inmeli.
    for (let i = 0; i < 1483; i++) {
      advance(MIN);
      health.reportFail('live', new Error('fetch failed'));
      health.reportOk('upcomingOdds'); // bu feed sağlıklı kalsın, gürültü yapmasın
    }
    const liveAlerts = alerts.filter(a => a.feed === 'live');
    assert.strictEqual(liveAlerts.length, 1, '1483 başarısız turda hâlâ tek alarm');
  });

  test('toparlanınca recovered bildirimi üretir ve blok kalkar', () => {
    const { health, alerts, advance } = setup();
    health.reportOk('live');
    advance(6 * MIN);
    health.reportFail('live', new Error('fetch failed'));
    assert.strictEqual(health.isBettingBlocked('live'), true);

    health.reportOk('live');
    assert.strictEqual(health.isBettingBlocked('live'), false);
    assert.strictEqual(alerts.length, 2);
    assert.strictEqual(alerts[1].state, 'recovered');
  });

  test('job hiç rapor etmese bile evaluate() stale alarmı üretir', () => {
    const { health, alerts, advance } = setup();
    health.reportOk('live');
    advance(10 * MIN); // job tamamen asılı kaldı, reportFail bile gelmiyor
    health.evaluate();
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].state, 'stale');
  });

  test('alarm yükü teşhis için gereken alanları taşır', () => {
    const { health, alerts, advance } = setup();
    health.reportOk('live', { base: 'https://bet.oddsSource7191.com' });
    advance(4 * MIN);
    health.reportFail('live', new Error('fetch failed'), { base: 'https://bet.oddsSource7169.com' });
    const a = alerts[0];
    assert.strictEqual(a.feed, 'live');
    assert.ok(a.staleSeconds >= 240, `staleSeconds beklenenden küçük: ${a.staleSeconds}`);
    assert.strictEqual(a.consecutiveFailures, 1);
    assert.match(a.lastError, /fetch failed/);
    assert.strictEqual(a.base, 'https://bet.oddsSource7169.com');
  });
});

describe('feed izolasyonu', () => {
  test('bir feed bayatken diğeri etkilenmez', () => {
    const { health, advance } = setup();
    health.reportOk('live');
    health.reportOk('upcomingOdds');
    advance(6 * MIN);
    health.reportOk('upcomingOdds');

    assert.strictEqual(health.isBettingBlocked('live'), true);
    assert.strictEqual(health.isBettingBlocked('upcomingOdds'), false);
  });
});

describe('snapshot', () => {
  test('her iki feed için serileştirilebilir durum döner', () => {
    const { health, advance } = setup();
    health.reportOk('live', { base: 'https://bet.oddsSource7191.com' });
    advance(2 * MIN);
    const snap = health.snapshot();

    assert.strictEqual(snap.live.state, 'ok');
    assert.strictEqual(snap.live.staleSeconds, 120);
    assert.strictEqual(snap.live.bettingBlocked, false);
    assert.strictEqual(snap.domain, 'https://bet.oddsSource7191.com');
    assert.ok(snap.upcomingOdds, 'upcomingOdds da bulunmalı');
    assert.doesNotThrow(() => JSON.stringify(snap));
  });
});

describe('dayanıklılık', () => {
  test('bilinmeyen feed adı throw etmez', () => {
    const { health } = setup();
    assert.doesNotThrow(() => health.reportOk('yokboyle'));
    assert.strictEqual(health.isBettingBlocked('yokboyle'), false, 'bilinmeyen feed bahsi engellemez');
  });

  test('onAlert patlarsa raporlama akışı bozulmaz', () => {
    let now = 1_000_000;
    const health = createSyncHealth({
      now: () => now,
      onAlert: () => { throw new Error('webhook down'); },
    });
    health.reportOk('live');
    now += 6 * MIN;
    assert.doesNotThrow(() => health.reportFail('live', new Error('fetch failed')));
  });
});
