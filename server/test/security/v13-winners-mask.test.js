import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRecentWinner, getRecentWinners, maskUsername } from '../../src/services/liveGameStream.js';

describe('V13 live winners identity masking', () => {
  it('real winner is masked and carries no userId', () => {
    addRecentWinner({ userId: 'u-secret', username: 'AhmetYilmaz', gameId: 'g1', gameTitle: 'G', amount: 10 });
    const [w] = getRecentWinners();
    assert.equal(w.userId, undefined);
    assert.equal(w.username, 'Ah***');
    assert.match(w.id, /^[0-9a-f-]{36}$/);
    assert.ok(!JSON.stringify(w).includes('u-secret'));
  });

  it('synthetic winner looks the same as a real one (masked, no userId, no flag)', () => {
    addRecentWinner({ isSynthetic: true, userId: 'x', username: 'DemoUser', gameId: 'g1', gameTitle: 'G', amount: 10 });
    const [w] = getRecentWinners();
    assert.equal(w.username, 'De***');
    assert.equal(w.userId, undefined);
    assert.equal(w.isSynthetic, undefined);
  });

  it('maskUsername handles empty, short and undefined', () => {
    assert.equal(maskUsername(undefined), '***');
    assert.equal(maskUsername(''), '***');
    assert.equal(maskUsername('ab'), '***');
    assert.equal(maskUsername('abc'), 'ab***');
  });

  it('ids are unique per entry', () => {
    addRecentWinner({ username: 'abcdef', gameId: 'g', gameTitle: 'G', amount: 1 });
    addRecentWinner({ username: 'abcdef', gameId: 'g', gameTitle: 'G', amount: 1 });
    const [a, b] = getRecentWinners(2);
    assert.notEqual(a.id, b.id);
  });
});
