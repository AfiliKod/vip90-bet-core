import { test, describe } from 'node:test';
import assert from 'node:assert';
import { feedForEvent, assertFeedFresh } from '../src/utils/bettingGate.js';

/** Verilen feed'i bayat sayan sahte kapı. */
const blocks = staleFeed => feed => feed === staleFeed;
const blocksNothing = () => false;

describe('feedForEvent', () => {
  test('canlı etkinlik live feed’ine bağlıdır', () => {
    assert.strictEqual(feedForEvent('live'), 'live');
  });

  test('yaklaşan etkinlik upcomingOdds feed’ine bağlıdır', () => {
    assert.strictEqual(feedForEvent('upcoming'), 'upcomingOdds');
  });

  test('bahse kapalı durumlar hiçbir feed’e bağlanmaz', () => {
    assert.strictEqual(feedForEvent('finished'), null);
    assert.strictEqual(feedForEvent('cancelled'), null);
  });

  test('bilinmeyen durum için feed üretmez', () => {
    assert.strictEqual(feedForEvent(undefined), null);
  });
});

describe('assertFeedFresh', () => {
  test('feed bayatken 503 FEED_STALE fırlatır', () => {
    assert.throws(
      () => assertFeedFresh({ status: 'live' }, blocks('live')),
      err => err.status === 503 && err.code === 'FEED_STALE',
    );
  });

  test('bayat feed başka bir feed’e ait etkinliği engellemez', () => {
    assert.doesNotThrow(() => assertFeedFresh({ status: 'upcoming' }, blocks('live')));
  });

  test('feed sağlıklıyken geçirir', () => {
    assert.doesNotThrow(() => assertFeedFresh({ status: 'live' }, blocksNothing));
  });

  test('feed’e bağlı olmayan etkinlikte kapı devreye girmez', () => {
    assert.doesNotThrow(() => assertFeedFresh({ status: 'finished' }, blocks('live')));
  });

  test('hata mesajı kullanıcıya anlaşılır düşer', () => {
    assert.throws(
      () => assertFeedFresh({ status: 'upcoming' }, blocks('upcomingOdds')),
      /bahis geçici olarak kapalı/,
    );
  });
});
