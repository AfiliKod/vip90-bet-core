import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setIO } from '../src/services/socketEmitter.js';
import {
  addRecentWinner, getRecentWinners,
  emitGameUpdate, emitSpinResult,
  subscribeToGameStream, initializeGameStream,
} from '../src/services/liveGameStream.js';

function fakeIO() {
  const emitted = [];
  const nsEmitted = [];
  const io = {
    emit: (event, payload) => emitted.push({ event, payload }),
    of: (ns) => ({
      to: () => ({
        emit: (event, payload) => nsEmitted.push({ ns, event, payload }),
      }),
    }),
  };
  return { io, emitted, nsEmitted };
}

describe('liveGameStream', () => {
  beforeEach(() => setIO(null));

  describe('addRecentWinner / getRecentWinners', () => {
    it('should prepend new winners and respect MAX_WINNERS=50 bound', () => {
      for (let i = 0; i < 55; i++) {
        addRecentWinner({ userId: `u${i}`, username: `player${i}`, gameId: 'inhouse-dice', gameTitle: 'Dice', amount: 10 });
      }
      const all = getRecentWinners(100);
      assert.equal(all.length, 50);
      // En son eklenen en başta olmalı (unshift)
      assert.equal(all[0].username, 'player54');
    });

    it('should default currency to TRY and stamp a timestamp', () => {
      addRecentWinner({ userId: 'u1', username: 'test', gameId: 'inhouse-mines', gameTitle: 'Mines', amount: 5 });
      const [entry] = getRecentWinners(1);
      assert.equal(entry.currency, 'TRY');
      assert.ok(typeof entry.timestamp === 'number');
    });

    it('should broadcast on the root namespace (winners:new) so guests/logged-in root socket both receive it', () => {
      const { io, emitted } = fakeIO();
      setIO(io);
      addRecentWinner({ userId: 'u1', username: 'test', gameId: 'inhouse-dice', gameTitle: 'Dice', amount: 5 });
      const found = emitted.find(e => e.event === 'winners:new');
      assert.ok(found, 'winners:new kök namespace üzerinden emit edilmeli');
    });
  });

  describe('emitGameUpdate / emitSpinResult — /live namespace', () => {
    it('should emit game:update on the /live namespace when the stream has subscribers', () => {
      const { io, nsEmitted } = fakeIO();
      setIO(io);
      initializeGameStream('inhouse-crash');
      subscribeToGameStream('socket-1', 'inhouse-crash');
      emitGameUpdate('inhouse-crash', { multiplier: 1.5 });
      const found = nsEmitted.find(e => e.event === 'game:update');
      assert.ok(found, 'game:update /live namespace üzerinden emit edilmeli');
      assert.equal(found.ns, '/live');
    });

    it('should emit game:spinResult on the /live namespace', () => {
      const { io, nsEmitted } = fakeIO();
      setIO(io);
      emitSpinResult('inhouse-roulette', { number: 17 });
      const found = nsEmitted.find(e => e.event === 'game:spinResult');
      assert.ok(found);
      assert.equal(found.ns, '/live');
    });
  });
});
