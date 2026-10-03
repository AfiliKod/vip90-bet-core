import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import AuditLog from '../src/models/AuditLog.js';
import User from '../src/models/User.js';
import { logAuditEvent, getAuditLogs, getAuditStats, getAuditLogsForTarget } from '../src/services/audit.js';

describe('Audit Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_audit');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await AuditLog.deleteMany({});
    await User.deleteMany({});
  });

  describe('logAuditEvent', () => {
    it('should log an audit event', async () => {
      const admin = await User.create({ 
        username: 'admin', 
        email: 'admin@test.com', 
        password: 'pass123',
        role: 'admin'
      });

      const event = await logAuditEvent({
        actorId: admin._id,
        actorType: 'admin',
        actorUsername: 'admin',
        action: 'USER_UPDATE',
        category: 'player',
        targetType: 'user',
        targetId: 'user123',
        before: { balance: 100 },
        after: { balance: 200 },
        reason: 'Manual adjustment',
      });

      assert.ok(event._id);
      assert.equal(event.action, 'USER_UPDATE');
      assert.equal(event.category, 'player');
    });
  });

  describe('getAuditLogs', () => {
    it('should return paginated audit logs', async () => {
      const admin = await User.create({ 
        username: 'admin', 
        email: 'admin@test.com', 
        password: 'pass123',
        role: 'admin'
      });

      for (let i = 0; i < 5; i++) {
        await logAuditEvent({
          actorId: admin._id,
          actorType: 'admin',
          actorUsername: 'admin',
          action: `ACTION_${i}`,
          category: 'system',
          targetType: 'system',
        });
      }

      const result = await getAuditLogs({ page: 1, limit: 3 });

      assert.equal(result.logs.length, 3);
      assert.equal(result.total, 5);
    });

    it('should filter by category', async () => {
      const admin = await User.create({ 
        username: 'admin', 
        email: 'admin@test.com', 
        password: 'pass123',
        role: 'admin'
      });

      await logAuditEvent({ actorId: admin._id, actorType: 'admin', actorUsername: 'admin', action: 'ACTION_1', category: 'finance', targetType: 'system' });
      await logAuditEvent({ actorId: admin._id, actorType: 'admin', actorUsername: 'admin', action: 'ACTION_2', category: 'player', targetType: 'system' });

      const result = await getAuditLogs({ category: 'finance' });

      assert.equal(result.logs.length, 1);
    });
  });

  describe('getAuditStats', () => {
    it('should return audit statistics', async () => {
      const admin = await User.create({ 
        username: 'admin', 
        email: 'admin@test.com', 
        password: 'pass123',
        role: 'admin'
      });

      await logAuditEvent({ actorId: admin._id, actorType: 'admin', actorUsername: 'admin', action: 'ACTION_1', category: 'finance', targetType: 'system' });
      await logAuditEvent({ actorId: admin._id, actorType: 'admin', actorUsername: 'admin', action: 'ACTION_2', category: 'player', targetType: 'system' });

      const stats = await getAuditStats();

      assert.ok(Array.isArray(stats));
      assert.ok(stats.length >= 1);
    });
  });

  describe('getAuditLogsForTarget', () => {
    it('should return audit logs for specific target', async () => {
      const admin = await User.create({ 
        username: 'admin', 
        email: 'admin@test.com', 
        password: 'pass123',
        role: 'admin'
      });

      await logAuditEvent({ actorId: admin._id, actorType: 'admin', actorUsername: 'admin', action: 'ACTION_1', category: 'player', targetType: 'user', targetId: 'user123' });
      await logAuditEvent({ actorId: admin._id, actorType: 'admin', actorUsername: 'admin', action: 'ACTION_2', category: 'player', targetType: 'user', targetId: 'user456' });

      const result = await getAuditLogsForTarget('user', 'user123');

      assert.equal(result.length, 1);
    });
  });
});
