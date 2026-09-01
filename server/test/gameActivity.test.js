import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { getFavorites, toggleFavorite, getRecentlyPlayed, recordRecentlyPlayed } from '../src/controllers/users.js';

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('Favoriler / Son Oynananlar', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_gameActivity');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('toggleFavorite bir oyunu ekler, tekrar çağrılınca kaldırır', async () => {
    const user = await User.create({ username: 'favuser', email: 'fav@example.com', password: 'password123' });
    const req = { user: { id: String(user._id) }, validated: { gameId: 'sweet-bonanza', kind: 'palace' } };

    const res1 = mockRes();
    await toggleFavorite(req, res1, () => {});
    assert.equal(res1.body.favorites.length, 1);
    assert.equal(res1.body.favorites[0].gameId, 'sweet-bonanza');

    const res2 = mockRes();
    await toggleFavorite(req, res2, () => {});
    assert.equal(res2.body.favorites.length, 0);
  });

  it('getFavorites yalnızca kendi kullanıcısının favorilerini döner', async () => {
    const user = await User.create({
      username: 'favuser2', email: 'fav2@example.com', password: 'password123',
      favoriteGames: [{ gameId: '/games/crash', kind: 'inhouse' }],
    });
    const req = { user: { id: String(user._id) } };
    const res = mockRes();
    await getFavorites(req, res, () => {});
    assert.equal(res.body.favorites.length, 1);
    assert.equal(res.body.favorites[0].kind, 'inhouse');
  });

  it('recordRecentlyPlayed en yeniyi başa ekler ve aynı oyunu tekrarlamaz (dedupe)', async () => {
    const user = await User.create({ username: 'recuser', email: 'rec@example.com', password: 'password123' });
    const req = { user: { id: String(user._id) }, validated: { gameId: 'game-a', kind: 'palace' } };

    await recordRecentlyPlayed(req, mockRes(), () => {});
    req.validated = { gameId: 'game-b', kind: 'palace' };
    await recordRecentlyPlayed(req, mockRes(), () => {});
    req.validated = { gameId: 'game-a', kind: 'palace' };
    const res = mockRes();
    await recordRecentlyPlayed(req, res, () => {});

    assert.equal(res.body.recentlyPlayed.length, 2);
    assert.equal(res.body.recentlyPlayed[0].gameId, 'game-a');
    assert.equal(res.body.recentlyPlayed[1].gameId, 'game-b');
  });

  it('recentlyPlayed son 20 kayıtla sınırlanır', async () => {
    const user = await User.create({ username: 'capuser', email: 'cap@example.com', password: 'password123' });
    const req = { user: { id: String(user._id) } };
    for (let i = 0; i < 25; i++) {
      req.validated = { gameId: `game-${i}`, kind: 'palace' };
      await recordRecentlyPlayed(req, mockRes(), () => {});
    }
    const res = mockRes();
    await getRecentlyPlayed(req, res, () => {});
    assert.equal(res.body.recentlyPlayed.length, 20);
    assert.equal(res.body.recentlyPlayed[0].gameId, 'game-24');
  });
});
