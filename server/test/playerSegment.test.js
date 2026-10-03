import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import PlayerSegment from '../src/models/PlayerSegment.js';
import User from '../src/models/User.js';
import { 
  createSegment, 
  getSegments, 
  updateSegment, 
  deleteSegment, 
  getSegmentPlayers,
  getSegmentStats 
} from '../src/services/playerSegment.js';

describe('Player Segment Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_segment');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await PlayerSegment.deleteMany({});
    await User.deleteMany({});
  });

  describe('createSegment', () => {
    it('should create a new segment', async () => {
      const segment = await createSegment({
        name: 'High Rollers',
        slug: 'high-rollers',
        description: 'Players with high balance',
        criteria: {
          balance: { min: 10000 },
        },
      });

      assert.ok(segment._id);
      assert.equal(segment.name, 'High Rollers');
      assert.equal(segment.slug, 'high-rollers');
    });

    it('should reject duplicate slug', async () => {
      await createSegment({ name: 'Segment 1', slug: 'duplicate-slug' });

      try {
        await createSegment({ name: 'Segment 2', slug: 'duplicate-slug' });
        assert.fail('Should have thrown error');
      } catch (error) {
        // MongoDB duplicate key error
        assert.ok(error.code === 11000 || error.message.includes('duplicate'));
      }
    });
  });

  describe('getSegments', () => {
    it('should return paginated segments', async () => {
      await createSegment({ name: 'Segment 1', slug: 'seg-1' });
      await createSegment({ name: 'Segment 2', slug: 'seg-2' });
      await createSegment({ name: 'Segment 3', slug: 'seg-3' });

      const result = await getSegments({ page: 1, limit: 2 });

      assert.equal(result.segments.length, 2);
      assert.equal(result.total, 3);
    });
  });

  describe('updateSegment', () => {
    it('should update segment', async () => {
      const segment = await createSegment({
        name: 'Original Name',
        slug: 'original',
      });

      const updated = await updateSegment(segment._id, {
        name: 'Updated Name',
      });

      assert.equal(updated.name, 'Updated Name');
    });
  });

  describe('deleteSegment', () => {
    it('should delete segment', async () => {
      const segment = await createSegment({
        name: 'To Delete',
        slug: 'to-delete',
      });

      await deleteSegment(segment._id);

      const found = await PlayerSegment.findById(segment._id);
      assert.equal(found, null);
    });
  });

  describe('getSegmentPlayers', () => {
    it('should return players matching segment criteria', async () => {
      await User.create({ username: 'rich1', email: 'rich1@test.com', password: 'pass', balance: 50000 });
      await User.create({ username: 'rich2', email: 'rich2@test.com', password: 'pass', balance: 30000 });
      await User.create({ username: 'poor', email: 'poor@test.com', password: 'pass', balance: 100 });

      const segment = await createSegment({
        name: 'Rich Players',
        slug: 'rich-players',
        criteria: {
          balance: { min: 10000 },
        },
      });

      const result = await getSegmentPlayers(segment._id);

      assert.equal(result.players.length, 2);
      assert.equal(result.total, 2);
    });
  });

  describe('getSegmentStats', () => {
    it('should return segment statistics', async () => {
      await User.create({ username: 'user1', email: 'user1@test.com', password: 'pass', balance: 1000, totalWagered: 5000 });
      await User.create({ username: 'user2', email: 'user2@test.com', password: 'pass', balance: 2000, totalWagered: 8000 });

      const segment = await createSegment({
        name: 'All Users',
        slug: 'all-users',
        criteria: {},
      });

      const stats = await getSegmentStats(segment._id);

      assert.equal(stats.playerCount, 2);
      assert.ok(stats.totalBalance > 0);
    });
  });
});
