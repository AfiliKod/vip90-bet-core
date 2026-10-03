// server/test/demoData-agentSeed.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Agent from '../src/models/Agent.js';
import ReferralCommission from '../src/models/ReferralCommission.js';
import * as agentSeed from '../src/services/demoData/agentSeed.js';

describe('demoData/agentSeed', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_agents');
  });
  after(async () => {
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await User.deleteMany({});
    await Agent.deleteMany({});
    await ReferralCommission.deleteMany({});
  });

  it('load(N) N agent üretir, her birine 5-15 kullanıcı atanır, her agent kullanıcısı benzersizdir', async () => {
    const result = await agentSeed.load(3);
    assert.equal(result.created, 3);
    const agents = await Agent.find({ isSeed: true });
    assert.equal(agents.length, 3);
    const userIds = agents.map(a => String(a.userId));
    assert.equal(new Set(userIds).size, 3, 'her agent kullanıcısı benzersiz olmalı');
    for (const a of agents) assert.ok(a.players.length >= 5 && a.players.length <= 15);
  });

  it('tekrar load() önceki agent kullanıcılarını tekrar seçmez (unique constraint ihlali olmaz)', async () => {
    await agentSeed.load(3);
    await agentSeed.load(3);
    const count = await Agent.countDocuments({ isSeed: true });
    assert.equal(count, 6);
  });

  it('clear() agent\'ları ve komisyonları siler', async () => {
    await agentSeed.load(2);
    const result = await agentSeed.clear();
    assert.equal(result.deleted, 2);
    assert.equal(await Agent.countDocuments({}), 0);
    assert.equal(await ReferralCommission.countDocuments({}), 0);
  });

  it('liveTick() null döner (kapsam dışı)', async () => {
    assert.equal(await agentSeed.liveTick(), null);
  });
});
